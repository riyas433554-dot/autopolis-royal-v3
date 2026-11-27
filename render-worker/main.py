import asyncio
import base64
import hmac
import json
import os
import shutil
import sqlite3
import subprocess
import tempfile
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal
from urllib.parse import quote

import requests
from gradio_client import Client
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field, HttpUrl, field_validator

DB_PATH = os.getenv("RENDER_WORKER_DB", "/data/render-worker.sqlite")
AI_STUDIO_URL = os.getenv("AI_VIDEO_STUDIO_URL", "http://127.0.0.1:7860").rstrip("/")
MAX_VIDEO_BYTES = 100 * 1024 * 1024
MAX_SOURCE_BYTES = 1024 * 1024 * 1024


class RenderJobRequest(BaseModel):
    task_id: int = Field(gt=0)
    title: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=5000)
    deliverable_type: Literal["video", "reel", "anime", "movie"]
    script: str = Field(min_length=1, max_length=120000)
    profile: str = Field(default="cinematic", max_length=40)
    callback_url: HttpUrl

    @field_validator("title", "script")
    @classmethod
    def reject_blank_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("value must not be blank")
        return value


def init_db():
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as db:
        db.execute("""
            create table if not exists jobs (
                job_id text primary key,
                idempotency_key text not null unique,
                task_id integer not null,
                payload text not null,
                status text not null,
                result text,
                error text,
                created_at integer not null,
                updated_at integer not null
            )
        """)
        db.execute("create index if not exists jobs_status_created on jobs(status, created_at)")


def authorized(auth: str | None) -> bool:
    expected = os.getenv("VIDEO_RENDERER_TOKEN", "")
    return bool(expected and auth and hmac.compare_digest(auth, "Bearer " + expected))


def check_callback_url(value: str) -> str:
    from urllib.parse import urlparse
    parsed = urlparse(value)
    local_http = parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1"}
    if parsed.scheme != "https" and not local_http:
        raise ValueError("callback_url must use HTTPS")
    if parsed.username or parsed.password:
        raise ValueError("callback_url must not contain credentials")
    return value


def get_job(job_id: str):
    with sqlite3.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        row = db.execute("select * from jobs where job_id=?", (job_id,)).fetchone()
        return dict(row) if row else None


def enqueue_job(idempotency_key: str, payload: dict):
    now = int(time.time())
    with sqlite3.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        existing = db.execute("select * from jobs where idempotency_key=?", (idempotency_key,)).fetchone()
        if existing:
            if existing["status"] == "failed":
                db.execute("update jobs set status='queued',error=null,updated_at=? where job_id=?", (now, existing["job_id"]))
                return existing["job_id"], "queued"
            return existing["job_id"], existing["status"]
        job_id = str(uuid.uuid4())
        db.execute(
            "insert into jobs(job_id,idempotency_key,task_id,payload,status,created_at,updated_at) values(?,?,?,?,?,?,?)",
            (job_id, idempotency_key, payload["task_id"], json.dumps(payload), "queued", now, now),
        )
        return job_id, "queued"


def _studio_request(method: str, path: str, **kwargs):
    response = requests.request(method, AI_STUDIO_URL + path, timeout=60, **kwargs)
    if not response.ok:
        raise RuntimeError(f"AI Video Studio API {method} {path} returned HTTP {response.status_code}: {response.text[:300]}")
    return response


def _split_tts_text(text: str, limit: int = 3600) -> list[str]:
    words = text.split()
    chunks = []
    current = ""
    for word in words:
        candidate = (current + " " + word).strip()
        if len(candidate) > limit and current:
            chunks.append(current)
            current = word
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks


def _generate_voice_studio_audio(script: str, target: str):
    """Use the separate VoiceStudio local API for the final narration track."""
    base = os.getenv("VOICE_STUDIO_URL", "http://127.0.0.1:3900").rstrip("/")
    headers = {}
    api_key = os.getenv("VOICE_STUDIO_API_KEY", "").strip()
    if api_key:
        headers["authorization"] = "Bearer " + api_key
    model = os.getenv("VOICE_STUDIO_MODEL", "").strip()
    phone_mode = os.getenv("VOICE_STUDIO_TTS_MODE", os.getenv("VOICE_STUDIO_ASR_MODE", "standard")).strip().lower() == "phone"
    if not model and not phone_mode:
        raise RuntimeError("Set VOICE_STUDIO_MODEL for a server API, or use phone mode with a model selected in the VoiceStudio Android app")
    voice = os.getenv("VOICE_STUDIO_VOICE", "default").strip()
    language = os.getenv("VOICE_STUDIO_LANGUAGE", "").strip()
    chunks = _split_tts_text(script, limit=int(os.getenv("VOICE_STUDIO_TTS_CHUNK_CHARS", "1800")))
    if not chunks:
        raise RuntimeError("VoiceStudio narration script is empty")
    with tempfile.TemporaryDirectory(prefix="autopolis-voicestudio-") as temp:
        audio_paths = []
        for index, chunk in enumerate(chunks):
            body = {"input": chunk, "voice": voice, "response_format": "wav"}
            if model:
                body["model"] = model
            if language:
                body["language"] = language
            response = requests.post(base + "/v1/audio/speech", headers=headers, json=body, timeout=(20, 900))
            if not response.ok:
                raise RuntimeError(f"VoiceStudio TTS failed with HTTP {response.status_code}: {response.text[:300]}")
            if not response.content or not response.headers.get("content-type", "").lower().startswith("audio/"):
                raise RuntimeError("VoiceStudio did not return an audio/* response")
            chunk_path = os.path.join(temp, f"voice-{index:04d}.wav")
            with open(chunk_path, "wb") as output:
                output.write(response.content)
            audio_paths.append(chunk_path)
        if len(audio_paths) == 1:
            shutil.copyfile(audio_paths[0], target)
        else:
            concat_path = os.path.join(temp, "audio-list.txt")
            with open(concat_path, "w", encoding="utf-8") as listing:
                for audio_path in audio_paths:
                    listing.write("file " + json.dumps(audio_path) + "\n")
            subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "concat", "-safe", "0", "-i", concat_path,
                "-c:a", "pcm_s16le", "-ar", "24000", "-ac", "1", target,
            ], capture_output=True, text=True, timeout=1800, check=True)
    if not os.path.getsize(target):
        raise RuntimeError("VoiceStudio returned an empty narration WAV")


def _seconds_to_srt(value: float) -> str:
    milliseconds = max(0, int(round(value * 1000)))
    hours, remainder = divmod(milliseconds, 3600000)
    minutes, remainder = divmod(remainder, 60000)
    seconds, millis = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{millis:03d}"


def _phone_text_to_srt(text: str, start: float, duration: float, start_index: int = 1) -> str:
    import re
    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", text.strip()) if part.strip()]
    if not sentences:
        sentences = [text.strip()] if text.strip() else []
    if not sentences:
        return ""
    total_words = max(1, sum(len(sentence.split()) for sentence in sentences))
    cursor = start
    entries = []
    index = start_index
    for sentence in sentences:
        share = duration * len(sentence.split()) / total_words
        end = min(start + duration, cursor + share)
        entries.append(f"{index}\n{_seconds_to_srt(cursor)} --> {_seconds_to_srt(end)}\n{sentence}\n")
        index += 1
        cursor = end
    return "\n".join(entries)


def _transcribe_voice_studio_phone(audio_path: str, target: str, headers: dict) -> str | None:
    """Use VoiceStudio Android Phone Speech API, which accepts base64 PCM WAV <=30s."""
    base = os.getenv("VOICE_STUDIO_URL", "").rstrip("/")
    duration = _probe_audio_duration(audio_path)
    chunk_seconds = 25
    with tempfile.TemporaryDirectory(prefix="voicestudio-phone-asr-") as temp:
        all_srt = []
        next_caption_index = 1
        for index, offset in enumerate(range(0, int(duration) + 1, chunk_seconds)):
            chunk_path = os.path.join(temp, f"asr-{index:03d}.wav")
            subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-ss", str(offset), "-i", audio_path, "-t", str(chunk_seconds),
                "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", chunk_path,
            ], capture_output=True, text=True, timeout=180, check=True)
            if not os.path.isfile(chunk_path) or not os.path.getsize(chunk_path):
                break
            with open(chunk_path, "rb") as audio:
                encoded = base64.b64encode(audio.read()).decode("ascii")
            response = requests.post(
                base + "/v1/audio/transcriptions",
                headers=headers,
                json={"audio": encoded},
                timeout=(20, 600),
            )
            if not response.ok:
                raise RuntimeError(f"VoiceStudio phone ASR failed with HTTP {response.status_code}: {response.text[:300]}")
            try:
                data = response.json()
                text = data.get("text") or data.get("transcription") or ""
            except ValueError:
                text = response.text
            text = str(text).strip()
            if text:
                chunk_duration = min(chunk_seconds, max(0.1, duration - offset))
                caption_block = _phone_text_to_srt(text, float(offset), chunk_duration, next_caption_index)
                all_srt.append(caption_block)
                next_caption_index += len(caption_block.split("\n\n"))
    captions = "\n".join(part for part in all_srt if part).strip()
    if not captions:
        return None
    with open(target, "w", encoding="utf-8") as output:
        output.write(captions + "\n")
    return target


def _transcribe_voice_studio_audio(audio_path: str, target: str) -> str | None:
    """Transcribe captions with VoiceStudio server or its Android phone speech API."""
    base = os.getenv("VOICE_STUDIO_URL", "http://127.0.0.1:3900").rstrip("/")
    headers = {}
    api_key = os.getenv("VOICE_STUDIO_API_KEY", "").strip()
    if api_key:
        headers["authorization"] = "Bearer " + api_key
    if os.getenv("VOICE_STUDIO_ASR_MODE", "standard").strip().lower() == "phone":
        return _transcribe_voice_studio_phone(audio_path, target, headers)
    form_data = {"model": os.getenv("VOICE_STUDIO_ASR_MODEL", "whisper-1"), "response_format": "srt"}
    language = os.getenv("VOICE_STUDIO_LANGUAGE", "").strip()
    if language:
        form_data["language"] = language
    with open(audio_path, "rb") as audio:
        response = requests.post(
            base + "/v1/audio/transcriptions",
            headers=headers,
            data=form_data,
            files={"file": ("narration.wav", audio, "audio/wav")},
            timeout=(20, 1800),
        )
    if not response.ok:
        raise RuntimeError(f"VoiceStudio ASR failed with HTTP {response.status_code}: {response.text[:300]}")
    captions = response.text.strip()
    if not captions:
        return None
    with open(target, "w", encoding="utf-8") as output:
        output.write(captions + "\\n")
    return target


def _probe_audio_duration(path: str) -> float:
    proc = subprocess.run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", path,
    ], capture_output=True, text=True, timeout=60, check=True)
    duration = float(proc.stdout.strip() or 0)
    if duration <= 0:
        raise RuntimeError("VoiceStudio narration has no valid duration")
    return duration


def _probe(path: str) -> dict:
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", path],
        capture_output=True, text=True, timeout=60, check=True,
    )
    data = json.loads(proc.stdout)
    streams = data.get("streams", [])
    duration = float(data.get("format", {}).get("duration") or 0)
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    if not video or not audio or duration <= 0:
        raise RuntimeError("QC failed: MP4 must contain playable video and audio streams and positive duration")
    return {
        "duration_seconds": round(duration, 2),
        "width": int(video.get("width") or 0),
        "height": int(video.get("height") or 0),
        "video_codec": video.get("codec_name"),
        "audio_codec": audio.get("codec_name"),
    }


def _download_studio_video(project_id: str, target: str):
    url = f"{AI_STUDIO_URL}/projects/{quote(project_id, safe='')}/download"
    with requests.get(url, stream=True, timeout=(20, 1800)) as response:
        if not response.ok:
            raise RuntimeError(f"AI Video Studio download failed with HTTP {response.status_code}")
        total = 0
        with open(target, "wb") as output:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if not chunk:
                    continue
                total += len(chunk)
                if total > MAX_SOURCE_BYTES:
                    raise RuntimeError("AI Video Studio output exceeded 1 GB source limit")
                output.write(chunk)
    if not os.path.getsize(target):
        raise RuntimeError("AI Video Studio returned an empty MP4")


def _compress_video(source: str, voice_audio: str, target: str, video_duration: float, voice_duration: float, subtitle_path: str | None = None):
    duration = max(video_duration, voice_duration)
    target_video_bps = int((MAX_VIDEO_BYTES * 0.82 * 8 / max(duration, 1)) - 160000)
    target_video_bps = max(250000, min(target_video_bps, 6000000))
    pad_video = max(0.0, voice_duration - video_duration)
    filters = []
    if pad_video > 0.05:
        filters.append(f"tpad=stop_mode=clone:stop_duration={pad_video:.3f}")
    if subtitle_path:
        filters.append("subtitles=" + subtitle_path)
    video_filter = ["-vf", ",".join(filters)] if filters else []
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", source, "-i", voice_audio,
        "-map", "0:v:0", "-map", "1:a:0", *video_filter, "-af", "apad", "-shortest",
        "-c:v", "libx264", "-preset", "veryfast", "-b:v", str(target_video_bps),
        "-maxrate", str(target_video_bps), "-bufsize", str(target_video_bps * 2),
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart", target,
    ], capture_output=True, text=True, timeout=7200, check=True)
    size = os.path.getsize(target)
    if size <= 0 or size > MAX_VIDEO_BYTES:
        raise RuntimeError(f"Compressed MP4 must be under 100 MB; got {size} bytes")


def _upload_to_autopolis_storage(path: str, task_id: int, job_id: str) -> str:
    base = os.getenv("AUTOPOLIS_PUBLIC_URL", "").rstrip("/")
    token = os.getenv("VIDEO_RENDERER_TOKEN", "").strip()
    if not base or not token:
        raise RuntimeError("AUTOPOLIS_PUBLIC_URL and VIDEO_RENDERER_TOKEN are required for secure media upload")
    endpoint = base + "/api/video-render-storage"
    headers = {"authorization": "Bearer " + token, "content-type": "application/json"}
    common = {"task_id": task_id, "job_id": job_id}
    upload_url_response = requests.post(
        endpoint, headers=headers, json={**common, "action": "upload_url"}, timeout=60,
    )
    if not upload_url_response.ok:
        raise RuntimeError(f"Autopolis signed upload URL failed with HTTP {upload_url_response.status_code}: {upload_url_response.text[:300]}")
    signed_url = upload_url_response.json().get("signed_url")
    if not signed_url or not str(signed_url).startswith("https://"):
        raise RuntimeError("Autopolis returned an invalid signed upload URL")
    with open(path, "rb") as media:
        upload = requests.put(
            signed_url, data=media,
            headers={"content-type": "video/mp4", "x-upsert": "true"},
            timeout=(30, 900),
        )
    if not upload.ok:
        raise RuntimeError(f"Supabase signed media upload failed with HTTP {upload.status_code}: {upload.text[:300]}")
    download_url_response = requests.post(
        endpoint, headers=headers, json={**common, "action": "download_url"}, timeout=60,
    )
    if not download_url_response.ok:
        raise RuntimeError(f"Autopolis signed download URL failed with HTTP {download_url_response.status_code}: {download_url_response.text[:300]}")
    video_url = download_url_response.json().get("video_url")
    if not video_url or not str(video_url).startswith("https://"):
        raise RuntimeError("Autopolis returned an invalid signed download URL")
    return video_url


def _scene_prompts(script: str, limit: int = 42) -> list[str]:
    paragraphs = [part.strip() for part in script.splitlines() if part.strip()]
    words = []
    for paragraph in paragraphs:
        words.extend(paragraph.split())
    if not words:
        return []
    chunks = []
    current = []
    for word in words:
        current.append(word)
        if len(current) >= limit:
            chunks.append(" ".join(current))
            current = []
    if current:
        chunks.append(" ".join(current))
    return chunks


def _render_with_hf_zerogpu(script: str, title: str, deliverable_type: str, temp: str) -> str:
    """Generate short visual clips through a public Hugging Face ZeroGPU Gradio Space."""
    space = os.getenv("HF_ZEROGPU_SPACE", "alexcheng0072/wan27-free-video-generator").strip()
    token = os.getenv("HF_TOKEN", "").strip() or None
    client = Client(space, token=token, verbose=False)
    prompts = _scene_prompts(script, limit=int(os.getenv("HF_ZEROGPU_SCENE_WORDS", "42")))
    if not prompts:
        raise RuntimeError("No script scenes available for ZeroGPU video generation")
    max_scenes = int(os.getenv("HF_ZEROGPU_MAX_SCENES", "6" if deliverable_type == "reel" else "12"))
    prompts = prompts[:max_scenes]
    ratio = "480x832" if deliverable_type == "reel" else "832x480"
    duration = int(os.getenv("HF_ZEROGPU_CLIP_SECONDS", "3"))
    if duration not in (2, 3, 4, 5):
        raise RuntimeError("HF_ZEROGPU_CLIP_SECONDS must be 2, 3, 4, or 5")
    clip_paths = []
    for index, scene in enumerate(prompts):
        visual_prompt = (
            f"Cinematic visual for the video titled {title}. "
            f"Show this scene: {scene}. Natural motion, coherent subject, "
            "professional camera movement, no text, no subtitles, no logos."
        )
        result = client.predict(None, visual_prompt, ratio, duration, api_name="/generate_video")
        remote_path = result[0] if isinstance(result, (tuple, list)) else result
        if not remote_path:
            raise RuntimeError(f"ZeroGPU returned no video for scene {index + 1}")
        clip_path = os.path.join(temp, f"zerogpu-clip-{index:03d}.mp4")
        if str(remote_path).startswith(("https://", "http://")):
            response = requests.get(str(remote_path), timeout=(20, 600))
            response.raise_for_status()
            with open(clip_path, "wb") as output:
                output.write(response.content)
        else:
            if not os.path.isfile(str(remote_path)):
                raise RuntimeError(f"ZeroGPU output file is unavailable for scene {index + 1}")
            shutil.copyfile(str(remote_path), clip_path)
        if not os.path.getsize(clip_path):
            raise RuntimeError(f"ZeroGPU returned an empty clip for scene {index + 1}")
        clip_paths.append(clip_path)
    normalized = []
    for index, clip_path in enumerate(clip_paths):
        normalized_path = os.path.join(temp, f"normalized-clip-{index:03d}.mp4")
        width, height = (480, 832) if deliverable_type == "reel" else (832, 480)
        subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", clip_path,
            "-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24",
            "-an", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
            "-movflags", "+faststart", normalized_path,
        ], capture_output=True, text=True, timeout=900, check=True)
        normalized.append(normalized_path)
    concat_path = os.path.join(temp, "zerogpu-clips.txt")
    with open(concat_path, "w", encoding="utf-8") as listing:
        for path in normalized:
            listing.write("file " + json.dumps(path) + "\n")
    source = os.path.join(temp, "zerogpu-visuals.mp4")
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "concat", "-safe", "0", "-i", concat_path,
        "-c", "copy", source,
    ], capture_output=True, text=True, timeout=1800, check=True)
    return source


def render_and_callback(job_id: str):
    job = get_job(job_id)
    if not job:
        raise RuntimeError("Render job disappeared from local queue")
    payload = json.loads(job["payload"])
    script = payload["script"]
    provider = os.getenv("VIDEO_RENDER_PROVIDER", "hf_zerogpu").strip().lower()
    if provider == "hf_zerogpu":
        render_source = "hf_zerogpu"
    elif provider == "ai_video_studio":
        render_source = "ai_video_studio"
    else:
        raise RuntimeError("VIDEO_RENDER_PROVIDER must be hf_zerogpu or ai_video_studio")
    if render_source == "ai_video_studio":
        word_count = len(script.split())
        is_reel = payload.get("deliverable_type") == "reel"
        scenes = max(3, min(6 if is_reel else 12, (word_count + 69) // 70))
        skill_id = os.getenv("AI_VIDEO_STUDIO_SOCIAL_SKILL_ID") if is_reel else os.getenv("AI_VIDEO_STUDIO_SKILL_ID")
        if is_reel and not skill_id:
            raise RuntimeError("Set AI_VIDEO_STUDIO_SOCIAL_SKILL_ID to a verified vertical/reel skill before rendering reel tasks")
        project_response = _studio_request("POST", "/projects/", json={
            "name": payload["title"], "topic": payload["title"], "script": script,
            "voice": os.getenv("AI_VIDEO_STUDIO_VOICE", "af_sarah"),
            "num_scenes": scenes, "skill_id": skill_id or None,
        }).json()
        project_id = project_response.get("id")
        if not project_id:
            raise RuntimeError("AI Video Studio did not return project id")
        _studio_request("POST", "/generation/start", json={
            "project_id": project_id,
            "render_opts": {"subtitles": False, "music": False, "interpolation": True,
                            "upscaling": False, "consistency": "schnell"},
        })
        deadline = time.time() + int(os.getenv("AI_VIDEO_STUDIO_TIMEOUT_SECONDS", "28800"))
        while time.time() < deadline:
            project = _studio_request("GET", f"/projects/{quote(project_id, safe='')}").json()
            status = str(project.get("status", "")).lower()
            if status == "done":
                break
            if status == "error":
                raise RuntimeError("AI Video Studio project failed: " + str(project.get("error") or "unknown error")[:400])
            time.sleep(15)
        else:
            raise RuntimeError("AI Video Studio render exceeded configured timeout")

    with tempfile.TemporaryDirectory(prefix="autopolis-video-") as temp:
        source = os.path.join(temp, "studio-output.mp4")
        voice_audio = os.path.join(temp, "voicestudio-narration.wav")
        final = os.path.join(temp, "autopolis-final.mp4")
        if render_source == "hf_zerogpu":
            source = _render_with_hf_zerogpu(script, payload["title"], payload["deliverable_type"], temp)
        else:
            _download_studio_video(project_id, source)
        source_qc = _probe(source)
        _generate_voice_studio_audio(script, voice_audio)
        voice_duration = _probe_audio_duration(voice_audio)
        subtitle_path = None
        caption_error = None
        try:
            subtitle_path = _transcribe_voice_studio_audio(voice_audio, os.path.join(temp, "captions.srt"))
        except Exception as caption_exc:
            caption_error = str(caption_exc)[:300]
        _compress_video(source, voice_audio, final, source_qc["duration_seconds"], voice_duration, subtitle_path)
        qc = _probe(final)
        qc["size_bytes"] = os.path.getsize(final)
        qc["captions_burned"] = bool(subtitle_path)
        if caption_error:
            qc["caption_error"] = caption_error
        qc["voice_provider"] = "VoiceStudio"
        qc["voice_model"] = os.getenv("VOICE_STUDIO_MODEL", "unconfigured")
        qc["voice_duration_seconds"] = round(voice_duration, 2)
        if qc["size_bytes"] > MAX_VIDEO_BYTES:
            raise RuntimeError("QC failed: final video exceeds 100 MB")
        media_url = _upload_to_autopolis_storage(final, int(payload["task_id"]), job_id)

    callback_url = check_callback_url(str(payload["callback_url"]))
    callback_token = os.getenv("VIDEO_RENDERER_CALLBACK_TOKEN", "")
    if not callback_token:
        raise RuntimeError("VIDEO_RENDERER_CALLBACK_TOKEN is required on the worker")
    callback = requests.post(callback_url, headers={"authorization": "Bearer " + callback_token},
                             json={"job_id": job_id, "video_url": media_url, "qc_passed": True, "qc_report": qc},
                             timeout=120)
    if not callback.ok:
        raise RuntimeError(f"Autopolis callback failed with HTTP {callback.status_code}: {callback.text[:400]}")
    return {"video_url": media_url, "qc_report": qc, "callback_status": callback.status_code}


def retry_callback_for_job(job_id: str) -> dict:
    job = get_job(job_id)
    if not job or job["status"] != "done" or not job["result"]:
        raise RuntimeError("Only a completed render with a stored video URL can retry its callback")
    payload = json.loads(job["payload"])
    result = json.loads(job["result"])
    video_url = result.get("video_url")
    qc_report = result.get("qc_report")
    callback_url = check_callback_url(str(payload.get("callback_url") or ""))
    callback_token = os.getenv("VIDEO_RENDERER_CALLBACK_TOKEN", "")
    if not callback_token:
        raise RuntimeError("VIDEO_RENDERER_CALLBACK_TOKEN is required on the worker")
    response = requests.post(
        callback_url,
        headers={"authorization": "Bearer " + callback_token},
        json={"job_id": job_id, "video_url": video_url, "qc_passed": True, "qc_report": qc_report or {}},
        timeout=120,
    )
    if not response.ok:
        raise RuntimeError(f"Autopolis callback retry failed with HTTP {response.status_code}: {response.text[:400]}")
    return response.json() if response.content else {"status": "callback_accepted"}


def process_next_job():
    now = int(time.time())
    with sqlite3.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        row = db.execute("select job_id from jobs where status='queued' order by created_at limit 1").fetchone()
        if not row:
            return False
        job_id = row["job_id"]
        changed = db.execute("update jobs set status='running',updated_at=? where job_id=? and status='queued'",
                             (now, job_id)).rowcount
        if not changed:
            return True
    try:
        result = render_and_callback(job_id)
        with sqlite3.connect(DB_PATH) as db:
            db.execute("update jobs set status='done',result=?,error=null,updated_at=? where job_id=?",
                       (json.dumps(result), int(time.time()), job_id))
    except Exception as exc:
        with sqlite3.connect(DB_PATH) as db:
            db.execute("update jobs set status='failed',error=?,updated_at=? where job_id=?",
                       (str(exc)[:1000], int(time.time()), job_id))
    return True


async def worker_loop():
    while True:
        worked = await asyncio.to_thread(process_next_job)
        if not worked:
            await asyncio.sleep(2)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    worker = asyncio.create_task(worker_loop())
    yield
    worker.cancel()
    try:
        await worker
    except asyncio.CancelledError:
        pass


app = FastAPI(title="Autopolis GPU Render Worker", version="0.1.0", lifespan=lifespan)


@app.get("/")
@app.get("/health")
def health():
    return {"ok": True, "service": "autopolis-video-render-worker"}


@app.post("/v1/jobs", status_code=202)
def create_job(body: RenderJobRequest, authorization: str | None = Header(default=None),
               idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")):
    if not authorized(authorization):
        raise HTTPException(status_code=401, detail="Renderer token required")
    if not idempotency_key or len(idempotency_key) > 200:
        raise HTTPException(status_code=400, detail="A valid Idempotency-Key is required")
    try:
        callback = check_callback_url(str(body.callback_url))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    payload = body.model_dump(mode="json")
    payload["callback_url"] = callback
    job_id, status = enqueue_job(idempotency_key, payload)
    if status == "done":
        try:
            callback_result = retry_callback_for_job(job_id)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc)[:500]) from exc
        return {"job_id": job_id, "status": "done", "callback_status": callback_result.get("status")}
    return {"job_id": job_id, "status": status}


@app.get("/v1/jobs/{job_id}")
def read_job(job_id: str, authorization: str | None = Header(default=None)):
    if not authorized(authorization):
        raise HTTPException(status_code=401, detail="Renderer token required")
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"job_id": job_id, "task_id": job["task_id"], "status": job["status"],
            "result": json.loads(job["result"]) if job["result"] else None, "error": job["error"]}
