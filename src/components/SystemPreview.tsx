import { ArrowRight, Server, Database, Globe, ShieldCheck, Cpu, Blocks, Plug, Activity as ActIcon } from 'lucide-react';
import type { Building, ActivityItem } from '../lib/api';
import { timeAgo } from '../lib/api';
import { Badge, type BadgeKind } from './ui';

const WORKFLOW = ['Trigger', 'Input', 'Processing', 'Agent Assignment', 'Execution', 'Verification', 'Output', 'Completion'];

export default function SystemPreview({ building, activity, agentCount }: { building: Building; activity: ActivityItem[]; agentCount: number }) {
  const rows: { icon: any; label: string; value: string; kind: BadgeKind }[] = [
    { icon: Globe, label: 'Frontend', value: 'React 19 + Vite + Tailwind (this app — /building/' + building.slug + ')', kind: 'live' },
    { icon: Server, label: 'Backend / APIs', value: 'Vercel serverless routes: /api/buildings, /api/agents, /api/tasks, /api/activity', kind: 'live' },
    { icon: Database, label: 'Database', value: 'Supabase Postgres — buildings, agents, tasks, activity tables (queried on load)', kind: 'live' },
    { icon: ShieldCheck, label: 'Authentication', value: 'Supabase Auth (email/password + Google) — sessions enforced on account pages', kind: 'live' },
    { icon: Cpu, label: 'System & version', value: `${building.system_name} · v${building.version} (version string is illustrative demo data)`, kind: 'demo' },
    { icon: Blocks, label: 'Workers / Agents', value: `${agentCount} agent record(s) in database. Characters are animated simulations — no autonomous execution is running.`, kind: 'sim' },
    { icon: Plug, label: 'External integrations', value: 'No third-party provider credentials configured for this building.', kind: 'unavailable' },
    { icon: ActIcon, label: 'Uptime / latency / logs', value: 'Not instrumented — no metrics pipeline connected. No figures are shown rather than invented.', kind: 'unavailable' },
  ];
  const modules = (building.departments || '').split(',').map(s => s.trim()).filter(Boolean);
  const events = activity.filter(a => a.building_slug === building.slug).slice(0, 5);
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-lg font-bold text-white">{building.system_name}</h3><Badge kind="live" /><Badge kind="demo" /></div>
        <p className="mt-1 text-sm text-slate-400">{building.purpose}. Status shown in the city directory comes from the database record for this building. Anything not measured is labelled instead of invented.</p>
        <div className="mt-3 divide-y divide-white/5">
          {rows.map(r => (
            <div key={r.label} className="flex items-start gap-3 py-2.5">
              <r.icon size={17} className="mt-0.5 shrink-0 text-amber-400" />
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-white">{r.label}</p><p className="text-xs leading-relaxed text-slate-400">{r.value}</p></div>
              <Badge kind={r.kind} />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold tracking-wide text-white">WORKFLOW — HOW WORK FLOWS THROUGH {building.system_name.toUpperCase()}</h3><Badge kind="sim" /></div>
        <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-2">
          {WORKFLOW.map((step, i) => (
            <div key={step} className="flex shrink-0 items-center gap-1.5">
              <div className={`rounded-xl border px-3 py-2 text-center ${i === 3 ? 'border-amber-400 bg-amber-400/15' : 'border-white/10 bg-white/[0.04]'}`}>
                <p className="text-[9px] font-black tracking-widest text-amber-400">STEP {i + 1}</p>
                <p className="whitespace-nowrap text-xs font-bold text-white">{step}</p>
              </div>
              {i < WORKFLOW.length - 1 && <ArrowRight size={14} className="shrink-0 text-amber-400" />}
            </div>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-slate-400">A trigger (citizen request, schedule or city event) creates a task → input is validated → the system processes & enriches it → an agent from this building is assigned → the agent executes (simulated in this build) → output is verified against the request → results are published to Operations → the task is marked complete and logged to the activity feed. Create a real task for this building in <b className="text-slate-200">Operations → Tasks</b> to see the database-backed part of this flow.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h3 className="text-sm font-bold tracking-wide text-white">MODULES / DEPARTMENTS</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">{modules.map(m => <span key={m} className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200">{m}</span>)}</div>
          <p className="mt-2 text-xs text-slate-500">Data flow: UI → /api routes → Supabase Postgres → UI re-fetch. No queues are connected; task progression is manual/simulated and labelled as such.</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center gap-2"><h3 className="text-sm font-bold tracking-wide text-white">RECENT EVENTS</h3><Badge kind="live" /></div>
          {events.length === 0 ? <p className="mt-2 text-xs text-slate-500">No events recorded for this building yet. Actions you take in Operations will appear here.</p> : (
            <ul className="mt-2 space-y-2">{events.map(e => <li key={e.id} className="text-xs"><span className="font-semibold text-slate-200">{e.title}</span> <span className="text-slate-500">· {timeAgo(e.created_at)}</span><span className="block text-slate-400">{e.detail}</span></li>)}</ul>
          )}
        </div>
      </div>
    </div>
  );
}
