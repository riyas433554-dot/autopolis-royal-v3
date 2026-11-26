# Agent lifecycle (implementation contract)

Autopolis will model ECC's published agent definitions as city agents. This is a persistent city lifecycle/simulation, not a pool of arbitrary live model instances.

## ECC source of truth

- Upstream: [affaan-m/ECC](https://github.com/affaan-m/ECC)
- Pinned snapshot: `4adeee6732a12d1540f49a4d50a38ce8c97f9a53`
- Source directory: `agents/*.md` (72 definitions at this snapshot)
- Local pinned manifest: `data/ecc-agent-manifest.json`
- These files are role/persona/tool/model instructions, **not trained model weights**. City agents use these definitions as their identity/role prompt; the Academy's score and training are Autopolis lifecycle data.
- ECC role metadata must be parsed from the Markdown frontmatter; do not invent model, tools, or role data. Keep the source path and upstream blob SHA for provenance.
- Re-import must be idempotent by unique key `affaan-m/ECC:<agent-definition-key>`; preserve lifecycle progress for existing profiles.

## Agent sources and initial placement

- `ecc_preconfigured`: a profile sourced from a pinned ECC agent definition (not trained model weights).
- `scratch`: a newly created Academy trainee with no ECC source.
- On first ECC intake, split the 72 source definitions 36/36: 36 go to Academy for training; 36 are assigned across the other city buildings for interviews, hiring, and support duties. Keep the exact deterministic split in the importer so it never reshuffles on refresh.
- The ECC half deployed to buildings starts as city staff; it can conduct interview/hiring/support work. Do not treat those as company-hired worker slots unless explicitly hired.
- Do not download or execute ECC scripts/hooks as part of roster import. Import only reviewed Markdown agent metadata/instructions.

## State progression

```text
ECC definitions ── pinned import ──> split 36 Academy / 36 city staff
Scratch agent ────────────────────> Academy

Academy training/pass ──> interview/hire eligibility ──> Company (max 2 active members)
Company work:
  score below threshold OR 10 mistakes
    -> expelled -> Academy strict training Level 1
  pass Level 1 -> eligible for hiring -> company work
  next failure -> Academy strict training Level 2
  pass Level 2 -> eligible for hiring -> company work
  every later failure increments strict training level
```

A failure returns the agent to Academy; it does not delete the agent. Training completion and company hiring are separate events. Existing company roster enforcement remains authoritative.

## Persistence

- `agent_lifecycle_profiles`: source, state, level, score, mistake counters, current company and assignment.
- `agent_training_cycles`: each training attempt, level/track, score, mistakes and pass/fail result.
- `agent_lifecycle_events`: transition/audit history.
- Existing `agents` and `company_members` remain the directory/roster; existing API response shapes are not changed.

## Provisional policy defaults

- Pass score: 80/100.
- Mistake threshold: 10.
- Per-cycle mistakes reset when a new cycle starts; lifetime mistakes remain cumulative.
- Training level increments after each company expulsion and never decreases.
- ECC 72 split is deterministic 36/36.

These are defaults, not final owner-approved balance settings. Keep them configurable in the lifecycle service, not hard-coded in UI.

## Safety/rollout

- Migration is additive and creates no agents.
- Lifecycle tables have RLS enabled and no public/anon policies; trusted server-side service-role code only.
- Roster import is metadata-only; no upstream hooks/scripts are executed.
- Do not connect city labels until lifecycle APIs and transition tests are verified.
- Do not merge/deploy until migration, importer idempotency, state-transition tests and E2E are green.

## Import endpoint (not executed yet)

After the three timestamped migrations are applied and the Render service has the private environment variable `AUTOPOLIS_LIFECYCLE_ADMIN_TOKEN`, the owner can trigger the metadata-only import with an authenticated POST to `/api/eccimport`. Keep the token private; never paste it into chat or commit it. The endpoint fetches only the pinned `agents/*.md` files, parses their frontmatter, and calls the transactional Supabase RPC. It does not execute ECC scripts/hooks.

The first import is deterministic: manifest order alternates 36 definitions into Academy and 36 into city staff, with city staff round-robin across existing buildings except `agent-academy`. Repeated imports update source metadata and preserve lifecycle status, score, level, mistakes, and assignments. Do not call the endpoint until the migration and secret are configured.

## Lifecycle API

`GET /api/lifecycle` returns lifecycle profiles with their agent/company summary.
Owner mutations require `Authorization: Bearer <AUTOPOLIS_LIFECYCLE_ADMIN_TOKEN>`:

- `POST /api/lifecycle` `{ action: "start_training", agent_id, track? }`
- `POST /api/lifecycle` `{ action: "complete_training", agent_id, score, mistakes, feedback? }`
- `POST /api/lifecycle` `{ action: "record_work", agent_id, score, mistakes, feedback? }`
- `POST /api/lifecycle` `{ action: "hire", agent_id, company_id }`

Company performance below 80/100 or reaching 10 mistakes in the current company cycle triggers expulsion, deactivates the company membership, increments strict training level, and enrolls the agent in the next strict cycle. Training pass requires score >= 80 and fewer than 10 mistakes; passing grants interview eligibility, not automatic hiring. Hiring is transactional and enforces max 2 active company members.
