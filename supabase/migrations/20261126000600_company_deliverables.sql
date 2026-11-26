-- Company deliverable pipeline: keep generated artifacts attached to their task.
-- Additive only; earnings and publication remain owner-approved.
alter table public.tasks
  add column if not exists company_id integer references public.companies(id) on delete set null,
  add column if not exists assigned_agent_id integer references public.agents(id) on delete set null,
  add column if not exists deliverable_type text not null default 'report';

alter table public.tasks
  drop constraint if exists tasks_deliverable_type_check;
alter table public.tasks
  add constraint tasks_deliverable_type_check
  check (deliverable_type in (
    'app', 'website', 'automation', 'game', 'ad', 'video', 'reel',
    'anime', 'movie', 'proposal', 'report', 'design', 'code', 'other'
  ));

alter table public.outputs
  add column if not exists content text not null default '',
  add column if not exists task_id integer references public.tasks(id) on delete set null,
  add column if not exists deliverable_type text not null default 'report',
  add column if not exists source_agent_id integer references public.agents(id) on delete set null,
  add column if not exists approved_at timestamptz;

create unique index if not exists outputs_task_unique_idx
  on public.outputs(task_id)
  where task_id is not null;

create index if not exists tasks_company_queue_idx
  on public.tasks(company_id, status, created_at desc)
  where company_id is not null;

alter table public.outputs enable row level security;
revoke all on public.outputs from public, anon, authenticated;
grant select, insert, update on public.outputs to service_role;
grant usage, select on sequence public.outputs_id_seq to service_role;
