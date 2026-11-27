# Autopolis Content Studio

## Content modes

- `auto`: infer long/short from the task deliverable type.
- `long_form`: original episodes, movies, cartoons, documentaries, explainers, and other long videos.
- `short_form`: original vertical shorts/reels and casual AI clips.
- `repurpose`: use a previously QC-passed Autopolis render as the source and cut a vertical highlight compilation.

`content_category` is free-form text. It is metadata for planning/analytics, not a closed genre enum.

## Task metadata

The task creator stores:

- `content_mode`
- `content_category`
- `platform_targets`
- `source_video_task_id` for repurpose jobs

Default targets:
- Long form: YouTube + Facebook
- Short form / repurpose: YouTube Shorts + Instagram Reels + Facebook Reels

The renderer only dispatches supported video deliverable types. Categories remain unrestricted except for a 120-character input limit.

## Repurpose worker

The renderer requests a source signed URL from Autopolis. The source endpoint only returns media when its render is QC-passed and `ready` or `published`.

For automatic selection, the worker:
1. Extracts source audio.
2. Attempts VoiceStudio ASR and ranks transcript windows using hook/question/emphasis heuristics.
3. If ASR is unavailable, uses FFmpeg scene-change points and a fallback selection.
4. Crops selected clips to 9:16, normalizes audio, burns captions when ASR succeeds, and concatenates the result.

A compilation is capped at 180 seconds and the current stored MP4 limit is 100 MB. The selection heuristic is not a semantic video-understanding model; it is a fallback/editor baseline and should be upgraded with a multimodal scorer.

## Long-form rendering

Long-form jobs prefer `VIDEO_RENDER_PROVIDER_LONG_FORM`; absent that, they use `VIDEO_RENDER_PROVIDER` or default to `ai_video_studio`. AI Video Studio scene planning defaults to up to 180 scenes (roughly one scene per 70 script words); `AI_VIDEO_STUDIO_MAX_SCENES` can override this.

Short-form jobs default to `hf_zerogpu`; `VIDEO_RENDER_PROVIDER_SHORT_FORM` can override it. The public ZeroGPU path is a limited clip provider, not a guaranteed multi-minute movie service. Direct LongCat-Video and Wan2.1 model adapters / GPU hosting are not included in this increment.

## Publishing state

- The existing YouTube publisher remains the active publisher.
- The callback now skips YouTube when no YouTube destination was selected and leaves the QC-passed video in `ready`.
- Meta destinations are saved on tasks, but Instagram/Facebook auto-publishing is not yet implemented in this increment. Do not treat a `ready` render as published to Meta.
- YouTube's current uploader and the media store retain their existing 100 MB limits.

## Apply / deploy

This PR adds a Supabase migration. Do not run live tasks until the migration is applied. No Render environment changes or production migration were performed by this code change.
