-- Add ECC provenance and city assignment metadata to lifecycle profiles.
-- Additive; does not import agents or change existing API response shapes.
alter table agent_lifecycle_profiles
  add column if not exists source_path text,
  add column if not exists source_blob_sha text,
  add column if not exists source_description text,
  add column if not exists source_tools text,
  add column if not exists source_model text,
  add column if not exists assigned_building_slug text,
  add column if not exists assignment_duty text;

create index if not exists agent_lifecycle_source_idx
  on agent_lifecycle_profiles (source_repo, source_agent_key);
create index if not exists agent_lifecycle_assignment_idx
  on agent_lifecycle_profiles (assigned_building_slug)
  where assigned_building_slug is not null;
