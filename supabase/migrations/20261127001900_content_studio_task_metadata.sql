-- Shared content intent for original long/short videos and derivative clips.
-- Categories remain free-form; platform targets are destinations, not genre enums.
alter table public.tasks
  add column if not exists content_mode text not null default 'auto'
    check (content_mode in ('auto','long_form','short_form','repurpose')),
  add column if not exists content_category text not null default 'general',
  add column if not exists platform_targets text[] not null default array[]::text[],
  add column if not exists source_video_task_id bigint references public.tasks(id) on delete set null;

create index if not exists tasks_source_video_task_id_idx
  on public.tasks(source_video_task_id)
  where source_video_task_id is not null;
