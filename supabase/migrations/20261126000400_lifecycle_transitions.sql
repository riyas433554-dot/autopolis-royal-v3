-- Lifecycle transition RPCs. All mutations are transactional and service-role only.
create or replace function public.start_agent_training(p_agent_id integer, p_track text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile agent_lifecycle_profiles%rowtype;
  v_cycle_id bigint;
  v_cycle_number integer;
  v_track text;
begin
  select * into v_profile from agent_lifecycle_profiles
    where agent_id = p_agent_id for update;
  if not found then raise exception 'Lifecycle profile not found'; end if;

  if v_profile.lifecycle_status = 'training' then
    select id, cycle_number, track into v_cycle_id, v_cycle_number, v_track
      from agent_training_cycles
      where agent_id = p_agent_id and status = 'in_progress'
      order by cycle_number desc limit 1;
    if v_cycle_id is not null then
      return jsonb_build_object('ok', true, 'already_in_progress', true,
        'cycle_id', v_cycle_id, 'cycle_number', v_cycle_number, 'track', v_track);
    end if;
    raise exception 'Agent is marked training but has no active cycle';
  end if;
  if v_profile.lifecycle_status <> 'academy' then
    raise exception 'Agent must be in Academy to start training';
  end if;

  select id, cycle_number, track into v_cycle_id, v_cycle_number, v_track
    from agent_training_cycles
    where agent_id = p_agent_id and status = 'enrolled'
      and level = v_profile.training_level
    order by cycle_number desc limit 1 for update;

  if found then
    v_track := coalesce(nullif(p_track, ''), v_track);
    update agent_training_cycles set status = 'in_progress',
      track = v_track, started_at = now()
    where id = v_cycle_id;
  else
    select coalesce(max(cycle_number), 0) + 1 into v_cycle_number
      from agent_training_cycles where agent_id = p_agent_id;
    v_track := coalesce(nullif(p_track, ''),
      case when v_profile.training_level = 0 then 'foundation'
        else 'strict_level_' || v_profile.training_level::text end);

    insert into agent_training_cycles
      (agent_id, profile_id, level, track, cycle_number, status, started_at)
    values
      (p_agent_id, v_profile.id, v_profile.training_level, v_track,
       v_cycle_number, 'in_progress', now())
    returning id into v_cycle_id;
  end if;

  update agent_lifecycle_profiles set
    lifecycle_status = 'training', training_track = v_track,
    mistakes_this_cycle = 0, updated_at = now()
  where id = v_profile.id;

  update agents set status = 'working', current_task = 'Academy training: ' || v_track,
    building_slug = 'agent-academy' where id = p_agent_id;

  insert into agent_lifecycle_events
    (agent_id, profile_id, event_type, from_status, to_status, training_level,
     training_cycle_id, details)
  values (p_agent_id, v_profile.id, 'training_started', 'academy', 'training',
    v_profile.training_level, v_cycle_id, jsonb_build_object('track', v_track));

  return jsonb_build_object('ok', true, 'cycle_id', v_cycle_id,
    'cycle_number', v_cycle_number, 'level', v_profile.training_level, 'track', v_track);
end;
$$;

create or replace function public.complete_agent_training(
  p_agent_id integer, p_score numeric, p_mistakes integer, p_feedback text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile agent_lifecycle_profiles%rowtype;
  v_cycle agent_training_cycles%rowtype;
  v_passed boolean;
  v_next_status text;
begin
  if p_score is null or p_score < 0 or p_score > 100 then raise exception 'Score must be 0..100'; end if;
  if p_mistakes is null or p_mistakes < 0 then raise exception 'Mistakes must be >= 0'; end if;

  select * into v_profile from agent_lifecycle_profiles
    where agent_id = p_agent_id for update;
  if not found or v_profile.lifecycle_status <> 'training' then
    raise exception 'Agent is not in an active training cycle';
  end if;
  select * into v_cycle from agent_training_cycles
    where agent_id = p_agent_id and status = 'in_progress'
    order by cycle_number desc limit 1 for update;
  if not found then raise exception 'Active training cycle not found'; end if;

  v_passed := p_score >= 80 and p_mistakes < 10;
  v_next_status := case when v_passed then 'interview' else 'academy' end;

  update agent_training_cycles set status = case when v_passed then 'passed' else 'failed' end,
    score = p_score, mistakes = p_mistakes, feedback = p_feedback, completed_at = now()
  where id = v_cycle.id;

  update agent_lifecycle_profiles set
    lifecycle_status = v_next_status, current_score = p_score,
    mistakes_this_cycle = p_mistakes, lifetime_mistakes = lifetime_mistakes + p_mistakes,
    completed_training_cycles = completed_training_cycles + case when v_passed then 1 else 0 end,
    last_training_score = p_score, last_evaluated_at = now(), updated_at = now()
  where id = v_profile.id;

  update agents set status = 'idle',
    current_task = case when v_passed then 'Training passed — eligible for interview/hiring'
      else 'Training not passed — retry Academy training' end
  where id = p_agent_id;

  insert into agent_lifecycle_events
    (agent_id, profile_id, event_type, from_status, to_status, training_level,
     score, mistake_count, training_cycle_id, details)
  values (p_agent_id, v_profile.id,
    case when v_passed then 'training_passed' else 'training_failed' end,
    'training', v_next_status, v_profile.training_level, p_score, p_mistakes,
    v_cycle.id, jsonb_build_object('feedback', coalesce(p_feedback, '')));

  return jsonb_build_object('ok', true, 'passed', v_passed,
    'status', v_next_status, 'score', p_score, 'level', v_profile.training_level);
end;
$$;

create or replace function public.record_agent_work(
  p_agent_id integer, p_score numeric, p_mistakes integer, p_feedback text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile agent_lifecycle_profiles%rowtype;
  v_new_mistakes integer;
  v_failed boolean;
  v_new_level integer;
  v_company_id integer;
  v_cycle_number integer;
  v_cycle_id bigint;
begin
  if p_score is null or p_score < 0 or p_score > 100 then raise exception 'Score must be 0..100'; end if;
  if p_mistakes is null or p_mistakes < 0 then raise exception 'Mistakes must be >= 0'; end if;

  select * into v_profile from agent_lifecycle_profiles
    where agent_id = p_agent_id for update;
  if not found or v_profile.lifecycle_status <> 'company' then
    raise exception 'Agent must be an active company member to record company work';
  end if;

  v_new_mistakes := v_profile.mistakes_this_cycle + p_mistakes;
  v_failed := p_score < 80 or v_new_mistakes >= 10;
  v_company_id := v_profile.company_id;

  if v_failed then
    v_new_level := v_profile.training_level + 1;
    update company_members set is_active = false
      where agent_id = p_agent_id and company_id = v_company_id and is_active = true;

    select coalesce(max(cycle_number), 0) + 1 into v_cycle_number
      from agent_training_cycles where agent_id = p_agent_id;
    insert into agent_training_cycles
      (agent_id, profile_id, level, track, cycle_number, status)
    values
      (p_agent_id, v_profile.id, v_new_level, 'strict_level_' || v_new_level::text,
       v_cycle_number, 'enrolled')
    returning id into v_cycle_id;

    update agent_lifecycle_profiles set
      lifecycle_status = 'academy', training_level = v_new_level,
      training_track = 'strict_level_' || v_new_level::text,
      company_id = null, current_score = p_score,
      mistakes_this_cycle = v_new_mistakes,
      lifetime_mistakes = lifetime_mistakes + p_mistakes,
      last_evaluated_at = now(), updated_at = now()
    where id = v_profile.id;

    update agents set status = 'idle', current_task = 'Returned to Academy — strict Level ' || v_new_level,
      building_slug = 'agent-academy' where id = p_agent_id;

    insert into agent_lifecycle_events
      (agent_id, profile_id, event_type, from_status, to_status, training_level,
       score, mistake_count, company_id, training_cycle_id, details)
    values (p_agent_id, v_profile.id, 'company_expelled', 'company', 'academy',
      v_new_level, p_score, v_new_mistakes, v_company_id, v_cycle_id,
      jsonb_build_object('reason', case when p_score < 80 then 'low_score' else 'mistake_limit' end,
        'feedback', coalesce(p_feedback, '')));
  else
    update agent_lifecycle_profiles set current_score = p_score,
      mistakes_this_cycle = v_new_mistakes,
      lifetime_mistakes = lifetime_mistakes + p_mistakes,
      last_evaluated_at = now(), updated_at = now()
    where id = v_profile.id;

    insert into agent_lifecycle_events
      (agent_id, profile_id, event_type, from_status, to_status, training_level,
       score, mistake_count, company_id, details)
    values (p_agent_id, v_profile.id, 'company_work_scored', 'company', 'company',
      v_profile.training_level, p_score, v_new_mistakes, v_company_id,
      jsonb_build_object('feedback', coalesce(p_feedback, '')));
  end if;

  return jsonb_build_object('ok', true, 'expelled', v_failed,
    'status', case when v_failed then 'academy' else 'company' end,
    'score', p_score, 'mistakes_this_cycle', v_new_mistakes,
    'training_level', case when v_failed then v_new_level else v_profile.training_level end);
end;
$$;

create or replace function public.hire_lifecycle_agent(p_agent_id integer, p_company_id integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile agent_lifecycle_profiles%rowtype;
  v_company companies%rowtype;
  v_agent agents%rowtype;
  v_active_count integer;
  v_member_id integer;
begin
  select * into v_profile from agent_lifecycle_profiles
    where agent_id = p_agent_id for update;
  if not found or v_profile.lifecycle_status <> 'interview' then
    raise exception 'Agent must pass Academy and be interview-eligible before hiring';
  end if;

  select * into v_company from companies where id = p_company_id for update;
  if not found then raise exception 'Company not found'; end if;
  select count(*) into v_active_count from company_members
    where company_id = p_company_id and is_active = true;
  if v_active_count >= 2 then raise exception 'Company has reached its 2-agent active limit'; end if;

  select * into v_agent from agents where id = p_agent_id for update;
  insert into company_members (company_id, agent_id, agent_name, is_active)
    values (p_company_id, p_agent_id, v_agent.name, true)
    returning id into v_member_id;

  update agent_lifecycle_profiles set lifecycle_status = 'company',
    company_id = p_company_id, assigned_building_slug = v_company.building_slug,
    assignment_duty = null, mistakes_this_cycle = 0,
    training_track = null, updated_at = now()
  where id = v_profile.id;

  update agents set building_slug = v_company.building_slug, status = 'idle',
    current_task = 'Hired by ' || v_company.name
  where id = p_agent_id;

  insert into agent_lifecycle_events
    (agent_id, profile_id, event_type, from_status, to_status, training_level,
     score, company_id, details)
  values (p_agent_id, v_profile.id, 'company_hired', 'interview', 'company',
    v_profile.training_level, v_profile.current_score, p_company_id,
    jsonb_build_object('company_member_id', v_member_id));

  return jsonb_build_object('ok', true, 'agent_id', p_agent_id,
    'company_id', p_company_id, 'company_member_id', v_member_id);
end;
$$;

revoke all on function public.start_agent_training(integer, text) from public, anon, authenticated;
revoke all on function public.complete_agent_training(integer, numeric, integer, text) from public, anon, authenticated;
revoke all on function public.record_agent_work(integer, numeric, integer, text) from public, anon, authenticated;
revoke all on function public.hire_lifecycle_agent(integer, integer) from public, anon, authenticated;
grant execute on function public.start_agent_training(integer, text) to service_role;
grant execute on function public.complete_agent_training(integer, numeric, integer, text) to service_role;
grant execute on function public.record_agent_work(integer, numeric, integer, text) to service_role;
grant execute on function public.hire_lifecycle_agent(integer, integer) to service_role;
