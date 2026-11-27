# Autopolis GPU Render Worker

This is a separately hosted bridge between Autopolis and the local AI Video Studio FastAPI daemon. It is designed to run on a GPU host; do not deploy it to the Autopolis Render web service.

## Engines

Use [VoiceStudio](https://github.com/debpalash/VoiceStudio) as the final narration and caption service. Its local API provides OpenAI-compatible speech and transcription endpoints; the worker replaces the renderer's internal narration with VoiceStudio audio and burns captions transcribed from that exact audio. Run VoiceStudio as a separate service/container (AGPL-3.0 app license) rather than embedding or modifying it inside Autopolis. Choose a model/voice whose own license permits the intended YouTube/commercial use; model weights and voice assets are separately licensed.

Use [AI Video Studio](https://github.com/06pratyush/ai-video-pipeline) v2 as the heavy visual renderer:
- MIT application code; Wan 2.2 TI2V-5B, Kokoro, faster-whisper and FFmpeg.
- Documented baseline: 8 GB VRAM / 16 GB RAM; measured long-form sample took around 2.5 hours on RTX 4060 Laptop.
- The app's backend daemon is REST on localhost:7860. The worker creates a project, queues generation, polls the project, downloads the finished MP4, compresses it under Autopolis's 100 MB upload ceiling, runs ffprobe QC, uploads to Supabase Storage, and calls Autopolis back.
- Model licenses are separate. Use FLUX schnell for commercial output; FLUX Kontext dev is non-commercial. Check voice/model licenses for each use.

## Run

1. Install and start AI Video Studio on the GPU machine; keep its backend bound to localhost (7860). Install/download model weights according to its upstream docs.
2. Run this bridge on the same GPU host. The simplest Docker option is host networking (`--network host`) so the bridge can reach AI Video Studio's default `127.0.0.1:7860`; set `AI_VIDEO_STUDIO_URL` accordingly. Do not expose port 7860 publicly; the Studio API itself has no authentication. If using a normal bridge network, bind Studio only to a private interface and firewall it from the public internet.
3. Build this container with a persistent volume mounted at `/data` and expose port 8080 over HTTPS behind a reverse proxy.
4. Set secrets in the worker host:
   - `VIDEO_RENDERER_TOKEN` — must match Autopolis `VIDEO_RENDERER_TOKEN`
   - `VIDEO_RENDERER_CALLBACK_TOKEN` — must match Autopolis `VIDEO_RENDERER_CALLBACK_TOKEN`
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
   - `AI_VIDEO_STUDIO_URL` (private/local URL; default http://127.0.0.1:7860)
   - `VOICE_STUDIO_URL` (private/local URL; default http://127.0.0.1:3900)
   - `VOICE_STUDIO_MODEL` and `VOICE_STUDIO_VOICE` (default `omnivoice` / `default`; check model/voice license before monetizing)
   - optional `VOICE_STUDIO_API_KEY`, `VOICE_STUDIO_LANGUAGE`, `VOICE_STUDIO_ASR_MODEL`
   - optional `SUPABASE_VIDEO_BUCKET` (default `autopolis-media`), `AI_VIDEO_STUDIO_VOICE`, `AI_VIDEO_STUDIO_SKILL_ID`, `AI_VIDEO_STUDIO_SOCIAL_SKILL_ID`
5. Configure Autopolis with `VIDEO_RENDERER_URL` (bridge HTTPS URL), `VIDEO_RENDERER_TOKEN`, `VIDEO_RENDERER_CALLBACK_TOKEN`, and `AUTOPOLIS_PUBLIC_URL`.

## API

- `POST /v1/jobs` accepts the contract described in `docs/video-rendering.md`; requires Bearer token and Idempotency-Key.
- `GET /v1/jobs/{job_id}` reports queued/running/done/failed.
- `GET /health` is a health probe.

Jobs persist in SQLite. The worker processes one GPU render at a time. Failed jobs are requeued by submitting the same idempotency key again.

## Costs and limits

The code/models are open source/free to self-host, but a persistent GPU host is not guaranteed free. Temporary free notebook GPUs are not a reliable always-on worker. The worker caps source files at 1 GB and final uploads at 100 MB to match the current YouTube publisher. Long/high-quality outputs may need a higher limit and a corresponding publisher change.
