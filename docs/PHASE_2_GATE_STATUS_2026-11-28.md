# Phase 2 Gate Status — 2026-11-28

Branch: `feat/autopolis-studio-implementation-order`
PR: #38 (do not merge as part of this work)
Observed head before this note: `2d2eed94bedec430d30503ed140cda9252cf6265`

## CI evidence at observed head

- Video render worker tests run [46118687603](https://github.com/riyas433554-dot/autopolis-royal-v3/actions/runs/46118687603): success.
- Build Verify run [46118687664](https://github.com/riyas433554-dot/autopolis-royal-v3/actions/runs/46118687664): success.
- Autopolis CI run [46118687607](https://github.com/riyas433554-dot/autopolis-royal-v3/actions/runs/46118687607): failure at repo-wide `Lint`; 112 problems (106 errors, 6 warnings).
- Baseline comparison: `main` CI run [46052522731](https://github.com/riyas433554-dot/autopolis-royal-v3/actions/runs/46052522731) also fails at `Lint` with the same 112 problems. This is a confirmed pre-existing repository lint blocker, not a new Phase 2 regression. Worker tests and Build Verify are separate passing checks.

## Current Render service state (read-only verified)

Existing service: `autopolis-video-worker`, service ID `srv-dc4n3dbl550s739vr320`, URL https://autopolis-video-worker.onrender.com.

- Render configured branch: `feat/video-render-provider-adapter` (wrong branch for current Phase 2).
- Auto-deploy: off.
- Live deploy commit: `5e6673597ee4e3c24fe43c8500f28ee14eba53a5`.
- Do not trigger deploy until service branch is changed to `feat/autopolis-studio-implementation-order`. Available Render actions do not expose service branch configuration; dashboard change is required. Do not create a duplicate service.

## Gate remains OPEN

Not yet completed:
1. Switch existing Render service branch to the implementation branch, then deploy safely.
2. Resolve model license / quota eligibility for commercial production.
3. Generate a real 720p output from the deployed worker and verify actual dimensions, aspect ratio, streams, duration, and visual quality.
4. Verify native/qualified output path for 1080p and 1440p; fail-fast behavior remains intentional until then.
5. Do not apply the Supabase migration to production until branch/deploy and artifact gate pass.

No Phase 3 work, production migration, main-branch change, or public media publish was performed.


## Latest verification update — 2026-11-28 (after Render dashboard branch correction)

- Existing Render service read-only check: branch is now `feat/autopolis-studio-implementation-order`; auto-deploy remains off; service plan is **Free**; service URL is https://autopolis-video-worker.onrender.com.
- Live deployment observed: `dep-dc57uil6e07s739p5srg`, commit `be387ed1a2cd51eae9d1f99f8732091b2670b97e`. Startup logs confirm the FastAPI process is live on port 8080. The deployment is the worker bridge/API, not evidence that an AI GPU host or VoiceStudio is attached.
- Render logs inspected for the deployment window: startup/health traffic only; no authenticated `POST /v1/jobs` or completed render artifact was observed. Public API inspection from this execution environment was unavailable (DNS resolution failure), and the Render connector does not expose the existing secret values or an arbitrary authenticated HTTP request action. Existing tokens were not replaced or guessed.
- The worker code defaults `AI_VIDEO_STUDIO_URL` to localhost:7860 and `VOICE_STUDIO_URL` to localhost:3900; those dependencies must actually be reachable from the worker, or an explicitly configured provider must be available. No successful integration check for either dependency was observed.
- LTX ZeroGPU remains disabled by default pending license/quota review. No 720p MP4 was produced and inspected; 1080p/1440p remain intentionally fail-closed. Supabase migration remains branch-only/not applied to production.

**Gate status remains OPEN.** Do not mark Phase 2 complete or start Phase 3 until a real authenticated 720p job finishes and its downloaded MP4 is checked with ffprobe and visual playback/QC. Also resolve the commercial license/quota and provider connectivity gates. This update records observed evidence only; it does not claim a render test passed.

## Fresh audit and callback QC regression — 2026-11-28

- Supabase audit found an existing completed/published task #31 (not a newly created private test): its saved QC report records 960x540, 45.00 seconds, narration 27.83 seconds, H.264/AAC, and `captions_burned=false`. The video was already marked `published`; do not rerun or republish this task.
- The 17.17-second narration gap violates the worker's configured 3-second coverage tolerance. The callback previously trusted `qc_passed=true` and did not independently validate narration duration, dimensions, or codec metadata. The exact reason the older worker reported a false pass is not proven; callback defense-in-depth now rejects inconsistent reports before the job can be marked ready or published.
- Regression test was committed first: `04b3b7513c730a8105afef87c1a5c435fa42ef12`; RED was observed in Video render worker run `46156587852` (missing validator export).
- Fix commit: `f5e354b4d8509409b71dbfc46501528ffd99ecdb`. Added callback-side QC validation for positive duration/narration/dimensions, both codecs, narration gap (default max 3 seconds), and named-profile minimum dimensions.
- Verification at fix head: Autopolis CI `46156631865` PASS; Build Verify `46156631892` PASS; dedicated Video render worker tests `46156631886` PASS. These are branch CI results only; no production callback deployment was performed.
- Private test remains outstanding. Do not dispatch a task with the current callback until the test is isolated from public YouTube publishing; the callback's existing production behavior auto-publishes when a YouTube account is connected.
- Phase 2 remains OPEN: no newly generated private 720p artifact has been downloaded and visually/technically inspected. 1080p/1440p remain unverified.

## Private QC execution path — implementation in branch

- A task description beginning exactly with `[AUTOPOLIS PRIVATE QC TEST]` is now tagged as a private test through the agent-run → worker payload → render-job metadata path.
- The callback validates the QC report, then stores a successful private test as `ready` and returns without invoking YouTube publishing. Ordinary video tasks retain existing auto-publish behavior.
- The marker is intentionally case-sensitive and explicit; do not add it to customer tasks. Use it only on a dedicated internal test task with non-confidential content.
- This is implemented on the PR branch only. Do not submit the private test until this branch is deployed to the app callback service and the callback route is confirmed to use the private-test branch. No new test job has been submitted.


## Latest branch verification — 2026-11-28

- Added a regression test ensuring changing only the requested resolution (720p → 1080p) changes the renderer idempotency key. This prevents a renderer from reusing a previous-resolution job for the same task and script.
- Commit: `ac0a5dabccb365f63c243baa217a207f8d71701d`.
- CI at this exact head: Autopolis Build Verify run [46159904022](https://github.com/riyas433554-dot/autopolis-royal-v3/actions/runs/46159904022) PASS; Autopolis CI [46159904036](https://github.com/riyas433554-dot/autopolis-royal-v3/actions/runs/46159904036) PASS; Video render worker tests [46159904040](https://github.com/riyas433554-dot/autopolis-royal-v3/actions/runs/46159904040) PASS.
- Render service inventory read-only confirmed the worker remains on the implementation branch with auto-deploy off, and the app service remains on `main`. No deploy or private job was triggered. Callback isolation is therefore branch-tested but not live-verified.
- Phase 2 remains OPEN until a deployed, authenticated private 720p render produces an MP4 that is downloaded and inspected for actual dimensions, aspect ratio, codecs, duration, narration coverage, and visual playback. 1080p/1440p are not certified.


## Worker branch deployment check — 2026-11-28

- Triggered existing worker service deployment `dep-dc5f6rsipgvc73c5h4o0` for branch head `1a150b6c62aa91cf1fc8f9f9a221af24d95dec8f`; Render reports status `live`.
- Render logs show Uvicorn startup and Render health GET `/` returned 200. This verifies worker process startup only, not a render, provider authentication, or an MP4 artifact.
- The application service `autopolis-royal-v3` is still configured to `main` with auto-deploy off; its callback is not running the private-test branch code. No render job was submitted, so no public media was produced.
- PR #38 was returned to draft after confirming Phase 2's artifact/license gate remains open. Do not merge or start upscaler/Blender/game phases until the real private artifact gate is satisfied.


## Callback isolation hardening — 2026-11-28 (branch-only)

- Rechecked actual PR #38 head and Render configuration before edits. PR remains open/draft/unmerged; app service `autopolis-royal-v3` remains on `main` with auto-deploy off. No app deployment was triggered.
- Added callback mode classification requiring both the exact `[AUTOPOLIS PRIVATE QC TEST]` task-description prefix and `provider=private_test`. A mismatch is failed closed before the YouTube publisher path.
- Added a second explicit public-publisher boundary guard.
- Added conditional status claims before accepting private-ready state or entering public `publishing`; duplicate public callbacks that lose the claim return HTTP 202 rather than calling YouTube. Existing `published` and `publishing` replay responses are now tested through a shared disposition helper.
- Added tests for missing marker, wrong provider, exact-marker private classification, replay/idempotency disposition, and private-mode exclusion from public publishing. Existing QC tests cover missing/invalid stream metadata and narration coverage.
- Code commits: `877b28964b92e12952a6531a442355ad558fe6ed`, `55ad9f444671d688cc59a58ae31bfc665d38e23a`, `5b4cf9e13b83ce8c05136febbbddfdf7267c1a28`, `4729142dae89fdb70e56c55352a5e8a9942fe3f4`, `51dedb0cf95d6b9609ba60154c161140c12274ab`.
- Build Verify run `46168464591` passed at test head `51dedb0cf95d6b9609ba60154c161140c12274ab`. Autopolis CI `46168464603` and Video render worker tests `46168464652` were still running at report update; do not claim their completion until checked.
- Render worker service is configured to the feature branch but live deployment remains `1a150b6c62aa91cf1fc8f9f9a221af24d95dec8f`, not the latest callback code. Production app callback remains on `main`. Therefore no private test was submitted and no MP4 was generated or inspected. No public publishing occurred.
- Phase 2 remains OPEN. The callback hardening is branch-only until safe staging/deployment is approved and verified; actual 720p/1080p/1440p artifact evidence and provider licensing/quota/connectivity are still blockers.
