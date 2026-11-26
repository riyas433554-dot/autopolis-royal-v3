-- Keep unreviewed company work private; only server-authorized API reads it.
create table if not exists autopolis_private.company_deliverables (
  output_id integer primary key references public.outputs(id) on delete cascade,
  content text not null,
  updated_at timestamptz not null default now()
);
revoke all on table autopolis_private.company_deliverables from public, anon, authenticated;
grant select, insert, update, delete on table autopolis_private.company_deliverables to service_role;

create or replace function public.store_company_deliverable(p_output_id integer, p_content text)
returns void
language sql
security definer
set search_path = pg_catalog, autopolis_private
as $$
  insert into autopolis_private.company_deliverables(output_id, content)
  values (p_output_id, p_content)
  on conflict (output_id) do update set content = excluded.content, updated_at = now();
$$;

create or replace function public.get_company_deliverable(p_output_id integer)
returns text
language sql
security definer
set search_path = pg_catalog, autopolis_private
as $$
  select content from autopolis_private.company_deliverables where output_id = p_output_id;
$$;

create or replace function public.delete_company_deliverable(p_output_id integer)
returns void
language sql
security definer
set search_path = pg_catalog, autopolis_private
as $$
  delete from autopolis_private.company_deliverables where output_id = p_output_id;
$$;

revoke all on function public.store_company_deliverable(integer, text) from public, anon, authenticated;
revoke all on function public.get_company_deliverable(integer) from public, anon, authenticated;
revoke all on function public.delete_company_deliverable(integer) from public, anon, authenticated;
grant execute on function public.store_company_deliverable(integer, text) to service_role;
grant execute on function public.get_company_deliverable(integer) to service_role;
grant execute on function public.delete_company_deliverable(integer) to service_role;
