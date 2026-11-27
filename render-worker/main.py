import asyncio
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
    if not model:
        raise RuntimeError("Set VOICE_STUDIO_MODEL to a VoiceStudio engine whose model/weights license permits your intended use")
    voice = os.getenv("VOICE_STUDIO_VOICE", "default").strip()
    language = os.getenv("VOICE_STUDIO_LANGUAGE", "").strip()
    chunks = _split_tts_text(script)
    if not chunks:
        raise RuntimeError("VoiceStudio narration script is empty")
    with tempfile.TemporaryDirectory(prefix="autopolis-voicestudio-") as temp:
        audio_paths = []
        for index, chunk in enumerate(chunks):
            body = {"model": model, "input": chunk, "voice": voice, "response_format": "wav"}
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
                    listing.write("file '" + audio_path.replace("'", "'\\''") + "'\n")
            subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "concat", "-safe", "0", "-i", concat_path,
                "-c:a", "pcm_s16le", "-ar", "24000", "-ac", "1", target,
            ], capture_output=True, text=True, timeout=1800, check=True)
    if not os.path.getsize(target):
        raise RuntimeError("VoiceStudio returned an empty narration WAV")


def _transcribe_voice_studio_audio(audio_path: str, target: str) -> str | None:
    """Ask VoiceStudio's local ASR for captions matching the final narration."""
    base = os.getenv("VOICE_STUDIO_URL", "http://127.0.0.1:3900").rstrip("/")
    headers = {}
    api_key = os.getenv("VOICE_STUDIO_API_KEY", "").strip()
    if api_key:
        headers["authorization"] = "Bearer " + api_key
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
        output.write(captions + "\n")
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


def _upload_to_supabase(path: str, task_id: int, job_id: str) -> str:
    base = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    bucket = os.getenv("SUPABASE_VIDEO_BUCKET", "autopolis-media").strip()
    if not base or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required on the render worker")
    headers = {"apikey": key, "authorization": "Bearer " + key}
    bucket_url = base + "/storage/v1/bucket"
    bucket_response = requests.post(bucket_url, headers={**headers, "content-type": "application/json"},
                                   json={"id": bucket, "name": bucket, "public": False}, timeout=30)
    if bucket_response.status_code not in (200, 201, 409):
        raise RuntimeError(f"Supabase bucket setup failed with HTTP {bucket_response.status_code}")
    object_path = f"videos/task-{task_id}/{job_id}.mp4"
    upload_url = base + "/storage/v1/object/" + quote(bucket, safe="") + "/" + quote(object_path, safe="/")
    with open(path, "rb") as media:
        upload = requests.post(upload_url, headers={**headers, "content-type": "video/mp4", "x-upsert": "true"},
                               data=media, timeout=(30, 900))
    if not upload.ok:
        raise RuntimeError(f"Supabase media upload failed with HTTP {upload.status_code}: {upload.text[:300]}")
    sign_url = base + "/storage/v1/object/sign/" + quote(bucket, safe="") + "/" + quote(object_path, safe="/")
    signed = requests.post(sign_url, headers={**headers, "content-type": "application/json"},
                           json={"expiresIn": 604800}, timeout=30)
    if not signed.ok:
        raise RuntimeError(f"Supabase signed URL creation failed with HTTP {signed.status_code}")
    signed_path = signed.json().get("signedURL")
    if not signed_path:
        raise RuntimeError("Supabase signed URL response did not include signedURL")
    if signed_path.startswith("https://"):
        return signed_path
    if signed_path.startswith("/storage/v1/"):
        return base + signed_path
    if signed_path.startswith("/object/"):
        return base + "/storage/v1" + signed_path
    return base + "/storage/v1/" + signed_path.lstrip("/")


def render_and_callback(job_id: str):
    job = get_job(job_id)
    if not job:
        raise RuntimeError("Render job disappeared from local queue")
    payload = json.loads(job["payload"])
    script = payload["script"]
    word_count = len(script.split())
    scenes = max(3, min(12, (word_count + 69) // 70))
    project_response = _studio_request("POST", "/projects/", json={
        "name": payload["title"],
        "topic": payload["title"],
        "script": script,
        "voice": os.getenv("AI_VIDEO_STUDIO_VOICE", "af_sarah"),
        "num_scenes": scenes,
        "skill_id": (os.getenv("AI_VIDEO_STUDIO_SOCIAL_SKILL_ID") if payload.get("deliverable_type") == "reel" else os.getenv("AI_VIDEO_STUDIO_SKILL_ID")) or None,
    }).json()
    project_id = project_response.get("id")
    if not project_id:
        raise RuntimeError("AI Video Studio did not return project id")
    _studio_request("POST", "/generation/start", json={
        "project_id": project_id,
        "render_opts": {
            "subtitles": False,
            "music": False,
            "interpolation": True,
            "upscaling": False,
            "consistency": "schnell",
        },
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
        media_url = _upload_to_supabase(final, int(payload["task_id"]), job_id)

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


@app.get("/health")
def health():
    return {"ok": True, "service": "autopolis-gpu-render-worker"}


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
