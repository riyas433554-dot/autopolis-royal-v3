# Autopolis Studio Implementation Order (LOCKED)

Status: active implementation sequence. Do not reorder, skip, or start later phases until the current phase is implemented, tested, and verified. If a blocker makes the order impossible, record the blocker and evidence in this document before proposing a sequence change. Do not silently change this order.

## Guardrails
- Work on `feat/autopolis-studio-implementation-order`; do not modify `main` directly.
- Keep existing Autopolis task/job, Supabase metadata/storage, and provider interfaces as the integration backbone.
- Keep VoiceStudio as narration primary; do not switch to ElevenLabs.
- Prefer free/open-source components, but do not represent free GPU quotas as guaranteed production capacity.
- Never publish customer or test media automatically during implementation.
- A feature is complete only after focused tests, relevant CI, and a real output/metadata check where applicable. Report unverified items honestly.

## Locked phases

1. **Video worker QC gates**
   - Require valid playable video/audio streams and positive duration.
   - Enforce narration coverage against final video duration (with an explicit configurable tolerance); fail closed if voice ends materially early.
   - Record source/final width, height, duration, narration duration, and QC outcome.
   - Add regression tests for short narration, acceptable narration coverage, missing streams, and invalid dimensions.

2. **Real output resolution profiles**
   - Add explicit output profiles (at minimum 1080p and 1440p landscape, with appropriate vertical profiles).
   - Request/produce the target dimensions from the provider/renderer, not just relabel or blindly resize low-resolution output.
   - QC must reject an output that does not meet the selected profile. Upscaling is not a substitute for genuine source detail; report the pipeline accurately.

3. **Dedicated video enhancement/upscaling jobs**
   - Add a separate queued enhancement workflow for existing user videos and Autopolis outputs.
   - Support suitable open-source model backends (Video2X/model adapter) and job progress, storage, QC, and download.
   - Test with a small fixture; document GPU/CPU and free-tier limits.

4. **Private Blender MCP / 3D production worker**
   - Run Blender/MCP only in a private worker/network; never expose an unauthenticated MCP socket publicly.
   - Build a minimal verified scene-to-render/export job, then expand to assets, materials, rigging, animation, CGI and VFX.
   - Verify a real rendered artifact and metadata.

5. **Game production pipeline**
   - Blender creates/exports assets; a game engine (Godot/Web) builds playable games.
   - Implement playable preview, controls, build/export and task integration; Blender itself is not treated as the game engine.
   - Verify a playable test project.

6. **VFX / CGI / edit studio**
   - Connect compositing (e.g. Natron where suitable), FFmpeg assembly, captions, audio, transitions and project-based editing.
   - Keep workflows reusable for both customer services and Autopolis internal productions.

7. **Content production profiles and studio routing**
   - Add validated profiles for cinematic/documentary, cartoons, anime, movie-style scenes, casual videos, agent vlogs, and 2D/3D educational/math videos.
   - Route by capability and quality evidence, with fallbacks clearly labelled; do not label template motion graphics as cinematic AI footage.

8. **Virtual city and company production integration**
   - Produce realistic 3D buildings/interiors/signage and connect assets to company/workflow systems.
   - Keep functional business workflows separate from decorative city visuals; verify both independently.

## Phase gate
Each phase must have: implementation, focused tests observed failing before the fix when using TDD, CI result, artifact/output verification, and a short evidence note. Do not start the next phase until the current phase's gate is green.


## Evidence log
- **Phase 1 QC gates — implemented; focused tests green.** Branch commit: `2c99ff71152d5894a4049b4000ccd63ca1e1ff2f`. Autopolis CI run `46113215844`: unit tests and render-worker tests passed; Build Verify run `46113215833` passed. Full Autopolis CI lint step failed on existing repo-wide lint issues (106 errors across pre-existing files); not caused by the render-worker Python change. No Render deploy or public video publish was performed.
- **Phase 2 — implementation in progress; gate still open.** Added task-level `video_resolution` (`source|720p|1080p|1440p`), API validation/payload propagation, Operations task-creation selector, and a Supabase migration. The public Wan Space is fixed to 832×480 landscape / 480×832 portrait / 640×640 square, so high-resolution requests route to Lightricks LTX-2.3 only when the provider gate is explicitly enabled. The LTX adapter requests documented high-tier preset dimensions (1536×1024 landscape / 1024×1536 portrait) for the 720p deliverable, then crops to target dimensions; no low-resolution resize is used. LTX 1080p/1440p requests fail fast until a provider has verified native target output or a separately verified enhancement path. Source/final resolution QC and high-res visual-coverage QC fail closed.
  - **Safety gate:** `LTX_ZEROGPU_ENABLED` defaults to `false`. High-resolution jobs using LTX are rejected until license/quota review. A configured AI Video Studio provider can be selected separately.
  - Focused CI at commit `89d332ccb89da48e47409d8e2e2fb9f81d997703`: Build Verify run `46114638119` passed; Video render worker tests run `46114638070` passed (API syntax, focused ESLint including `api/tasks.js`, Node tests, Python worker tests).
  - Full Autopolis CI run `46114638038`: unit/render-worker tests passed; repository-wide ESLint failed on existing unrelated lint findings, so its production-build step was skipped. Build Verify passed independently.
  - **Not yet verified:** no real LTX 1080p/1440p artifact has been generated; provider tests use a mocked Gradio client. The Supabase migration is in this branch but not applied to production. No Render deploy or public video publish was performed.
  - **Quota/license blocker before customer launch:** official Hugging Face docs give free accounts 5 GPU-minutes/day (unauthenticated 2 minutes), and the current LTX Space declares a 75-second GPU request per generation; multi-scene jobs can exhaust a single account's quota. The LTX-2 Community License allows remote-access/SaaS use only with enforceable user restrictions and a copy of the license supplied; it requires machine-generated-content disclosure, requires a paid license for entities with at least $10M annual revenue, and restricts services directly competing with Lightricks commercial offerings without a separate license. Therefore LTX is gated off by default pending legal review and customer-terms work. Sources: [ZeroGPU quota](https://huggingface.co/docs/hub/spaces-zerogpu), [LTX Space GPU request](https://huggingface.co/spaces/Lightricks/LTX-2-3/blob/main/app.py), [LTX-2.3 license](https://huggingface.co/Lightricks/LTX-2.3/blob/main/LICENSE).
  - **Regression fixed:** LTX scene concat manifest had literal `\\n` separators, causing multiple scene entries to become one malformed line. Added a two-scene regression test; it failed before the fix (`46117101442`, Render worker tests step) with `1 failed, 49 passed`, then passed after fix in Video render worker tests run `46117199508` and Autopolis CI Render worker tests step. Build Verify `46117199584` passed. Full Autopolis CI run `46117199497` still fails at repo-wide lint; focused worker tests passed. Fix commit: `aa85ea66b083b2c4b7989368d6c5619fb476101e`.

  - Latest PR head `acc7d3c8d78fa5cfc0f8df20dcb9f38a0f598aa9` (2026-11-28): Video render worker tests run `46117283473` passed; Build Verify run `46117283525` passed; Autopolis CI run `46117283465` failed at repo-wide lint. Phase 2 remains blocked on real provider output/license/quota verification; no production migration or Render deploy.

  - **LTX profile safety correction (2026-11-28):** The public LTX-2.3 Space's documented high-tier presets are 1536x1024 landscape and 1024x1536 portrait; it uses a 75-second ZeroGPU lease. 1080p/1440p target dimensions exceed those documented presets. Custom dimensions may be accepted, but no real artifact or stable runtime evidence exists, so the worker now fails fast for those profiles rather than spending quota on an unverified request. 720p target dimensions (1280x720 landscape / 720x1280 portrait) are not themselves documented presets. The worker now requests the documented high preset (1536x1024 landscape / 1024x1536 portrait), validates the returned source dimensions, and crops to the 720p deliverable; it does not request unverified custom 720p generation. 1080p/1440p still fail fast. Added a focused mocked regression test for preset request + target crop. This is not proof of a real 720p artifact.
  - Source: [LTX-2.3 Space app.py](https://huggingface.co/spaces/Lightricks/LTX-2-3/blob/main/app.py) (high-tier presets and GPU duration); [LTX license](https://huggingface.co/Lightricks/LTX-2.3/blob/main/LICENSE).
  - Commits: `99c23858c8a4d601e3eba9ff65e12a8a2bd5e751` (guard), `f8b9063ef1909ea83bdb4aad97bdbefa3219569b` (tests), `24c80b72e6cdf1faf95a4c09600d341ad81d466f` (verified-preset wording), `8bd4c354e33f809aa243fb3ef7597557e8c07711` (fixtures).

  - **Preset-to-720p correction (2026-11-28):** commits `3349d66a4dccf5e7317edd06e199dfc3c5a64214` and `762002ad312f51e3be67c3920823527305d5bfe9` change LTX to request documented high preset dimensions and crop to 720p, instead of requesting custom 1280x720 / 720x1280. CI triggered by these commits is pending; no real artifact has been generated yet.

  - **AI Video Studio output capability audit (2026-11-28):** upstream API `RenderOpts` exposes only a boolean `upscaling`, not an explicit requested output width/height. Upstream README describes its quality upscaling as `super2xbr+lanczos` with Real-ESRGAN as a swap-in; therefore this is a model-upscale/post-process path, not proof of native 1080p/1440p generation. Worker final ffprobe QC enforces the exact selected profile and rejects short output. 1440p remains unverified; phase 2 cannot close until a real artifact's dimensions and visual quality are inspected. Sources: [upstream generation API](https://github.com/06pratyush/ai-video-pipeline/blob/main/app/backend/routes/generation.py), [upstream README quality settings](https://github.com/06pratyush/ai-video-pipeline#quality-settings).
