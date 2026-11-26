-- Allow failed agents to be retried and keep a task-specific busy marker.
create or replace function public.claim_agent_task(p_task_id integer,p_agent_id integer,p_agent_name text,p_now timestamptz)
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
    set status='busy', current_task='Running task #'||p_task_id||': '||(select title from public.tasks where id=p_task_id)
    where id=p_agent_id and lower(coalesce(status,'')) in ('idle','active','available','error')
    returning * into v_agent;
  if not found then
    return jsonb_build_object('claimed',false,'reason','agent_busy');
  end if;

  update public.tasks
    set status='running', progress=10, started_at=p_now, completed_at=null,
        error=null, attempts=coalesce(attempts,0)+1, agent_name=p_agent_name,
        claimed_agent_id=p_agent_id, lease_expires_at=p_now+interval '10 minutes'
    where id=p_task_id and status='queued'
    returning * into v_task;
  if not found then
    update public.agents set status='idle',current_task=null where id=p_agent_id and status='busy'
      and current_task like 'Running task #'||p_task_id||':%';
    return jsonb_build_object('claimed',false,'reason','task_claimed');
  end if;

  return jsonb_build_object('claimed',true,'task',to_jsonb(v_task),'agent',to_jsonb(v_agent));
end;
$$;
