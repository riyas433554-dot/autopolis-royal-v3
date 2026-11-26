import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

type CityAgent = {
  id: number;
  name: string;
  role: string;
  status: string;
  building_slug: string;
  company_id?: number | null;
  lifecycle_status?: string;
};
type LifecycleProfile = {
  agent_id: number;
  lifecycle_status: string;
  assigned_building_slug?: string | null;
  agent?: CityAgent | null;
};
type CityTask = {
  id: number;
  title: string;
  building_slug: string;
  agent_name: string;
  status: string;
  progress: number;
  priority: string;
  company_id?: number | null;
  assigned_agent_id?: number | null;
  deliverable_type?: string;
  error?: string | null;
  result?: string | null;
};

export default function AgentTaskRunner() {
  const [tasks, setTasks] = useState<CityTask[]>([]);
  const [profiles, setProfiles] = useState<LifecycleProfile[]>([]);
  const [token, setToken] = useState('');
  const [choice, setChoice] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [taskRows, profileRows] = await Promise.all([
        api<CityTask[]>('/api/tasks'),
        api<LifecycleProfile[]>('/api/lifecycle'),
      ]);
      setTasks(Array.isArray(taskRows) ? taskRows : []);
      setProfiles(Array.isArray(profileRows) ? profileRows : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the task queue');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const eligible = useMemo(() => profiles
    .filter(profile => ['city_staff', 'company'].includes(profile.lifecycle_status))
    .map(profile => profile.agent ? { ...profile.agent, company_id: profile.company_id, lifecycle_status: profile.lifecycle_status } : null)
    .filter((agent): agent is CityAgent => !!agent && !['busy', 'working'].includes(String(agent.status).toLowerCase())), [profiles]);

  const queued = tasks.filter(task => task.status === 'queued');
  const failed = tasks.filter(task => task.status === 'error');

  const assignedAgent = (task: CityTask) => {
    const available = task.company_id
      ? eligible.filter(agent => agent.lifecycle_status === 'company' && Number(agent.company_id) === Number(task.company_id))
      : eligible;
    const selectedId = Number(choice[task.id] || task.assigned_agent_id || 0);
    if (selectedId) return available.find(agent => agent.id === selectedId);
    if (task.assigned_agent_id) return undefined;
    return available.find(agent => agent.building_slug === task.building_slug) || available[0];
  };

  const runTask = async (task: CityTask) => {
    if (!token.trim()) {
      setError('Enter the owner lifecycle token to run a task.');
      return;
    }
    const agent = assignedAgent(task);
    if (!agent) {
      setError('No eligible ECC city staff or hired company agent is available.');
      return;
    }
    setBusy(task.id);
    setError('');
    setMessage('');
    try {
      const result = await api('/api/agent-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token.trim() },
        body: JSON.stringify({ task_id: task.id, agent_id: agent.id }),
      });
      setMessage('Task #' + task.id + ' completed by ' + agent.name + '. Result saved to the task record.');
      if (result?.result) setMessage(String(result.result).slice(0, 900));
      await load();
    } catch (err) {
      const failure = err instanceof Error ? err.message : 'Agent execution failed';
      await load();
      setError(failure);
    } finally {
      setBusy(null);
    }
  };

  const retry = async (task: CityTask) => {
    try {
      await api('/api/tasks', { method: 'PUT', body: JSON.stringify({ id: task.id, status: 'queued', progress: 0 }) });
      setMessage('Task #' + task.id + ' returned to queue. Review the error before retrying.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not retry task');
    }
  };

  return <section className="mb-6 rounded-3xl border border-emerald-400/20 bg-emerald-950/15 p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-[10px] font-black tracking-[0.25em] text-emerald-300">CITY WORKFLOW · EXECUTOR</p><h2 className="mt-1 font-display text-xl font-bold text-white">Run a queued task with an ECC agent</h2><p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-400">The owner selects an eligible city staff/company agent. The server fetches the pinned ECC role prompt, verifies its Git blob SHA, calls the configured OpenAI-compatible model endpoint, and saves the result. No tools or external side effects are available in this first runtime.</p></div>
      <button onClick={() => void load()} disabled={loading || busy !== null} className="rounded-full border border-white/15 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Refresh queue</button>
    </div>
    <label className="mt-3 block text-xs font-semibold text-slate-300">Owner lifecycle token <span className="font-normal text-slate-500">(memory only)</span>
      <input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="AUTOPOLIS_LIFECYCLE_ADMIN_TOKEN" className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-slate-600" />
    </label>
    <p className="mt-2 text-[10px] text-slate-500">Server also needs AUTOPOLIS_LLM_API_KEY + AUTOPOLIS_LLM_MODEL. Optional AUTOPOLIS_LLM_BASE_URL sets the full chat-completions endpoint.</p>
    {error && <p role="alert" className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-200">{error}</p>}
    {message && <p role="status" className="mt-3 whitespace-pre-wrap rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-xs text-emerald-200">{message}</p>}
    {loading ? <p className="py-4 text-center text-xs text-slate-400">Loading queue…</p> : <>
      <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold"><span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-amber-200">{queued.length} queued</span><span className="rounded-full bg-red-400/10 px-2.5 py-1 text-red-200">{failed.length} failed</span><span className="rounded-full bg-white/5 px-2.5 py-1 text-slate-300">{eligible.length} eligible agents</span></div>
      {queued.length === 0 ? <p className="py-4 text-center text-xs text-slate-500">No queued tasks. Create one in City Operations → Tasks.</p> : <div className="mt-3 space-y-2">
        {queued.map(task => {
          const agent = assignedAgent(task);
          return <article key={task.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="flex flex-wrap items-start gap-2"><div className="min-w-0 flex-1"><p className="text-sm font-bold text-white">#{task.id} · {task.title}</p><p className="mt-0.5 text-[10px] text-slate-500">{task.building_slug} · {task.priority}{task.company_id ? ' · company #' + task.company_id : ''} · {task.deliverable_type || 'report'}</p></div><button onClick={() => void runTask(task)} disabled={busy !== null || eligible.length === 0} className="rounded-full bg-emerald-400 px-3 py-2 text-[10px] font-black text-slate-950 disabled:opacity-50">{busy === task.id ? 'RUNNING…' : 'RUN TASK'}</button></div>
            <select value={String(agent?.id || '')} onChange={e => setChoice(prev => ({ ...prev, [task.id]: e.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-[#151228] px-3 py-2 text-xs text-white">
              <option value="">Choose ECC agent…</option>
              {(task.company_id ? eligible.filter(option => option.lifecycle_status === 'company' && Number(option.company_id) === Number(task.company_id)) : eligible).map(option => <option key={option.id} value={option.id}>{option.name} — {option.role} · {option.building_slug}</option>)}
            </select>
          </article>;
        })}
      </div>}
      {failed.length > 0 && <div className="mt-4"><p className="text-xs font-bold text-red-200">Failed tasks — inspect error, then retry</p><div className="mt-2 space-y-2">{failed.map(task => <article key={task.id} className="rounded-xl border border-red-400/15 bg-red-500/5 p-3"><p className="text-xs font-semibold text-white">#{task.id} · {task.title}</p><p className="mt-1 line-clamp-3 text-[10px] text-red-200">{task.error || 'Unknown error'}</p><button onClick={() => void retry(task)} className="mt-2 rounded-full border border-red-300/20 px-3 py-1.5 text-[10px] font-bold text-red-200">Requeue</button></article>)}</div></div>}
    </>}
  </section>;
}
