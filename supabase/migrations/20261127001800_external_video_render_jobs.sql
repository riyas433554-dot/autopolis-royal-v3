-- Durable external GPU/video render jobs. Renderer hosts are independently deployable.
create table if not exists public.video_render_jobs (
  id bigserial primary key,
  task_id bigint not null unique references public.tasks(id) on delete cascade,
  provider text not null default 'external',
  renderer_job_id text,
  status text not null default 'queued'
    check (status in ('queued','submitting','submitted','rendering','ready','publishing','published','failed')),
  video_url text,
  qc_passed boolean not null default false,
  qc_report jsonb not null default '{}'::jsonb,
  provider_video_id text,
  provider_url text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  rendered_at timestamptz,
  published_at timestamptz
);
create unique index if not exists video_render_jobs_provider_job_idx
  on public.video_render_jobs(provider, renderer_job_id)
  where renderer_job_id is not null;
create index if not exists video_render_jobs_status_created_idx
  on public.video_render_jobs(status, created_at);
alter table public.video_render_jobs enable row level security;
revoke all on public.video_render_jobs from public, anon, authenticated;
grant select, insert, update on public.video_render_jobs to service_role;
grant usage, select on sequence public.video_render_jobs_id_seq to service_role;
