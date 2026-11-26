-- Parent task linkage for bounded company-agent follow-up work.
alter table public.tasks
  add column if not exists parent_task_id integer references public.tasks(id) on delete cascade;
create index if not exists tasks_parent_task_idx on public.tasks(parent_task_id) where parent_task_id is not null;

create or replace function public.list_company_artifact_files_for_task(p_task_id integer)
returns table(path text,mime_type text,size_bytes integer)
language sql
security definer
set search_path = pg_catalog, autopolis_private
as $$
  select f.path,f.mime_type,octet_length(f.content)
  from autopolis_private.company_deliverable_files f
  where f.task_id=p_task_id
  order by f.path;
$$;
revoke all on function public.list_company_artifact_files_for_task(integer) from public, anon, authenticated;
grant execute on function public.list_company_artifact_files_for_task(integer) to service_role;
