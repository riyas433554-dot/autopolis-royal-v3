ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS video_resolution text NOT NULL DEFAULT 'source';

ALTER TABLE public.tasks
  ALTER COLUMN video_resolution SET DEFAULT 'source';

UPDATE public.tasks
SET video_resolution = 'source'
WHERE video_resolution IS NULL
   OR video_resolution NOT IN ('source', '720p', '1080p', '1440p');

ALTER TABLE public.tasks
  ALTER COLUMN video_resolution SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tasks_video_resolution_check'
      AND conrelid = 'public.tasks'::regclass
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_video_resolution_check
      CHECK (video_resolution IN ('source', '720p', '1080p', '1440p'));
  END IF;
END
$$;
