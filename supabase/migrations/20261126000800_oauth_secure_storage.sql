-- Private, server-only OAuth state and encrypted provider credentials.
create schema if not exists autopolis_private;
revoke all on schema autopolis_private from public, anon, authenticated;
grant usage on schema autopolis_private to service_role;

create table if not exists autopolis_private.oauth_states (
  id bigserial primary key,
  provider text not null check (provider in ('meta', 'youtube')),
  state_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists autopolis_private.oauth_tokens (
  provider text not null check (provider in ('meta', 'youtube')),
  account_id text not null,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  expires_at timestamptz,
  scopes text,
  updated_at timestamptz not null default now(),
  primary key (provider, account_id)
);

revoke all on all tables in schema autopolis_private from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema autopolis_private to service_role;
grant usage, select on all sequences in schema autopolis_private to service_role;

create unique index if not exists connected_accounts_provider_account_unique
  on public.connected_accounts(provider, account_id);

create or replace function public.create_oauth_state(p_provider text, p_state_hash text, p_expires_at timestamptz)
returns void
language sql
security definer
set search_path = pg_catalog, autopolis_private
as $$
  insert into autopolis_private.oauth_states(provider, state_hash, expires_at)
  values (p_provider, p_state_hash, p_expires_at);
$$;

create or replace function public.consume_oauth_state(p_provider text, p_state_hash text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, autopolis_private
as $$
begin
  update autopolis_private.oauth_states
    set consumed_at = now()
    where provider = p_provider and state_hash = p_state_hash
      and consumed_at is null and expires_at > now();
  return found;
end;
$$;

create or replace function public.get_oauth_tokens(p_provider text, p_account_id text)
returns table (
  provider text,
  account_id text,
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  expires_at timestamptz,
  scopes text
)
language sql
security definer
set search_path = pg_catalog, autopolis_private
as $$
  select t.provider, t.account_id, t.access_token_ciphertext, t.refresh_token_ciphertext, t.expires_at, t.scopes
  from autopolis_private.oauth_tokens t
  where t.provider = p_provider and t.account_id = p_account_id;
$$;

create or replace function public.store_oauth_tokens(
  p_provider text, p_account_id text, p_access_token_ciphertext text,
  p_refresh_token_ciphertext text, p_expires_at timestamptz, p_scopes text
)
returns void
language sql
security definer
set search_path = pg_catalog, autopolis_private
as $$
  insert into autopolis_private.oauth_tokens(provider, account_id, access_token_ciphertext, refresh_token_ciphertext, expires_at, scopes)
  values (p_provider, p_account_id, p_access_token_ciphertext, p_refresh_token_ciphertext, p_expires_at, p_scopes)
  on conflict (provider, account_id) do update set
    access_token_ciphertext = excluded.access_token_ciphertext,
    refresh_token_ciphertext = coalesce(excluded.refresh_token_ciphertext, autopolis_private.oauth_tokens.refresh_token_ciphertext),
    expires_at = excluded.expires_at,
    scopes = excluded.scopes,
    updated_at = now();
$$;

create or replace function public.delete_oauth_tokens(p_provider text, p_account_id text)
returns void
language sql
security definer
set search_path = pg_catalog, autopolis_private
as $$
  delete from autopolis_private.oauth_tokens where provider = p_provider and account_id = p_account_id;
$$;

revoke all on function public.create_oauth_state(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.consume_oauth_state(text, text) from public, anon, authenticated;
revoke all on function public.get_oauth_tokens(text, text) from public, anon, authenticated;
revoke all on function public.store_oauth_tokens(text, text, text, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.delete_oauth_tokens(text, text) from public, anon, authenticated;
grant execute on function public.create_oauth_state(text, text, timestamptz) to service_role;
grant execute on function public.consume_oauth_state(text, text) to service_role;
grant execute on function public.get_oauth_tokens(text, text) to service_role;
grant execute on function public.store_oauth_tokens(text, text, text, text, timestamptz, text) to service_role;
grant execute on function public.delete_oauth_tokens(text, text) to service_role;
