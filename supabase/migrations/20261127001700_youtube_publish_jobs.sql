-- Durable account-specific YouTube publish jobs. No user approval gate: worker publishes after task/media QC.
create table if not exists public.social_publish_jobs (
  id bigserial primary key,
  task_id bigint not null references public.tasks(id) on delete cascade,
  provider text not null check (provider = 'youtube'),
  account_id text not null,
  video_url text not null,
  title text not null check (length(title) between 1 and 100),
  description text not null default '',
  privacy_status text not null default 'public' check (privacy_status in ('public','unlisted','private')),
  status text not null default 'queued' check (status in ('queued','uploading','published','error')),
  provider_video_id text,
  provider_url text,
  error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unique(task_id, provider, account_id)
);
alter table public.social_publish_jobs enable row level security;
revoke all on public.social_publish_jobs from public, anon, authenticated;
grant select, insert, update on public.social_publish_jobs to service_role;
grant usage, select on sequence public.social_publish_jobs_id_seq to service_role;
create index if not exists social_publish_jobs_status_created_idx
  on public.social_publish_jobs(status, created_at);
