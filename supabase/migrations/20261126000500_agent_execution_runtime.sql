-- Autopolis agent execution ledger and task result storage.
-- Additive only; no task is claimed or run by this migration.
alter table public.tasks
  add column if not exists description text,
  add column if not exists result text,
  add column if not exists error text,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists attempts integer not null default 0;

alter table public.tasks
  drop constraint if exists tasks_attempts_nonnegative;
alter table public.tasks
  add constraint tasks_attempts_nonnegative check (attempts >= 0);

create index if not exists tasks_queued_priority_idx
  on public.tasks (priority, created_at)
  where status = 'queued';

create table if not exists public.agent_runs (
  id bigserial primary key,
  task_id integer not null references public.tasks(id) on delete cascade,
  agent_id integer not null references public.agents(id) on delete restrict,
  lifecycle_profile_id bigint references public.agent_lifecycle_profiles(id) on delete set null,
  provider text not null,
  model text not null,
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed')),
  input_text text not null,
  output_text text,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists agent_runs_task_recent_idx
  on public.agent_runs (task_id, started_at desc);
create index if not exists agent_runs_agent_recent_idx
  on public.agent_runs (agent_id, started_at desc);

alter table public.agent_runs enable row level security;
revoke all on public.agent_runs from public, anon, authenticated;
grant select, insert, update on public.agent_runs to service_role;
grant usage, select on sequence public.agent_runs_id_seq to service_role;
