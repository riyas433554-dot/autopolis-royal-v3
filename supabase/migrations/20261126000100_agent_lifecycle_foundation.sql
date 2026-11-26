-- Autopolis Royal: persistent agent lifecycle foundation
-- Additive only. Does not seed agents or alter existing API response shapes.
-- Defaults: graduation score >= 80; 10 mistakes triggers strict retraining.
-- Mistakes are tracked both per current training/work cycle and lifetime.

create table if not exists agent_lifecycle_profiles (
  id bigserial primary key,
  agent_id integer not null unique references agents(id) on delete cascade,
  origin text not null check (origin in ('ecc_preconfigured', 'scratch')),
  source_repo text,
  source_agent_key text,
  lifecycle_status text not null default 'academy'
    check (lifecycle_status in (
      'ecc_company', 'academy', 'training', 'interview', 'company',
      'expelled', 'graduated', 'inactive'
    )),
  training_level integer not null default 0 check (training_level >= 0),
  training_track text,
  company_id integer references companies(id) on delete set null,
  current_score numeric(5,2) not null default 0
    check (current_score >= 0 and current_score <= 100),
  mistakes_this_cycle integer not null default 0 check (mistakes_this_cycle >= 0),
  lifetime_mistakes integer not null default 0 check (lifetime_mistakes >= 0),
  completed_training_cycles integer not null default 0 check (completed_training_cycles >= 0),
  last_training_score numeric(5,2)
    check (last_training_score is null or (last_training_score >= 0 and last_training_score <= 100)),
  last_evaluated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_lifecycle_source_key_unique unique (source_repo, source_agent_key)
);

create table if not exists agent_training_cycles (
  id bigserial primary key,
  agent_id integer not null references agents(id) on delete cascade,
  profile_id bigint not null references agent_lifecycle_profiles(id) on delete cascade,
  level integer not null check (level >= 0),
  track text not null,
  cycle_number integer not null check (cycle_number > 0),
  status text not null default 'enrolled'
    check (status in ('enrolled', 'in_progress', 'passed', 'failed', 'withdrawn')),
  score numeric(5,2)
    check (score is null or (score >= 0 and score <= 100)),
  mistakes integer not null default 0 check (mistakes >= 0),
  feedback text,
  enrolled_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (agent_id, cycle_number)
);

create table if not exists agent_lifecycle_events (
  id bigserial primary key,
  agent_id integer not null references agents(id) on delete cascade,
  profile_id bigint references agent_lifecycle_profiles(id) on delete set null,
  event_type text not null,
  from_status text,
  to_status text,
  training_level integer,
  score numeric(5,2),
  mistake_count integer,
  company_id integer references companies(id) on delete set null,
  training_cycle_id bigint references agent_training_cycles(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_lifecycle_status_idx
  on agent_lifecycle_profiles (lifecycle_status, training_level);
create index if not exists agent_lifecycle_company_idx
  on agent_lifecycle_profiles (company_id)
  where company_id is not null;
create index if not exists agent_training_agent_recent_idx
  on agent_training_cycles (agent_id, created_at desc);
create index if not exists agent_lifecycle_events_agent_recent_idx
  on agent_lifecycle_events (agent_id, created_at desc);

-- New lifecycle tables are server-managed. No anon/authenticated policies are added.
alter table agent_lifecycle_profiles enable row level security;
alter table agent_training_cycles enable row level security;
alter table agent_lifecycle_events enable row level security;
