# Agent lifecycle (implementation contract)

Autopolis models ECC's published agent definitions as persistent city-agent identities and lifecycle records. The 3D citizen animation is visual; this lifecycle panel records real database state. Autonomous model execution is a separate runtime integration and is not claimed by this lifecycle foundation.

## ECC source of truth

- Upstream: https://github.com/affaan-m/ECC
- Pinned snapshot: 4adeee6732a12d1540f49a4d50a38ce8c97f9a53
- Source directory: agents/*.md (72 definitions at this snapshot)
- Local pinned manifest: data/ecc-agent-manifest.json
- These files are role/persona/tool/model instructions, not trained model weights. Academy score and training are Autopolis lifecycle data.
- ECC role metadata is parsed from Markdown frontmatter; do not invent model, tools, or role data. Keep source path and upstream blob SHA for provenance.
- Re-import is idempotent by unique key affaan-m/ECC:<agent-definition-key> and preserves lifecycle progress.

## Agent sources and initial placement

- ecc_preconfigured: a profile sourced from a pinned ECC agent definition.
- scratch: a newly created Academy trainee with no ECC source.
- First ECC intake splits the 72 definitions into 35 Academy trainees + 37 city staff. The first 35 manifest entries go to Academy; the remaining 37 are assigned one-to-one to the 37 seeded buildings in deterministic slug order.
- agent-academy is one of the 37 city buildings: it receives one ECC city staff member as Academy staff, in addition to the 35 Academy trainees. Do not exclude Academy from the 37-building staff assignment.
- Import rejects a building roster that is not exactly 37 unique slugs, rather than silently creating duplicate or missing assignments.
- City staff can support interviews, hiring and building operations. They are not company-hired worker slots unless explicitly hired.
- Import only pinned Markdown metadata/instructions. Never download or execute ECC scripts/hooks as part of roster import.

## State progression

ECC definitions -> pinned import -> 35 Academy trainees + 37 city staff
Scratch agent -> Academy
Academy training/pass -> interview eligibility -> Company (max 2 active members)
Company score below threshold OR 10 mistakes -> expelled -> Academy strict training Level 1
Pass Level 1 -> eligible for hiring -> company work
Next failure -> Academy strict training Level 2
Pass Level 2 -> eligible for hiring -> company work
Every later failure increments strict training level.

A failure returns the agent to Academy; it does not delete the agent. Training completion and company hiring are separate events. Existing company roster enforcement remains authoritative.

## Persistence

- agent_lifecycle_profiles: source, state, level, score, mistake counters, current company and assignment.
- agent_training_cycles: each training attempt, level/track, score, mistakes and pass/fail result.
- agent_lifecycle_events: transition/audit history.
- Existing agents and company_members remain the directory/roster; existing API response shapes are not changed.

## Policy defaults

- Pass score: 80/100.
- Mistake threshold: 10.
- Per-cycle mistakes reset when a new cycle starts; lifetime mistakes remain cumulative.
- Training level increments after each company expulsion and never decreases.
- ECC split: 35 Academy + 37 city staff, exactly one city staff member per seeded building.

## Safety and rollout

- Migrations are additive; no ECC import is run automatically.
- Lifecycle tables have RLS enabled and no public/anon policies; trusted server-side service-role code only.
- Import is metadata-only; no upstream hooks/scripts execute.
- Do not merge/deploy until migrations, importer idempotency, transition tests and end-to-end verification are green.

## Import endpoint

After migrations 001–004 are applied and the server has the private environment variable AUTOPOLIS_LIFECYCLE_ADMIN_TOKEN, the owner can trigger import with an authenticated POST to /api/eccimport. Keep the token private; never paste it into chat or commit it.

The endpoint fetches only the pinned agents/*.md files, parses frontmatter, and calls the transactional Supabase RPC. It does not execute ECC scripts/hooks. First import assigns the first 35 definitions to Academy and the remaining 37 one-to-one to all 37 building slugs, including Academy. Re-import updates source metadata and preserves lifecycle status, score, level, mistakes and assignments.

## Lifecycle API

GET /api/lifecycle returns lifecycle profiles with agent/company summaries.
Owner mutations require Authorization: Bearer AUTOPOLIS_LIFECYCLE_ADMIN_TOKEN:

- POST /api/lifecycle with action start_training, agent_id and optional track
- POST /api/lifecycle with action complete_training, agent_id, score, mistakes and optional feedback
- POST /api/lifecycle with action record_work, agent_id, score, mistakes and optional feedback
- POST /api/lifecycle with action hire, agent_id and company_id

Company score below 80/100 or reaching 10 mistakes in the current company cycle triggers expulsion, deactivates company membership, increments strict training level, and enrolls the agent in the next strict cycle. Training pass requires score >= 80 and fewer than 10 mistakes; passing grants interview eligibility, not automatic hiring. Hiring is transactional and enforces max 2 active company members.
