# Autopolis external video rendering

Autopolis is the task/control plane. A separate worker bridge handles rendering. It can use a shared free Hugging Face ZeroGPU provider for short clips or a private GPU host; do not put heavy model inference on the main Autopolis Render web service.

## Candidate GPU engine

## Voice and narration

Use [VoiceStudio](https://github.com/debpalash/VoiceStudio) as a separate local/headless service for narration and transcription; the render worker uses its OpenAI-compatible `/v1/audio/speech` and `/v1/audio/transcriptions` endpoints. The VoiceStudio Android preview also offers a Phone Speech API; set `VOICE_STUDIO_ASR_MODE=phone` for its base64 WAV ASR route (worker chunks to 25 seconds and uses approximate sentence timing). Secure the phone API with a bearer token and private HTTPS tunnel. The final MP4 narration is VoiceStudio audio, not ElevenLabs. VoiceStudio's application is AGPL-3.0, so keep it as an independent service rather than embedding/modifying it inside Autopolis. Set `VOICE_STUDIO_MODEL` explicitly after reviewing its model/weights license; the default OmniVoice weights are CC-BY-NC and must not be used for monetized output without separate rights. Voice and tokenizer assets may also have separate terms.

[AI Video Studio](https://github.com/06pratyush/ai-video-pipeline) is the first high-quality open-source candidate:
- MIT application code.
- Wan 2.2 TI2V-5B for generated motion, plus Kokoro narration, Whisper captions and FFmpeg assembly.
- Its documented v2 baseline is 8 GB VRAM / 16 GB RAM and a sample long film takes about 2.5 hours on an RTX 4060 laptop. This is not suitable for a free CPU web dyno.
- Wan model weights are Apache-2.0; model and voice asset licenses must still be checked individually. Use FLUX schnell for monetized content; do not select FLUX Kontext dev for commercial output.

## Worker contract

Autopolis sends an authenticated JSON `POST {VIDEO_RENDERER_URL}/v1/jobs`:
- `Authorization: Bearer VIDEO_RENDERER_TOKEN`
- `Idempotency-Key: autopolis-task-{task_id}`
- `{ task_id, title, description, deliverable_type, script, profile, callback_url }`

The renderer must return HTTP 202 with `{ job_id, status: "queued" }`. `job_id` must be stable for the idempotency key.

When the MP4 is finished, the renderer requests short-lived Supabase signed upload/download URLs from Autopolis (`POST /api/video-render-storage`), streams the MP4 to Storage without receiving the service-role key, and calls the `callback_url` with:
- `Authorization: Bearer VIDEO_RENDERER_CALLBACK_TOKEN`
- `{ job_id, video_url, qc_passed: true, qc_report }`

Do not call the callback until QC verifies a non-empty playable MP4, video and audio streams, duration, and the final file size. The current YouTube publisher limit is 100 MB. The media URL must be HTTPS and its hostname must be Supabase or be listed in `AUTOPOLIS_MEDIA_HOSTS`.

## Autopolis environment

Set only after a renderer worker is actually deployed:
- `VIDEO_RENDERER_URL` — HTTPS base URL of the renderer bridge
- `VIDEO_RENDERER_TOKEN` — worker request token
- `VIDEO_RENDERER_CALLBACK_TOKEN` — shared callback token configured on the worker
- `AUTOPOLIS_PUBLIC_URL` — `https://autopolis-royal-v3.onrender.com`
- `AUTOPOLIS_MEDIA_HOSTS` — optional extra HTTPS media hostnames, comma-separated

The callback automatically publishes to the connected YouTube account only after `qc_passed=true`. It uses the existing encrypted OAuth tokens; it does not ask the agent to publish directly.

If a render or upload fails, an owner can retry the saved video task through `POST /api/video-render-retry` with `{ "task_id": <id> }` and the lifecycle admin bearer token. A completed render retries the YouTube callback without rerendering; a failed render is requeued by the worker's idempotency key.

## Hosting reality

Open-source model/code can be free; sustained GPU compute and persistent public hosting generally are not. Free Colab/Kaggle GPU sessions are temporary and unsuitable as an always-on worker. Start with a separate GPU host when available; keep a stock-footage + FFmpeg fallback for CPU/free workers. Never describe GPU generation as unlimited-free hosting.
