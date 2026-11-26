-- Private generated source files for company deliverables.
create table if not exists autopolis_private.company_deliverable_files (
  task_id integer not null references public.tasks(id) on delete cascade,
  output_id integer references public.outputs(id) on delete cascade,
  path text not null,
  content text not null,
  mime_type text not null default 'text/plain; charset=utf-8',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(task_id,path)
);
revoke all on table autopolis_private.company_deliverable_files from public, anon, authenticated;
grant select, insert, update, delete on table autopolis_private.company_deliverable_files to service_role;

create or replace function public.write_company_artifact_file(p_task_id integer,p_path text,p_content text,p_mime_type text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, autopolis_private
as $$
declare
  v_count integer;
  v_bytes bigint;
begin
  insert into autopolis_private.company_deliverable_files(task_id,path,content,mime_type)
  values (p_task_id,p_path,p_content,p_mime_type)
  on conflict (task_id,path) do update set content=excluded.content,mime_type=excluded.mime_type,updated_at=now();
  select count(*),coalesce(sum(octet_length(content)),0) into v_count,v_bytes
  from autopolis_private.company_deliverable_files where task_id=p_task_id;
  if v_count > 20 or v_bytes > 500000 then
    raise exception 'Artifact task limit exceeded: maximum 20 files and 500 KB total';
  end if;
  return jsonb_build_object('file_count',v_count,'total_bytes',v_bytes);
end;
$$;

create or replace function public.attach_company_artifact_files(p_task_id integer,p_output_id integer)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, autopolis_private
as $$
declare v_count integer;
begin
  update autopolis_private.company_deliverable_files set output_id=p_output_id,updated_at=now()
  where task_id=p_task_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.get_company_artifact_files(p_output_id integer)
returns table(path text,content text,mime_type text,size_bytes integer)
language sql
security definer
set search_path = pg_catalog, autopolis_private
as $$
  select f.path,f.content,f.mime_type,octet_length(f.content)
  from autopolis_private.company_deliverable_files f
  where f.output_id=p_output_id
  order by f.path;
$$;

create or replace function public.delete_company_artifact_files(p_task_id integer)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, autopolis_private
as $$
declare v_count integer;
begin
  delete from autopolis_private.company_deliverable_files where task_id=p_task_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.write_company_artifact_file(integer,text,text,text) from public, anon, authenticated;
revoke all on function public.attach_company_artifact_files(integer,integer) from public, anon, authenticated;
revoke all on function public.get_company_artifact_files(integer) from public, anon, authenticated;
revoke all on function public.delete_company_artifact_files(integer) from public, anon, authenticated;
grant execute on function public.write_company_artifact_file(integer,text,text,text) to service_role;
grant execute on function public.attach_company_artifact_files(integer,integer) to service_role;
grant execute on function public.get_company_artifact_files(integer) to service_role;
grant execute on function public.delete_company_artifact_files(integer) to service_role;
