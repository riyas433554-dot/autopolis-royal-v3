-- Keep stale-task recovery compatible with agent_runs_status_check.
-- agent_runs only permits running/succeeded/failed; tasks use error for terminal failures.
CREATE OR REPLACE FUNCTION public.recover_stale_agent_tasks(p_now timestamp with time zone)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
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
    update public.agent_runs set status='failed',completed_at=p_now,error='Worker lease expired'
      where task_id=v_task.id and status='running';
    v_count := v_count+1;
  end loop;
  return v_count;
end;
$function$;
