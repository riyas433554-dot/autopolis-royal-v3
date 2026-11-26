-- Lease tokens prevent an expired worker from overwriting a newer task retry.
alter table public.tasks add column if not exists lease_token text;

drop function if exists public.claim_agent_task(integer,integer,text,timestamptz);
drop function if exists public.heartbeat_agent_task(integer,integer,integer,timestamptz);
drop function if exists public.release_agent_task(integer,integer,text);

create or replace function public.claim_agent_task(p_task_id integer,p_agent_id integer,p_agent_name text,p_lease_token text,p_now timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_task public.tasks%rowtype;
  v_agent public.agents%rowtype;
begin
  update public.agents
    set status='busy', current_task='Running task #'||p_task_id||' · lease '||left(p_lease_token,8)||': '||(select title from public.tasks where id=p_task_id)
    where id=p_agent_id and lower(coalesce(status,'')) in ('idle','active','available','error')
    returning * into v_agent;
  if not found then return jsonb_build_object('claimed',false,'reason','agent_busy'); end if;

  update public.tasks
    set status='running', progress=10, started_at=p_now, completed_at=null,
        error=null, attempts=coalesce(attempts,0)+1, agent_name=p_agent_name,
        claimed_agent_id=p_agent_id, lease_expires_at=p_now+interval '10 minutes',
        lease_token=p_lease_token
    where id=p_task_id and status='queued'
    returning * into v_task;
  if not found then
    update public.agents set status='idle',current_task=null where id=p_agent_id and status='busy'
      and current_task like 'Running task #'||p_task_id||' · lease '||left(p_lease_token,8)||':%';
    return jsonb_build_object('claimed',false,'reason','task_claimed');
  end if;
  return jsonb_build_object('claimed',true,'task',to_jsonb(v_task),'agent',to_jsonb(v_agent));
end;
$$;

create or replace function public.heartbeat_agent_task(p_task_id integer,p_agent_id integer,p_lease_token text,p_progress integer,p_now timestamptz)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.tasks
    set lease_expires_at=p_now+interval '10 minutes',
        progress=greatest(progress,least(90,greatest(10,coalesce(p_progress,10))))
    where id=p_task_id and status='running' and claimed_agent_id=p_agent_id and lease_token=p_lease_token;
  return found;
end;
$$;

create or replace function public.release_agent_task(p_task_id integer,p_agent_id integer,p_lease_token text,p_error text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_marker text;
begin
  select 'Running task #'||p_task_id||' · lease '||left(p_lease_token,8)||': '||title
    into v_marker from public.tasks where id=p_task_id;
  update public.tasks
    set status='queued',progress=0,started_at=null,claimed_agent_id=null,lease_expires_at=null,lease_token=null,
        error=left(coalesce(p_error,'Run ledger unavailable'),500)
    where id=p_task_id and status='running' and claimed_agent_id=p_agent_id and lease_token=p_lease_token;
  if not found then return false; end if;
  update public.agents set status='idle',current_task=null where id=p_agent_id and status='busy' and current_task=v_marker;
  return true;
end;
$$;

create or replace function public.recover_stale_agent_tasks(p_now timestamptz)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_task record;
  v_count integer := 0;
  v_marker text;
begin
  for v_task in
    select id,claimed_agent_id,lease_token,agent_name from public.tasks
    where status='running' and lease_expires_at is not null and lease_expires_at < p_now
    for update
  loop
    select 'Running task #'||v_task.id||' · lease '||left(v_task.lease_token,8)||': '||title
      into v_marker from public.tasks where id=v_task.id;
    update public.tasks
      set status='error',progress=0,completed_at=p_now,claimed_agent_id=null,lease_expires_at=null,lease_token=null,
          error='Worker lease expired. Inspect saved draft/files before requeueing.'
      where id=v_task.id and lease_token=v_task.lease_token;
    update public.agents set status='idle',current_task=null
      where id=v_task.claimed_agent_id and status='busy' and current_task=v_marker;
    update public.agent_runs set status='error',completed_at=p_now,error='Worker lease expired'
      where task_id=v_task.id and status='running';
    v_count := v_count+1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.claim_agent_task(integer,integer,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.heartbeat_agent_task(integer,integer,text,integer,timestamptz) from public, anon, authenticated;
revoke all on function public.release_agent_task(integer,integer,text,text) from public, anon, authenticated;
revoke all on function public.recover_stale_agent_tasks(timestamptz) from public, anon, authenticated;
grant execute on function public.claim_agent_task(integer,integer,text,text,timestamptz) to service_role;
grant execute on function public.heartbeat_agent_task(integer,integer,text,integer,timestamptz) to service_role;
grant execute on function public.release_agent_task(integer,integer,text,text) to service_role;
grant execute on function public.recover_stale_agent_tasks(timestamptz) to service_role;
