-- Persist Academy submissions and structured evaluator feedback for auditability.
alter table public.agent_training_cycles
  add column if not exists submission text,
  add column if not exists evaluation jsonb,
  add column if not exists evaluator_model text;
