# ECC task runtime

The first Autopolis runtime is owner-triggered, single-task, OpenAI-compatible chat completion. It is not a full computer-use agent and does not execute shell commands, modify repositories, browse the web, or call external tools.

## Server configuration

Set these private environment variables on the Autopolis server (never in Vite/client env and never in Git):

- AUTOPOLIS_LIFECYCLE_ADMIN_TOKEN: owner-only bearer token used by ECC import, lifecycle transitions and task execution.
- AUTOPOLIS_LLM_API_KEY: API key for the configured model endpoint.
- AUTOPOLIS_LLM_MODEL: exact model identifier accepted by that endpoint.
- AUTOPOLIS_LLM_BASE_URL: optional full OpenAI-compatible chat-completions URL. Defaults to https://api.openai.com/v1/chat/completions. HTTPS is required except localhost HTTP for a local router.

Use the user's own router/provider endpoint here when applicable. The server sends a single system/user message pair, temperature 0.2 and max_tokens 2500. The role prompt is fetched from the pinned ECC commit and its Git blob SHA is checked before use.

## Task flow

1. Create a task in City Operations. It is saved with queued status.
2. Open Agents → ECC City Ecosystem → Task Runner.
3. Enter the owner token in the password field (held in page memory only).
4. Choose an eligible ECC city staff or hired company agent and run the task.
5. The API atomically claims a queued task, marks the agent busy, fetches/verifies the pinned role prompt, calls the model, and saves output/status to tasks plus an agent_runs audit row.
6. Success marks task done and agent idle. Failure marks task error and agent error; inspect the error and requeue manually.

Only profiles in city_staff or company state can run city work. Academy/training/interview agents cannot execute company tasks. Company profiles must have an active company_members row.

## Important limits

- One task per run; no automatic background polling or task scheduling.
- No tools, shell, browser, code execution, file writes, or external side effects are exposed to the model.
- The result is model-generated text, not proof that a real-world action was performed.
- Apply migrations 001–005 before using the workflow. Do not trigger ECC import or task execution before database setup and server secrets are configured.
