-- Multi-account durable social publishing, per-account pacing, and stale-claim recovery.
alter table public.social_publish_jobs drop constraint if exists social_publish_jobs_provider_check;
alter table public.social_publish_jobs add constraint social_publish_jobs_provider_check
  check (provider in ('youtube','instagram','facebook'));
alter table public.social_publish_jobs drop constraint if exists social_publish_jobs_status_check;
alter table public.social_publish_jobs add constraint social_publish_jobs_status_check
  check (status in ('queued','dispatching','uploading','published','error'));

alter table public.social_publish_jobs
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists dispatch_lease_expires_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists platform_payload jsonb not null default '{}'::jsonb;

create index if not exists social_publish_jobs_due_idx
  on public.social_publish_jobs(status, next_attempt_at, created_at);

create table if not exists public.social_publish_account_limits (
  provider text not null check (provider in ('youtube','instagram','facebook')),
  account_id text not null,
  next_allowed_at timestamptz not null default now(),
  daily_date date not null default current_date,
  daily_count integer not null default 0 check (daily_count >= 0),
  updated_at timestamptz not null default now(),
  primary key(provider, account_id)
);
alter table public.social_publish_account_limits enable row level security;
revoke all on public.social_publish_account_limits from public, anon, authenticated;
grant select, insert, update on public.social_publish_account_limits to service_role;

create or replace function public.claim_social_publish_jobs(
  p_limit integer default 4,
  p_min_interval_seconds integer default 900,
  p_daily_limit integer default 6
)
returns table (
  id bigint, task_id bigint, provider text, account_id text, video_url text,
  title text, description text, privacy_status text, status text, attempts integer,
  platform_payload jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit,4), 10));
  v_interval integer := greatest(60, least(coalesce(p_min_interval_seconds,900), 86400));
  v_daily integer := greatest(1, least(coalesce(p_daily_limit,6), 50));
begin
  -- Recover only pre-upload claims. An interrupted actual upload is not auto-retried
  -- because the provider may have accepted it before the worker crashed.
  update public.social_publish_jobs
     set status='queued', dispatch_lease_expires_at=null,
         next_attempt_at=now(), updated_at=now(),
         error=coalesce(error,'Recovered expired dispatcher lease')
   where status='dispatching' and dispatch_lease_expires_at < now();

  update public.social_publish_jobs
     set status='error', dispatch_lease_expires_at=null, updated_at=now(),
         error='Publisher process interrupted during upload; verify provider account before retrying to avoid duplicate posts'
   where status='uploading' and updated_at < now() - interval '45 minutes';

  return query
  with candidates as (
    select j.id, j.provider, j.account_id
      from public.social_publish_jobs j
      left join public.social_publish_account_limits l
        on l.provider=j.provider and l.account_id=j.account_id
     where j.status='queued'
       and j.next_attempt_at <= now()
       and (l.next_allowed_at is null or l.next_allowed_at <= now())
       and (l.daily_date < current_date or l.daily_count < v_daily or l.daily_date is null)
     order by j.next_attempt_at, j.created_at, j.id
     for update of j skip locked
     limit v_limit
  ), claimed as (
    update public.social_publish_jobs j
       set status='dispatching',
           dispatch_lease_expires_at=now() + interval '15 minutes',
           last_attempt_at=now(),
           updated_at=now()
      from candidates c
     where j.id=c.id
    returning j.id, j.task_id, j.provider, j.account_id, j.video_url, j.title,
              j.description, j.privacy_status, j.status, j.attempts, j.platform_payload
  ), paced as (
    insert into public.social_publish_account_limits(provider,account_id,next_allowed_at,daily_date,daily_count,updated_at)
    select provider,account_id,now() + make_interval(secs=>v_interval),current_date,1,now()
      from claimed
    on conflict(provider,account_id) do update
      set next_allowed_at=excluded.next_allowed_at,
          daily_date=case when social_publish_account_limits.daily_date=current_date
                          then current_date else current_date end,
          daily_count=case when social_publish_account_limits.daily_date=current_date
                           then social_publish_account_limits.daily_count+1 else 1 end,
          updated_at=now()
    returning provider,account_id
  )
  select c.id,c.task_id,c.provider,c.account_id,c.video_url,c.title,c.description,
         c.privacy_status,c.status,c.attempts,c.platform_payload
    from claimed c
    cross join (select count(*) from paced) p;
end;
$$;
revoke all on function public.claim_social_publish_jobs(integer,integer,integer) from public, anon, authenticated;
grant execute on function public.claim_social_publish_jobs(integer,integer,integer) to service_role;
