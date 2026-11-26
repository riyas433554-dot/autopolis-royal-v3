import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, UserPlus } from 'lucide-react';
import { api, type Agent, type Building } from '../lib/api';
import { Spinner, ErrorBox, Empty, PageHead, Avatar, StatusDot, Badge } from '../components/ui';
import AgentModal from '../components/AgentModal';
import ECCWorkflow from '../components/ECCWorkflow';

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]); const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true); const [err, setErr] = useState('');
  const [q, setQ] = useState(''); const [fBuilding, setFBuilding] = useState('All'); const [fStatus, setFStatus] = useState('All'); const [fRole, setFRole] = useState('All');
  const [sel, setSel] = useState<Agent | null>(null);
  const [form, setForm] = useState({ name: '', role: '', department: '', building_slug: 'royal-palace-hq' });
  const [saving, setSaving] = useState(false); const [formErr, setFormErr] = useState('');
  const load = async () => { setLoading(true); setErr(''); try { const [a, b] = await Promise.all([api('/api/agents'), api('/api/buildings')]); setAgents(a); setBuildings(b); } catch (e: any) { setErr(e.message); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const roles = useMemo(() => ['All', ...new Set(agents.map(a => a.role))], [agents]);
  const filtered = agents.filter(a => (fBuilding === 'All' || a.building_slug === fBuilding) && (fStatus === 'All' || a.status === fStatus) && (fRole === 'All' || a.role === fRole) && (a.name + a.role + a.code + a.department).toLowerCase().includes(q.toLowerCase()));
  const bName = (slug: string) => buildings.find(b => b.slug === slug)?.name || slug;
  const addAgent = async (e: React.FormEvent) => { e.preventDefault(); if (!form.name.trim() || !form.role.trim()) { setFormErr('Name and role are required.'); return; } setSaving(true); setFormErr(''); try { await api('/api/agents', { method: 'POST', body: JSON.stringify(form) }); setForm({ name: '', role: '', department: '', building_slug: 'royal-palace-hq' }); load(); } catch (e2: any) { setFormErr(e2.message); } finally { setSaving(false); } };
  const counts = { active: agents.filter(a => a.status === 'active').length, busy: agents.filter(a => a.status === 'busy').length, idle: agents.filter(a => a.status === 'idle').length, error: agents.filter(a => a.status === 'error').length };
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <PageHead title="Agents Directory" sub="Database-backed agent records and lifecycle. City character animation is visual; autonomous model execution is not yet connected." badge="sim" />
      <ECCWorkflow />
      <div className="mb-4 grid grid-cols-4 gap-2 sm:gap-3">
        {Object.entries(counts).map(([k, v]) => <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-center"><p className="font-display text-xl font-bold text-white sm:text-2xl">{v}</p><p className="flex items-center justify-center gap-1 text-[10px] font-bold tracking-widest text-slate-400"><StatusDot status={k} />{k.toUpperCase()}</p></div>)}
      </div>
      <form onSubmit={addAgent} className="mb-5 rounded-3xl border border-amber-500/20 bg-white/[0.03] p-4">
        <p className="flex items-center gap-2 text-sm font-bold text-white"><UserPlus size={16} className="text-amber-400" /> Register a new agent <span className="text-xs font-normal text-slate-500">(creates a database record)</span></p>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name *" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none" />
          <input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} placeholder="Role * (e.g. Research Analyst)" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none" />
          <input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} placeholder="Department" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none" />
          <select value={form.building_slug} onChange={e => setForm({ ...form, building_slug: e.target.value })} className="rounded-xl border border-white/10 bg-[#151228] px-3 py-2.5 text-sm text-white">{buildings.map(b => <option key={b.slug} value={b.slug}>{b.name}</option>)}</select>
        </div>
        {formErr && <p className="mt-2 text-xs text-red-300">{formErr}</p>}
        <button disabled={saving} className="mt-3 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 px-5 py-2.5 text-xs font-black text-slate-950 disabled:opacity-50">{saving ? 'REGISTERING…' : 'REGISTER AGENT'}</button>
      </form>
      <div className="mb-4 flex flex-col gap-2 md:flex-row">
        <label className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, code, role, department…" className="w-full rounded-full border border-white/10 bg-white/5 py-2.5 pl-9 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none" /></label>
        <select value={fBuilding} onChange={e => setFBuilding(e.target.value)} className="rounded-full border border-white/10 bg-[#151228] px-4 py-2.5 text-sm text-white"><option value="All">All buildings</option>{buildings.map(b => <option key={b.slug} value={b.slug}>{b.name}</option>)}</select>
        <select value={fRole} onChange={e => setFRole(e.target.value)} className="rounded-full border border-white/10 bg-[#151228] px-4 py-2.5 text-sm text-white">{roles.map(r => <option key={r}>{r}</option>)}</select>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} className="rounded-full border border-white/10 bg-[#151228] px-4 py-2.5 text-sm text-white">{['All', 'active', 'busy', 'idle', 'error'].map(s => <option key={s}>{s}</option>)}</select>
      </div>
      {loading ? <Spinner label="Loading agents…" /> : err ? <ErrorBox message={err} onRetry={load} /> : filtered.length === 0 ? <Empty>No agents match your filters.</Empty> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a, i) => (
            <motion.button key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }} onClick={() => setSel(a)} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 text-left hover:border-amber-400/50">
              <div className="flex items-center gap-3"><Avatar name={a.name} color={a.avatar_color} size={46} /><div className="min-w-0"><p className="truncate font-bold text-white">{a.name}</p><p className="text-[11px] text-slate-400">{a.code} · {a.role}</p></div><span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-slate-200"><StatusDot status={a.status} />{a.status}</span></div>
              <p className="mt-2.5 text-xs text-slate-400">📍 {bName(a.building_slug)} · {a.department}</p>
              <p className="mt-1 line-clamp-1 text-xs text-slate-300">Current task: {a.current_task}</p>
              <p className="mt-2"><Badge kind="sim" /></p>
            </motion.button>
          ))}
        </div>
      )}
      <AgentModal agent={sel} buildings={buildings} onClose={() => setSel(null)} onChanged={load} />
    </div>
  );
}
