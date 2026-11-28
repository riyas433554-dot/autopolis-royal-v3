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
