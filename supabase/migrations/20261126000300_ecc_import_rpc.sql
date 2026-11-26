-- ECC roster import is a single database transaction and idempotent by source key.
-- Only the trusted service-role API may execute this function.
alter table agent_lifecycle_profiles
  drop constraint if exists agent_lifecycle_profiles_lifecycle_status_check;
alter table agent_lifecycle_profiles
  add constraint agent_lifecycle_profiles_lifecycle_status_check
  check (lifecycle_status in (
    'ecc_company', 'city_staff', 'academy', 'training', 'interview', 'company',
    'expelled', 'graduated', 'inactive'
  ));

create or replace function public.import_ecc_agent_definitions(p_agents jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  v_agent_id integer;
  v_profile_id bigint;
  v_key text;
  v_name text;
  v_role text;
  v_department text;
  v_code text;
  v_status text;
  v_building text;
  v_duty text;
  v_created integer := 0;
  v_updated integer := 0;
  v_academy integer := 0;
  v_city integer := 0;
begin
  if jsonb_typeof(p_agents) <> 'array' then
    raise exception 'p_agents must be a JSON array';
  end if;

  for item in select value from jsonb_array_elements(p_agents)
  loop
    v_key := nullif(item->>'source_agent_key', '');
    v_name := nullif(item->>'name', '');
    v_role := nullif(item->>'role', '');
    v_department := coalesce(nullif(item->>'department', ''), 'ECC');
    v_status := coalesce(nullif(item->>'lifecycle_status', ''), 'academy');
    v_building := nullif(item->>'assigned_building_slug', '');
    v_duty := nullif(item->>'assignment_duty', '');

    if v_key is null or v_name is null or v_role is null then
      raise exception 'ECC item missing source_agent_key, name or role';
    end if;
    if v_status not in ('academy', 'city_staff') then
      raise exception 'Invalid initial ECC lifecycle status: %', v_status;
    end if;
    v_code := 'ECC-' || upper(regexp_replace(v_key, '[^a-zA-Z0-9]', '', 'g'));
    v_code := left(v_code, 24);

    select id into v_profile_id
      from agent_lifecycle_profiles
      where source_repo = 'affaan-m/ECC' and source_agent_key = v_key;

    if v_profile_id is null then
      insert into agents (name, code, role, department, building_slug, status, current_task, avatar_color)
      values (v_name, v_code, v_role, v_department, coalesce(v_building, 'agent-academy'),
              'idle', 'Awaiting assignment', '#c9a227')
      returning id into v_agent_id;

      insert into agent_lifecycle_profiles (
        agent_id, origin, source_repo, source_agent_key, source_path, source_blob_sha,
        source_description, source_tools, source_model, lifecycle_status,
        training_level, assigned_building_slug, assignment_duty
      ) values (
        v_agent_id, 'ecc_preconfigured', 'affaan-m/ECC', v_key,
        item->>'source_path', item->>'source_blob_sha', item->>'source_description',
        item->>'source_tools', item->>'source_model', v_status,
        0, coalesce(v_building, 'agent-academy'), v_duty
      ) returning id into v_profile_id;

      insert into agent_lifecycle_events (
        agent_id, profile_id, event_type, to_status, training_level, details
      ) values (
        v_agent_id, v_profile_id, 'ecc_imported', v_status, 0,
        jsonb_build_object('source_repo', 'affaan-m/ECC', 'source_agent_key', v_key)
      );
      v_created := v_created + 1;
    else
      select agent_id into v_agent_id from agent_lifecycle_profiles where id = v_profile_id;
      update agent_lifecycle_profiles set
        source_path = item->>'source_path',
        source_blob_sha = item->>'source_blob_sha',
        source_description = item->>'source_description',
        source_tools = item->>'source_tools',
        source_model = item->>'source_model',
        updated_at = now()
      where id = v_profile_id;
      update agents set name = v_name, role = v_role, department = v_department
      where id = v_agent_id;
      v_updated := v_updated + 1;
    end if;

    if v_status = 'academy' then v_academy := v_academy + 1;
    else v_city := v_city + 1; end if;
  end loop;

  return jsonb_build_object(
    'created', v_created, 'updated', v_updated,
    'academy_assignments', v_academy, 'city_staff_assignments', v_city
  );
end;
$$;

revoke all on function public.import_ecc_agent_definitions(jsonb) from public;
revoke all on function public.import_ecc_agent_definitions(jsonb) from anon, authenticated;
grant execute on function public.import_ecc_agent_definitions(jsonb) to service_role;
