import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Building2, Briefcase, ListTodo, Pause, Play, AlertOctagon } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Agent, Building } from '../lib/api';
import { api } from '../lib/api';
import { Avatar, Badge, StatusDot } from './ui';

export default function AgentModal({ agent, buildings, onClose, onChanged }: { agent: Agent | null; buildings: Building[]; onClose: () => void; onChanged?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const b = agent ? buildings.find(x => x.slug === agent.building_slug) : null;
  const setStatus = async (status: string, task?: string) => {
    if (!agent) return; setBusy(true); setNote('');
    try { await api('/api/agents', { method: 'PUT', body: JSON.stringify({ id: agent.id, status, current_task: task ?? agent.current_task }) }); setNote('Saved to database. (Status is a record update — agent execution itself is simulated.)'); onChanged?.(); }
    catch (e: any) { setNote('Could not save: ' + e.message); } finally { setBusy(false); }
  };
  return (
    <AnimatePresence>
      {agent && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
          <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} onClick={e => e.stopPropagation()} className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-amber-500/25 bg-[#100e20] p-5 sm:rounded-3xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <Avatar name={agent.name} color={agent.avatar_color} size={54} />
                <div>
                  <h2 className="font-display text-xl font-bold text-white">{agent.name}</h2>
                  <p className="text-xs text-slate-400">{agent.code} · {agent.role}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-200"><StatusDot status={agent.status} /> {agent.status.toUpperCase()} <Badge kind="sim" /></p>
                </div>
              </div>
              <button onClick={onClose} className="rounded-full bg-white/5 p-2 text-slate-300 hover:bg-white/10" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="mt-4 space-y-2.5 text-sm">
              <p className="flex gap-2 text-slate-300"><Building2 size={16} className="mt-0.5 shrink-0 text-amber-400" /> Assigned building: {b ? <Link to={'/building/' + b.slug} className="font-semibold text-amber-300 underline" onClick={onClose}>{b.name}</Link> : agent.building_slug}</p>
              <p className="flex gap-2 text-slate-300"><Briefcase size={16} className="mt-0.5 shrink-0 text-amber-400" /> Department: {agent.department}</p>
              <p className="flex gap-2 text-slate-300"><ListTodo size={16} className="mt-0.5 shrink-0 text-amber-400" /> Current task: {agent.current_task}</p>
            </div>
            <div className="mt-4 rounded-xl border border-violet-500/25 bg-violet-500/10 p-3 text-xs leading-relaxed text-violet-200">
              <b>Honest status:</b> this is a real database record, and the character you see in the city is an animated <b>simulation</b>. No autonomous AI process is executing work behind this profile. Status changes below update the record only.
            </div>
            <p className="mt-4 text-xs font-bold tracking-wide text-slate-300">SUPPORTED ACTIONS (DATABASE RECORD)</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => setStatus('active')} className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3.5 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-50"><Play size={13} /> Set Active</button>
              <button disabled={busy} onClick={() => setStatus('idle', 'Awaiting assignment')} className="flex items-center gap-1.5 rounded-full bg-sky-500/20 px-3.5 py-2 text-xs font-bold text-sky-200 hover:bg-sky-500/30 disabled:opacity-50"><Pause size={13} /> Set Idle</button>
              <button disabled={busy} onClick={() => setStatus('busy')} className="flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3.5 py-2 text-xs font-bold text-amber-200 hover:bg-amber-500/30 disabled:opacity-50">Set Busy</button>
              <button disabled={busy} onClick={() => setStatus('error', 'Flagged for review by operator')} className="flex items-center gap-1.5 rounded-full bg-red-500/20 px-3.5 py-2 text-xs font-bold text-red-200 hover:bg-red-500/30 disabled:opacity-50"><AlertOctagon size={13} /> Flag Error</button>
            </div>
            {note && <p className="mt-3 text-xs text-amber-200">{note}</p>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
