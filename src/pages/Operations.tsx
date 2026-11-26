import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Building2, Bot, ListTodo, Activity as ActIcon, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { api, timeAgo, type Building, type Agent, type Task, type ActivityItem } from '../lib/api';
import { Spinner, ErrorBox, Empty, PageHead, StatusDot, Badge } from '../components/ui';

export default function OperationsPage({ initialTab = 'overview' }: { initialTab?: string }) {
  const [tab, setTab] = useState(initialTab);
  const [buildings, setBuildings] = useState<Building[]>([]); const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]); const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true); const [err, setErr] = useState('');
  const [taskFilter, setTaskFilter] = useState('All'); const [actFilter, setActFilter] = useState('All');
  const [form, setForm] = useState({ title: '', description: '', building_slug: 'operations-tower', agent_name: '', priority: 'medium' });
  const [saving, setSaving] = useState(false); const [note, setNote] = useState('');
  const load = async () => { setLoading(true); setErr(''); try { const [b, a, t, ac] = await Promise.all([api('/api/buildings'), api('/api/agents'), api('/api/tasks'), api('/api/activity')]); setBuildings(b); setAgents(a); setTasks(t); setActivity(ac); } catch (e: any) { setErr(e.message); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const bName = (s: string) => buildings.find(b => b.slug === s)?.name || s;
  const alerts = useMemo(() => [...tasks.filter(t => t.status === 'blocked').map(t => ({ id: 't' + t.id, text: `Blocked task: “${t.title}” at ${bName(t.building_slug)}`, link: '/building/' + t.building_slug })), ...agents.filter(a => a.status === 'error').map(a => ({ id: 'a' + a.id, text: `Agent ${a.name} (${a.code}) flagged with error status at ${bName(a.building_slug)}`, link: '/agents' })), ...buildings.filter(b => b.status === 'maintenance').map(b => ({ id: 'b' + b.id, text: `${b.name} is under maintenance`, link: '/building/' + b.slug }))], [tasks, agents, buildings]);
  const createTask = async (e: React.FormEvent) => { e.preventDefault(); if (!form.title.trim()) { setNote('Task title is required.'); return; } setSaving(true); setNote(''); try { await api('/api/tasks', { method: 'POST', body: JSON.stringify(form) }); await api('/api/activity', { method: 'POST', body: JSON.stringify({ type: 'task', title: 'New task created: ' + form.title, building_slug: form.building_slug, detail: `Assigned to ${form.agent_name || 'Unassigned'} · priority ${form.priority}` }) }); setForm({ title: '', description: '', building_slug: 'operations-tower', agent_name: '', priority: 'medium' }); load(); } catch (e2: any) { setNote('Could not create task: ' + e2.message); } finally { setSaving(false); } };
  const updateTask = async (t: Task, patch: any, logTitle?: string) => { try { await api('/api/tasks', { method: 'PUT', body: JSON.stringify({ id: t.id, ...patch }) }); if (logTitle) await api('/api/activity', { method: 'POST', body: JSON.stringify({ type: 'task', title: logTitle, building_slug: t.building_slug, detail: t.title }) }); load(); } catch (e2: any) { setNote('Update failed: ' + e2.message); } };
  const deleteTask = async (t: Task) => { try { await api('/api/tasks', { method: 'DELETE', body: JSON.stringify({ id: t.id }) }); load(); } catch (e2: any) { setNote('Delete failed: ' + e2.message); } };
  const filteredTasks = tasks.filter(t => taskFilter === 'All' || t.status === taskFilter);
  const actTypes = ['All', ...new Set(activity.map(a => a.type))];
  const filteredAct = activity.filter(a => actFilter === 'All' || a.type === actFilter);
  const stats = [{ icon: Building2, label: 'BUILDINGS', value: buildings.length, sub: buildings.filter(b => b.status === 'operational').length + ' operational' }, { icon: Bot, label: 'AGENTS', value: agents.length, sub: agents.filter(a => a.status === 'active' || a.status === 'busy').length + ' on duty' }, { icon: ListTodo, label: 'OPEN TASKS', value: tasks.filter(t => !['completed', 'done'].includes(t.status)).length, sub: tasks.filter(t => ['completed', 'done'].includes(t.status)).length + ' completed' }, { icon: AlertTriangle, label: 'ALERTS', value: alerts.length, sub: 'derived live from records' }];
  const tabs = [{ id: 'overview', label: 'Overview' }, { id: 'tasks', label: `Tasks (${tasks.length})` }, { id: 'activity', label: 'Activity Feed' }, { id: 'health', label: 'Building Health' }];
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <PageHead title="City Operations" sub="Control centre for buildings, agents, tasks, alerts and events. Every number below is computed from live Supabase records — nothing is invented." badge="live" />
      {loading ? <Spinner label="Contacting City Operations Tower…" /> : err ? <ErrorBox message={err} onRetry={load} /> : (
        <>
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 sm:gap-3">{stats.map(s => <div key={s.label} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4"><s.icon size={20} className="text-amber-400" /><p className="font-display mt-1.5 text-3xl font-bold text-white">{s.value}</p><p className="text-[10px] font-black tracking-widest text-slate-400">{s.label}</p><p className="text-[11px] text-slate-500">{s.sub}</p></div>)}</div>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} className={`shrink-0 rounded-full px-4 py-2.5 text-xs font-bold ${tab === t.id ? 'bg-amber-400 text-slate-950' : 'bg-white/5 text-slate-200 hover:bg-white/10'}`}>{t.label}</button>)}</div>
          {note && <p className="mt-2 text-xs text-amber-200">{note}</p>}

          {tab === 'overview' && (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4"><h3 className="flex items-center gap-2 text-sm font-bold text-white"><AlertTriangle size={16} className="text-red-400" /> ALERTS <Badge kind="live" /></h3>{alerts.length === 0 ? <p className="mt-2 flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 size={16} /> No alerts. No blocked tasks, error agents or buildings under maintenance.</p> : <ul className="mt-2 space-y-2">{alerts.map(a => <li key={a.id}><Link to={a.link} className="block rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-[13px] text-red-100 hover:bg-red-500/15">{a.text}</Link></li>)}</ul>}</div>
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4"><h3 className="flex items-center gap-2 text-sm font-bold text-white"><ActIcon size={16} className="text-amber-400" /> LATEST CITY EVENTS</h3>{activity.length === 0 ? <p className="mt-2 text-sm text-slate-500">No events yet.</p> : <ul className="mt-2 space-y-2.5">{activity.slice(0, 6).map(a => <li key={a.id} className="text-[13px]"><span className="font-semibold text-slate-100">{a.title}</span> <span className="text-slate-500">· {bName(a.building_slug)} · {timeAgo(a.created_at)}</span><span className="block text-xs text-slate-400">{a.detail}</span></li>)}</ul>}<button onClick={() => setTab('activity')} className="mt-3 text-xs font-bold text-amber-300 underline">Full activity feed →</button></div>
            </div>
          )}

          {tab === 'tasks' && (
            <div className="mt-4 space-y-4">
              <form onSubmit={createTask} className="rounded-3xl border border-amber-500/20 bg-white/[0.03] p-4">
                <p className="flex items-center gap-2 text-sm font-bold text-white"><Plus size={16} className="text-amber-400" /> Create task <span className="text-xs font-normal text-slate-500">(saved to database & logged to activity)</span></p>
                <div className="mt-3 grid gap-2 sm:grid-cols-4">
                  <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Task title *" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none sm:col-span-2" />
                  <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Task details / acceptance criteria (sent to ECC agent)" rows={2} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none sm:col-span-2" />
                  <select value={form.building_slug} onChange={e => setForm({ ...form, building_slug: e.target.value })} className="rounded-xl border border-white/10 bg-[#151228] px-3 py-2.5 text-sm text-white">{buildings.map(b => <option key={b.slug} value={b.slug}>{b.name}</option>)}</select>
                  <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} className="rounded-xl border border-white/10 bg-[#151228] px-3 py-2.5 text-sm text-white">{['low', 'medium', 'high', 'critical'].map(p => <option key={p}>{p}</option>)}</select>
                  <select value={form.agent_name} onChange={e => setForm({ ...form, agent_name: e.target.value })} className="rounded-xl border border-white/10 bg-[#151228] px-3 py-2.5 text-sm text-white sm:col-span-3"><option value="">Assign agent (optional)</option>{agents.map(a => <option key={a.id} value={a.name}>{a.name} — {a.role}</option>)}</select>
                  <button disabled={saving} className="rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 py-2.5 text-xs font-black text-slate-950 disabled:opacity-50">{saving ? 'CREATING…' : 'CREATE TASK'}</button>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">Workflow: Trigger (this form) → Input saved → Assign agent → open Agents → ECC Task Runner to run a protected model task → result saved. The first runtime is text-only; no tools or external side effects.</p>
              </form>
              <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{['All', 'queued', 'running', 'in_progress', 'blocked', 'error', 'done', 'completed'].map(s => <button key={s} onClick={() => setTaskFilter(s)} className={`shrink-0 rounded-full px-3.5 py-2 text-[11px] font-bold ${taskFilter === s ? 'bg-amber-400 text-slate-950' : 'bg-white/5 text-slate-200'}`}>{s.replace('_', ' ')}</button>)}</div>
              {filteredTasks.length === 0 ? <Empty>No tasks with this status.</Empty> : <div className="space-y-2.5">{filteredTasks.map(t => (
                <div key={t.id} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-white">{t.title}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${t.priority === 'critical' ? 'bg-red-500/20 text-red-300' : t.priority === 'high' ? 'bg-orange-500/20 text-orange-300' : 'bg-white/10 text-slate-300'}`}>{t.priority.toUpperCase()}</span><span className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-300"><StatusDot status={t.status} />{t.status.replace('_', ' ')}</span></div>
                  <p className="mt-1 text-xs text-slate-400">📍 <Link to={'/building/' + t.building_slug} className="text-amber-300 underline">{bName(t.building_slug)}</Link> · Owner: {t.agent_name} · Created {timeAgo(t.created_at)}</p>
                  {t.description && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-300">{t.description}</p>}
                  <div className="mt-2.5 flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300 transition-all" style={{ width: t.progress + '%' }} /></div><span className="text-[11px] font-bold text-slate-300">{t.progress}%</span></div>
                  {t.result && <details className="mt-2 rounded-xl border border-emerald-400/15 bg-emerald-500/5 p-3"><summary className="cursor-pointer text-xs font-bold text-emerald-200">Saved ECC agent output</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-200">{t.result}</pre></details>}
                  {t.error && <p className="mt-2 rounded-xl border border-red-400/15 bg-red-500/5 p-2 text-xs text-red-200">Execution error: {t.error}</p>}
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {!['queued', 'running', 'completed', 'done'].includes(t.status) && <button onClick={() => updateTask(t, { status: 'queued', progress: 0 })} className="rounded-full bg-sky-500/20 px-3 py-1.5 text-[11px] font-bold text-sky-200">Queue for ECC execution</button>}
                    {t.status === 'queued' && <Link to="/agents" className="rounded-full bg-emerald-500/20 px-3 py-1.5 text-[11px] font-bold text-emerald-200">Choose ECC agent & run →</Link>}
                    {t.status !== 'blocked' && !['completed', 'done', 'error', 'running'].includes(t.status) && <button onClick={() => updateTask(t, { status: 'blocked' })} className="rounded-full bg-red-500/20 px-3 py-1.5 text-[11px] font-bold text-red-200">Mark blocked</button>}
                    {!['completed', 'done', 'running'].includes(t.status) && <button onClick={() => updateTask(t, { status: 'completed', progress: 100 }, 'Task manually completed: ' + t.title)} className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold text-slate-200">Mark complete manually</button>}
                    {t.status !== 'running' && <button onClick={() => deleteTask(t)} className="ml-auto flex items-center gap-1 rounded-full bg-white/5 px-3 py-1.5 text-[11px] font-bold text-slate-400 hover:text-red-300"><Trash2 size={12} /> Delete</button>}
                  </div>
                </div>))}</div>}
            </div>
          )}

          {tab === 'activity' && (
            <div className="mt-4">
              <div className="mb-3 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{actTypes.map(t => <button key={t} onClick={() => setActFilter(t)} className={`shrink-0 rounded-full px-3.5 py-2 text-[11px] font-bold ${actFilter === t ? 'bg-amber-400 text-slate-950' : 'bg-white/5 text-slate-200'}`}>{t}</button>)}</div>
              {filteredAct.length === 0 ? <Empty>No activity of this type yet.</Empty> : <div className="space-y-2">{filteredAct.map(a => <div key={a.id} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5"><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-sm">{a.type === 'task' ? '📋' : a.type === 'alert' ? '🚨' : a.type === 'system' ? '⚙️' : a.type === 'social' ? '💬' : '🏙️'}</span><div className="min-w-0"><p className="text-sm font-semibold text-white">{a.title}</p><p className="text-xs text-slate-400">{a.detail}</p><p className="mt-0.5 text-[11px] text-slate-500">{bName(a.building_slug)} · {timeAgo(a.created_at)} · type: {a.type}</p></div></div>)}</div>}
            </div>
          )}

          {tab === 'health' && (
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">{buildings.map(b => { const bt = tasks.filter(t => t.building_slug === b.slug); const blocked = bt.filter(t => t.status === 'blocked').length; return <Link key={b.slug} to={'/building/' + b.slug} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 hover:border-amber-400/50"><p className="flex items-center gap-2 text-sm font-bold text-white"><StatusDot status={b.status} />{b.name}</p><p className="mt-1 text-[11px] text-slate-400">{b.status} · {agents.filter(a => a.building_slug === b.slug).length} agents · {bt.filter(t => !['completed', 'done'].includes(t.status)).length} open tasks{blocked ? ` · ⚠ ${blocked} blocked` : ''}</p><p className="mt-1 text-[10px] text-slate-500">Health = database status field only. No uptime/latency monitoring is connected.</p></Link>; })}</div>
          )}
        </>
      )}
    </div>
  );
}
