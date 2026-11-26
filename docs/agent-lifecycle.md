# Agent lifecycle (implementation contract)

This is a persistent city simulation/lifecycle, not a pool of arbitrary live agents.
The first stage stores lifecycle state; it does not import/seed ECC agents or start real worker execution.

## Agent sources and initial placement

- `ecc_pretrained`: agent identity comes from the ECC repository's trained-agent manifest.
- `scratch`: newly created Academy trainee.
- On ECC intake, split the available ECC roster approximately 50/50: one half enters Academy for training and the other half is assigned across city buildings for interview/hiring and support duties. Keep source identity stable so repeated imports cannot duplicate agents.
- Do not create/import an ECC roster until the exact source repository/manifest is confirmed.

## State progression

```text
ECC pretrained ── intake split ──> Academy (half) ── training/pass ──> Interview/Hire ──> Company
ECC pretrained ── intake split ──> City assignment (half) ──> interview/hiring/support
Scratch agent ───────────────────> Academy ── training/pass ──> Interview/Hire ──> Company

Company work:
  score below graduation/performance threshold OR 10 mistakes
    -> expelled from company -> Academy strict training Level 1
  pass Level 1 -> eligible for company hiring -> work/score again
  next failure -> Academy strict training Level 2
  pass Level 2 -> eligible for company hiring -> work/score again
  each later failure increments strict training level
```

A failure returns the agent to Academy; it does not delete the agent. Training completion and company hiring are separate events. Hiring must obey the existing company roster rule (maximum two active agents per company).

## Persistence

- `agent_lifecycle_profiles`: stable origin, current lifecycle state, level, score, mistake counters, current company and source key.
- `agent_training_cycles`: every training attempt, level/track, score, mistakes and pass/fail result.
- `agent_lifecycle_events`: append-only transition/audit history.
- Existing `agents` and `company_members` remain the existing directory/roster; migration does not change their API shapes.

## Provisional policy defaults

- Pass score: 80/100.
- Mistake threshold: 10.
- A training cycle's mistake counter resets when a new cycle starts; lifetime mistakes remain cumulative.
- Training level increments after each company expulsion; it never decreases.
- ECC split for an odd roster: Academy receives floor(n/2), city deployment receives the remainder.

These are implementation defaults pending owner confirmation; keep them configurable in the lifecycle service rather than hard-coded in UI.

## Safety/rollout

- This migration is additive and creates no agents.
- Lifecycle tables have RLS enabled and no public/anon policies. Read/write should be through trusted server-side service-role code only.
- Do not connect city labels to lifecycle records until API/state transitions are implemented and verified.
- Do not deploy or merge to `main` until migration and end-to-end state-transition tests pass.
