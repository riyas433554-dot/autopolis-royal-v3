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
- **Phase 2 — implementation in progress; gate still open.** Added task-level `video_resolution` (`source|720p|1080p|1440p`), API validation/payload propagation, Operations task-creation selector, and a migration file. The public Wan Space is fixed to 832×480 landscape / 480×832 portrait / 640×640 square, so high-resolution requests route to the Lightricks LTX-2.3 ZeroGPU Space. LTX is asked for the padded model dimensions (e.g. 1920×1088 for 1080p), then only cropped to the standard target; no low-res resize is used. Source and final resolution QC plus high-res visual-coverage QC fail closed.
  - Focused CI at commit `351c9ee4d91db41478c84596d99c1eaded0ffcab`: Build Verify run `46114312568` passed; Video render worker tests run `46114312617` passed (Node syntax, focused ESLint including `api/tasks.js`, Node tests, Python worker tests).
  - Full Autopolis CI run `46114312561` passed unit/render-worker tests but failed the repository-wide ESLint step on existing unrelated lint findings; production build was skipped by that workflow. Build Verify passed independently.
  - **Not yet verified:** no real LTX 1080p/1440p output artifact has been generated; the provider test uses a mocked Gradio client. The Supabase migration is committed in the branch but has not been applied to production. No Render deploy or public video publish was performed.
  - **Quota/license blocker before customer launch:** HF ZeroGPU free quota is shared and capped at 5 GPU-minutes/day per free account (unauthenticated 2 minutes); LTX Space declares up to 75 seconds per call, so multi-scene customer videos can exhaust quota. LTX-2.3 uses the LTX-2 Community License, including a paid-license threshold for entities at $10M+ annual revenue and machine-generated-output disclosure/use restrictions. Review quota routing and customer terms before enabling paid customer jobs. See [ZeroGPU quotas](https://huggingface.co/docs/hub/spaces-zerogpu) and [LTX-2.3 license](https://huggingface.co/Lightricks/LTX-2.3/blob/main/LICENSE).
