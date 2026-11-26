import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon, RotateCcw, Gauge, Building2, Bot, ListTodo, ChevronRight, X, MousePointer2, Info } from 'lucide-react';
import City3D from '../components/City3D';
import { api, type Building, type Agent, type Task } from '../lib/api';
import { DISTRICT_COLORS, BUILDING_GEO, mergeBuildings, fallbackBuildings } from '../lib/cityConfig';
import { Badge, StatusDot } from '../components/ui';

export default function CityHome() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [night, setNight] = useState(() => localStorage.getItem('ar-night') === '1');
  const [reduced, setReduced] = useState(() => localStorage.getItem('ar-reduced') === '1');
  const [resetSig, setResetSig] = useState(0);
  const [showHelp, setShowHelp] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const [b, a, t] = await Promise.all([api('/api/buildings'), api('/api/agents'), api('/api/tasks')]);
        setBuildings(mergeBuildings(b) as Building[]); setAgents(a); setTasks(t);
      } catch (e: any) { setLoadErr(e.message); setBuildings(fallbackBuildings() as Building[]); }
    })();
  }, []);
  useEffect(() => { localStorage.setItem('ar-night', night ? '1' : '0'); }, [night]);
  useEffect(() => { localStorage.setItem('ar-reduced', reduced ? '1' : '0'); }, [reduced]);

  const sel = useMemo(() => buildings.find(b => b.slug === selected) || null, [buildings, selected]);
  const selAgents = sel ? agents.filter(a => a.building_slug === sel.slug) : [];
  const activeAgents = agents.filter(a => a.status === 'active' || a.status === 'busy').length;
  const openTasks = tasks.filter(t => t.status !== 'completed').length;
  const pick = (slug: string | null) => { setSelected(slug); if (slug) setFocus(slug); };

  return (
    <div className="relative h-[calc(100dvh-57px-54px)] w-full overflow-hidden bg-[#070714] lg:h-[calc(100dvh-57px)]">
      {(buildings.length > 0 || loadErr)
        ? <City3D buildings={buildings} agents={agents} selectedSlug={selected} onSelect={pick} night={night} reduced={reduced} focusSlug={focus} resetSignal={resetSig} />
        : <div className="flex h-full flex-col items-center justify-center gap-3 bg-gradient-to-b from-[#0d0b22] to-[#070714]"><span className="animate-pulse text-5xl">👑</span><p className="font-display text-lg font-bold tracking-widest text-amber-200">RAISING AUTOPOLIS ROYAL…</p><p className="text-xs text-slate-400">Loading the city directory (37 buildings)</p></div>}

      {/* HUD — title + live stats */}
      <div className="pointer-events-none absolute left-3 top-3 max-w-[calc(100vw-120px)] sm:left-4 sm:top-4">
        <div className="pointer-events-auto rounded-2xl border border-amber-500/25 bg-[#0b0a18]/80 px-4 py-3 shadow-2xl backdrop-blur-md">
          <p className="text-[10px] font-black tracking-[0.3em] text-amber-400">👑 AUTOPOLIS ROYAL</p>
          <h1 className="font-display text-lg font-bold leading-tight text-white sm:text-xl">The Living AI City</h1>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-300">
            <span className="flex items-center gap-1"><Building2 size={12} className="text-amber-400" /> {buildings.length || 37} buildings</span>
            <span className="flex items-center gap-1"><Bot size={12} className="text-amber-400" /> {activeAgents} agents on duty</span>
            <span className="flex items-center gap-1"><ListTodo size={12} className="text-amber-400" /> {openTasks} open tasks</span>
          </div>
          {loadErr
            ? <p className="mt-1 text-[11px] text-red-300">City data failed to load ({loadErr}). 3D city still explorable — refresh to retry.</p>
            : <p className="mt-1.5 text-[10px] leading-relaxed text-slate-400">Counts are live database records <Badge kind="live" /> · citizens are <b className="text-violet-300">simulated</b></p>}
        </div>
      </div>

      {/* Controls */}
      <div className="absolute right-3 top-3 flex flex-col gap-2 sm:right-4 sm:top-4">
        <button onClick={() => setNight(n => !n)} className="flex items-center gap-2 rounded-full border border-white/15 bg-[#0b0a18]/85 px-3.5 py-2.5 text-xs font-bold text-white backdrop-blur-md hover:border-amber-400/60" aria-label="Toggle day and night">{night ? <Sun size={15} className="text-amber-300" /> : <Moon size={15} className="text-sky-300" />}<span className="hidden sm:inline">{night ? 'Day' : 'Night'}</span></button>
        <button onClick={() => { setResetSig(s => s + 1); setSelected(null); }} className="flex items-center gap-2 rounded-full border border-white/15 bg-[#0b0a18]/85 px-3.5 py-2.5 text-xs font-bold text-white backdrop-blur-md hover:border-amber-400/60" aria-label="Reset camera"><RotateCcw size={15} className="text-amber-300" /><span className="hidden sm:inline">Reset view</span></button>
        <button onClick={() => setReduced(r => !r)} className={`flex items-center gap-2 rounded-full border px-3.5 py-2.5 text-xs font-bold backdrop-blur-md ${reduced ? 'border-emerald-400 bg-emerald-500/25 text-emerald-100' : 'border-white/15 bg-[#0b0a18]/85 text-white hover:border-amber-400/60'}`} aria-label="Toggle reduced detail mode for weaker devices"><Gauge size={15} /><span className="hidden sm:inline">{reduced ? 'Lite mode ON' : 'Lite mode'}</span></button>
      </div>

      {/* District legend (desktop) */}
      <div className="absolute left-4 top-[168px] hidden rounded-2xl border border-white/10 bg-[#0b0a18]/75 p-3 backdrop-blur-md lg:block">
        <p className="mb-1.5 text-[10px] font-black tracking-widest text-slate-400">DISTRICTS</p>
        {Object.entries(DISTRICT_COLORS).map(([d, c]) => <p key={d} className="flex items-center gap-2 py-0.5 text-[11px] text-slate-200"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />{d} · {buildings.filter(b => b.district === d).length}</p>)}
        <Link to="/buildings" className="mt-2 flex items-center gap-1 text-[11px] font-bold text-amber-300 hover:text-amber-200">All {buildings.length || 37} buildings <ChevronRight size={12} /></Link>
      </div>

      {/* Help hint */}
      {showHelp && !sel && (
        <div className="absolute bottom-[220px] left-1/2 flex w-[calc(100vw-24px)] max-w-md -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-[#0b0a18]/85 px-4 py-2.5 text-[11px] text-slate-200 backdrop-blur-md sm:bottom-[104px]">
          <MousePointer2 size={14} className="shrink-0 text-amber-400" />
          <span><b>Drag</b> to orbit · <b>pinch / scroll</b> to zoom · <b>tap a building</b> to select & enter</span>
          <button onClick={() => setShowHelp(false)} className="ml-auto shrink-0 text-slate-400" aria-label="Dismiss help"><X size={14} /></button>
        </div>
      )}

      {/* Minimap — tap a dot to focus that building */}
      <div className={`absolute bottom-16 left-3 sm:bottom-[72px] sm:left-4 ${sel ? 'hidden sm:block' : 'block'}`}>
        <div className="rounded-2xl border border-white/15 bg-[#0b0a18]/85 p-2 backdrop-blur-md">
          <p className="mb-1 px-1 text-[8px] font-black tracking-[0.22em] text-slate-400">🗺️ CITY MAP · {buildings.length} BUILDINGS</p>
          <div className="relative h-[104px] w-[104px] overflow-hidden rounded-xl bg-[#141126] sm:h-[128px] sm:w-[128px]" role="group" aria-label="City minimap">
            <div className="absolute inset-y-0 right-0 w-[13%] bg-sky-500/25" />
            {BUILDING_GEO.map(g => { const b = buildings.find(x => x.slug === g.slug); return (<button key={g.slug} onClick={() => pick(g.slug)} title={b?.name || g.slug} aria-label={'Focus ' + (b?.name || g.slug)} className={`absolute h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full transition ${selected === g.slug ? 'z-10 scale-150 bg-amber-300 ring-2 ring-amber-300/60' : 'hover:scale-150'}`} style={{ left: ((g.x + 115) / 230) * 100 + '%', top: ((g.z + 115) / 230) * 100 + '%', background: selected === g.slug ? undefined : (DISTRICT_COLORS[b?.district || ''] || '#c9a227') }} />); })}
          </div>
          <p className="mt-1 px-1 text-[8px] text-slate-500">N ↑ · river →</p>
        </div>
      </div>

      {/* Building quick-select rail */}
      <div className="absolute bottom-3 left-0 right-0 sm:bottom-4">
        <div className="flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:px-4 [&::-webkit-scrollbar]:hidden">
          {buildings.map(b => (
            <button key={b.slug} onClick={() => pick(b.slug)} className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-[11px] font-bold backdrop-blur-md transition ${selected === b.slug ? 'border-amber-400 bg-amber-400 text-slate-950' : 'border-white/15 bg-[#0b0a18]/80 text-slate-100 hover:border-amber-400/60'}`}>
              <span className="h-2 w-2 rounded-full" style={{ background: DISTRICT_COLORS[b.district] || '#c9a227' }} />{b.name}
            </button>
          ))}
          {buildings.length === 0 && <span className="rounded-full bg-[#0b0a18]/80 px-3 py-2 text-[11px] text-slate-300">Loading city directory…</span>}
        </div>
      </div>

      {/* Selected building sheet */}
      <AnimatePresence>
        {sel && (
          <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} className="absolute bottom-14 left-3 right-3 max-h-[48dvh] overflow-y-auto overscroll-contain [scrollbar-width:none] sm:bottom-16 sm:left-auto sm:right-4 sm:w-[380px] sm:max-h-[72dvh]">
            <div className="rounded-3xl border border-amber-500/30 bg-[#0d0b1d]/92 p-4 shadow-2xl backdrop-blur-xl">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-black tracking-widest" style={{ color: DISTRICT_COLORS[sel.district] || '#c9a227' }}>{sel.district.toUpperCase()}</p>
                  <h2 className="font-display text-xl font-bold text-white">{sel.name}</h2>
                </div>
                <button onClick={() => setSelected(null)} className="rounded-full bg-white/5 p-1.5 text-slate-300" aria-label="Close building panel"><X size={16} /></button>
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-200"><StatusDot status={sel.status} /> {sel.status} · {sel.floors} floors · {selAgents.length} agents inside</p>
              <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-slate-300">{sel.description}</p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => navigate('/building/' + sel.slug)} className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 px-4 py-3 text-sm font-black text-slate-950 shadow-lg shadow-amber-500/25 hover:brightness-110">ENTER BUILDING <ChevronRight size={16} /></button>
                <button onClick={() => navigate('/building/' + sel.slug + '?tab=system')} className="rounded-full border border-white/20 px-4 py-3 text-sm font-bold text-white hover:border-amber-400/60">System</button>
              </div>
              <p className="mt-2 flex items-center gap-1 text-[10px] text-slate-500"><Info size={11} /> Interior people are simulated; agent & task records are live.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
