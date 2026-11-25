import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, ArrowLeft, Building2, Bot, ListTodo, DoorOpen, LayoutGrid, Cpu, Users } from 'lucide-react';
import { api, type Building, type Agent, type Task, type ActivityItem } from '../lib/api';
import { DISTRICT_COLORS, mergeBuildings, fallbackBuildings } from '../lib/cityConfig';
import { Spinner, ErrorBox, Empty, PageHead, Avatar, StatusDot, Badge } from '../components/ui';
import InteriorView from '../components/InteriorView';
import SystemPreview from '../components/SystemPreview';
import AgentModal from '../components/AgentModal';

export function BuildingsPage() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true); const [err, setErr] = useState('');
  const [q, setQ] = useState(''); const [district, setDistrict] = useState('All'); const [status, setStatus] = useState('All');
  const load = async () => { setLoading(true); setErr(''); try { const [b, a] = await Promise.all([api('/api/buildings'), api('/api/agents')]); setBuildings(mergeBuildings(b) as Building[]); setAgents(a); } catch { setBuildings(fallbackBuildings() as Building[]); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const districts = ['All', ...new Set(buildings.map(b => b.district))];
  const filtered = buildings.filter(b => (district === 'All' || b.district === district) && (status === 'All' || b.status === status) && (b.name + b.purpose).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <PageHead title="City Buildings — All 37" sub="Every building in Autopolis Royal is unique, selectable and enterable, with its own interior and System Preview. 19 original + 12 expansion + 6 client/security/R&D buildings. Directory is served live from Supabase; any row missing from the DB falls back to the built-in directory (labelled) so Enter/System never break." badge="live" />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search buildings or purpose…" className="w-full rounded-full border border-white/10 bg-white/5 py-2.5 pl-9 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none" /></label>
        <select value={district} onChange={e => setDistrict(e.target.value)} className="rounded-full border border-white/10 bg-[#151228] px-4 py-2.5 text-sm text-white">{districts.map(d => <option key={d}>{d}</option>)}</select>
        <select value={status} onChange={e => setStatus(e.target.value)} className="rounded-full border border-white/10 bg-[#151228] px-4 py-2.5 text-sm text-white">{['All', 'operational', 'maintenance'].map(s => <option key={s}>{s}</option>)}</select>
      </div>
      {loading ? <Spinner label="Loading the city directory…" /> : err ? <ErrorBox message={err} onRetry={load} /> : filtered.length === 0 ? <Empty>No buildings match your filters.</Empty> : (
        <>
          <p className="mb-3 text-xs text-slate-400">Showing {filtered.length} of {buildings.length} buildings · inventory reconciled: <b className="text-amber-300">19 original + 12 expansion + 6 services = {buildings.length} buildings</b>{buildings.some(b => (b as any)._fallback) && <span className="text-amber-200"> · some rows from built-in fallback (run supabase/schema.sql)</span>}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((b, i) => {
              const count = agents.filter(a => a.building_slug === b.slug).length;
              return (
                <motion.div key={b.slug} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.4) }} className="group overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] hover:border-amber-400/50">
                  <div className="relative h-28 bg-gradient-to-br from-[#1b1735] to-[#0a0918] p-4" style={{ boxShadow: `inset 0 -30px 50px -20px ${DISTRICT_COLORS[b.district] || '#c9a227'}55` }}>
                    <Building2 size={40} className="text-white/15 absolute bottom-3 right-3" />
                    <p className="text-[10px] font-black tracking-widest" style={{ color: DISTRICT_COLORS[b.district] || '#c9a227' }}>{b.district.toUpperCase()} · #{String(b.id).padStart(2, '0')}</p>
                    <h3 className="font-display mt-1 text-xl font-bold text-white">{b.name}</h3>
                    <p className="flex items-center gap-1.5 text-xs text-slate-300"><StatusDot status={b.status} />{b.status} · {b.floors} floors</p>
                  </div>
                  <div className="p-4">
                    <p className="line-clamp-2 min-h-[40px] text-[13px] leading-relaxed text-slate-300">{b.purpose}</p>
                    <p className="mt-2 flex items-center gap-3 text-[11px] text-slate-400"><span className="flex items-center gap-1"><Bot size={12} className="text-amber-400" />{count} agents</span><span>{b.system_name} v{b.version}</span></p>
                    <div className="mt-3 flex gap-2">
                      <Link to={'/building/' + b.slug} className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 py-2.5 text-xs font-black text-slate-950 hover:brightness-110"><DoorOpen size={14} /> ENTER</Link>
                      <Link to={'/building/' + b.slug + '?tab=system'} className="rounded-full border border-white/15 px-3.5 py-2.5 text-xs font-bold text-white hover:border-amber-400/60">System Preview</Link>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// Ecosystem spotlights shown on a building's Overview (extension layer — core tabs unchanged)
const SPOTS: Record<string, { e: string; t: string; d: string; links: [string, string][] }> = {
  'culture-theatre': { e: '🎬', t: 'ROYAL CINEMA HALL — NOW SCREENING', d: 'Company-made movies, anime, cartoons and documentaries screen here. Published video outputs from the Resource Library premiere on these screens and collect audience reviews, stars and likes (screenings are simulated events, logged in Operations).', links: [['Browse outputs & review', '/library'], ['Awards & leaderboards', '/awards']] },
  'social-nexus': { e: '📡', t: 'PUBLISHING CENTER — MULTI-ACCOUNT DESK', d: 'One desk per platform: YouTube, Instagram, Facebook, Play Store — plus the Autopolis Social internal feed (live). External accounts show Connected only after real OAuth; today they are Setup required.', links: [['Publishing Center', '/publishing'], ['Connected Accounts', '/connected'], ['Autopolis Social', '/social']] },
  'agent-academy': { e: '🎓', t: 'THE INSTITUTE — TRAIN → GRADUATE → INTERVIEW → HIRE', d: 'Hard training across 6 tracks: Entrepreneur, Animator, Editor, Researcher, Coder, Game Dev. Too many mistakes (error status) sends an agent back for re-training. Graduates register in the Agents directory (auto-posted to Social), then companies & the ECC Team interview and hire them (max 2 active per company).', links: [['Agents directory', '/agents'], ['Hire via Companies', '/companies']] },
  'operations-tower': { e: '📥', t: 'CITY WORK INBOX + DISPATCH — RUN FROM HERE', d: 'Work arrives from the Owner, from Claude Code / external orders (pasted in — no live integration), and from city departments. Dispatching creates real Operations tasks.', links: [['Dispatch Inbox', '/dispatch'], ['Tasks', '/tasks']] },
  'horizon-port': { e: '🌍', t: 'WORLD GATEWAY', d: 'Entrepreneur-track agents depart from here to gather worldwide information and competition research for city companies. Journeys and findings are simulated briefs submitted via the Dispatch Inbox — no live web browsing is connected.', links: [['Submit a world brief', '/dispatch']] },
  'award-center': { e: '🏆', t: 'AWARD CENTER — THE BIG SHOW', d: 'Hollywood-style city honours: Best Entrepreneur, Editor, Company, Post, Agent (month/year), Best Show, Cartoon, Documentary and Coding Agent — fed by Review Company stars/views/likes and paid from the Treasury.', links: [['Award Center & Leaderboards', '/awards'], ['Treasury', '/treasury']] },
  'review-company': { e: '⭐', t: 'REVIEW COMPANY — STARS / VIEWS / LIKES', d: 'Critics and audience metrics live here. Every review in the Resource Library feeds the Award Center shortlists and the company leaderboards.', links: [['Review outputs', '/library'], ['Leaderboards', '/awards']] },
  'royal-treasury-bank': { e: '🏦', t: 'ROYAL TREASURY / TOKEN BANK', d: 'Daily city token reserve: 30 crore tokens (simulated). Companies spend from their daily allocation; unused tokens stay in the Bank, and companies can borrow extra budget from the Companies page. Royal Coins from Awards & Publishing settle here.', links: [['Open Treasury', '/treasury'], ['Companies', '/companies']] },
  'game-center': { e: '🎮', t: 'GAME CENTER — PLAY + REVIEW', d: 'Games built by Game Studio A & B are played and reviewed here. Deliver a game output to the Resource Library, collect star reviews, then publish to earn.', links: [['Resource Library', '/library'], ['Companies', '/companies']] },
  'ecc-team': { e: '🧑‍🤝‍🧑', t: 'ECC TEAM — GRADUATE PLACEMENT', d: 'The big multi-niche team. ECC interviews fresh Institute graduates (including scratch agents) and places them into city companies — or hires them into ECC squads (max 2 active like every company).', links: [['Companies & hiring', '/companies'], ['Agents', '/agents']] },
  'vyom-construction': { e: '🛠️', t: 'VYOM CONSTRUCTION', d: 'The crew that fixes and maintains the Vyom app. Send repair jobs through the Dispatch Inbox; finished fixes ship as outputs through the Resource Library.', links: [['Dispatch a Vyom job', '/dispatch']] },
  'data-vault': { e: '🗄️', t: 'RESOURCE LIBRARY — SECURE STORE', d: 'Together with the Grand Library, this vault is the Resource Library: Store 1 holds owner-added references, assets and links (searchable); Store 2 holds agent/company outputs.', links: [['Open Resource Library', '/library']] },
  'innovation-garage': { e: '🕹️', t: 'GAME STUDIO A', d: 'The original garage, upgraded: Game Studio A designs and playtests city games alongside Game Studio B in the Studio District. Finished builds go to the Resource Library → Game Center reviews.', links: [['Companies', '/companies'], ['Resource Library', '/library']] },
  'app-company': { e: '📱', t: 'APP DEVELOPMENT COMPANY — CLIENT FINDER INSIDE', d: 'Android/iOS apps for clients. Its Client Finder Office researches public leads and drafts outreach (owner-approved, never auto-sent); won deals flow into Dispatch tasks and Treasury earnings.', links: [['Clients pipeline', '/clients'], ['Companies', '/companies']] },
  'website-company': { e: '🌐', t: 'WEBSITE DEVELOPMENT COMPANY — CLIENT FINDER INSIDE', d: 'Client websites: design, frontend/backend, hosting. The Client Finder Office spots businesses with outdated websites (public info only) and drafts proposals for owner approval.', links: [['Clients pipeline', '/clients'], ['Companies', '/companies']] },
  'portfolio-company': { e: '🎨', t: 'PORTFOLIO & BRAND STUDIO — CLIENT FINDER INSIDE', d: 'Portfolios and personal brands for creators/freelancers (motion, video, dev): case-study writers + showreel edit bay, fed by its Client Finder Office.', links: [['Clients pipeline', '/clients'], ['Companies', '/companies']] },
  'security-lab': { e: '🛡️', t: 'ETHICAL SECURITY LAB — DEFENSIVE ONLY', d: 'Sandbox/own-assets security testing ONLY: vulnerability scans, code audits and secret-leak checks on the city’s own apps (incl. Vyom) and CTF targets, with pentest reports. No attacks on third-party systems. No real malware. Everything is labelled Simulated/Sandbox or Own Assets.', links: [['Dispatch a security audit', '/dispatch'], ['Operations', '/operations']] },
  'clone-lab': { e: '🧬', t: 'CLONE ANYTHING COMPANY — ORIGINAL RECREATIONS', d: 'Studies a reference app/website/UI to understand function and layout, then builds an ORIGINAL recreation. Brand logos, copyrighted assets and proprietary code are never copied; every rebuild passes the Legal/Originality Check room.', links: [['Dispatch a rebuild study', '/dispatch'], ['Resource Library', '/library']] },
  'tech-research-co': { e: '📡', t: 'NEW TECHNOLOGY RESEARCH COMPANY', d: 'Tracks new technologies, tools and models; benchmarks them in the lab, files reports into the Resource Library (Store 1) and recommends adoption to city companies. Separate from the AI Research Lab (model research).', links: [['Resource Library reports', '/library'], ['Dispatch research', '/dispatch']] },
};

export function BuildingDetail() {
  const { slug } = useParams(); const [params] = useSearchParams(); const navigate = useNavigate();
  const [tab, setTab] = useState(params.get('tab') === 'system' ? 'system' : 'interior');
  const [buildings, setBuildings] = useState<Building[]>([]); const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]); const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true); const [err, setErr] = useState(''); const [agent, setAgent] = useState<Agent | null>(null);
  const load = async () => { setLoading(true); setErr(''); try { const [b, a, t, ac] = await Promise.all([api('/api/buildings'), api('/api/agents'), api('/api/tasks'), api('/api/activity')]); setBuildings(mergeBuildings(b) as Building[]); setAgents(a); setTasks(t); setActivity(ac); } catch { setBuildings(fallbackBuildings() as Building[]); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [slug]);
  const building = buildings.find(b => b.slug === slug);
  const myAgents = useMemo(() => agents.filter(a => a.building_slug === slug), [agents, slug]);
  const myTasks = useMemo(() => tasks.filter(t => t.building_slug === slug), [tasks, slug]);
  const tabs = [{ id: 'interior', label: 'Interior & Rooms', icon: DoorOpen }, { id: 'overview', label: 'Overview', icon: LayoutGrid }, { id: 'system', label: 'System Preview', icon: Cpu }, { id: 'people', label: `Agents & Tasks (${myAgents.length})`, icon: Users }];

  if (loading) return <div className="mx-auto max-w-6xl px-4 py-10"><Spinner label="Opening the building…" /></div>;
  if (err) return <div className="mx-auto max-w-6xl px-4 py-10"><ErrorBox message={err} onRetry={load} /></div>;
  if (!building) return <div className="mx-auto max-w-6xl px-4 py-10"><Empty>Building “{slug}” was not found in the city directory.</Empty><Link to="/buildings" className="mt-4 inline-block rounded-full bg-amber-400 px-4 py-2 text-sm font-bold text-slate-950">Back to Buildings</Link></div>;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto max-w-6xl px-4 py-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button onClick={() => navigate('/')} className="flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3.5 py-2 text-xs font-bold text-amber-200 hover:bg-amber-500/20"><ArrowLeft size={14} /> RETURN TO CITY</button>
        <Link to="/buildings" className="rounded-full border border-white/15 px-3.5 py-2 text-xs font-bold text-slate-200 hover:border-amber-400/50">All Buildings</Link>
        <span className="ml-auto hidden text-xs text-slate-500 sm:block">Building ID: {building.slug} · #{String(building.id).padStart(2, '0')} of {buildings.length}</span>
      </div>
      <div className="relative overflow-hidden rounded-3xl border border-amber-500/20 bg-gradient-to-br from-[#1c1738] via-[#100e22] to-[#080714] p-5 sm:p-7" style={{ boxShadow: `inset 0 -60px 80px -40px ${DISTRICT_COLORS[building.district] || '#c9a227'}66` }}>
        <p className="text-[11px] font-black tracking-[0.25em]" style={{ color: DISTRICT_COLORS[building.district] || '#c9a227' }}>{building.district.toUpperCase()} · {building.system_name.toUpperCase()}</p>
        <h1 className="font-display mt-1 text-3xl font-bold text-white sm:text-4xl">{building.name}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">{building.description}</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-300">
          <span className="flex items-center gap-1.5"><StatusDot status={building.status} /> {building.status}</span>
          <span className="flex items-center gap-1"><Building2 size={13} className="text-amber-400" /> {building.floors} floors</span>
          <span className="flex items-center gap-1"><Bot size={13} className="text-amber-400" /> {myAgents.length} agents assigned</span>
          <span className="flex items-center gap-1"><ListTodo size={13} className="text-amber-400" /> {myTasks.filter(t => t.status !== 'completed').length} open tasks</span>
          <Badge kind="live" />
        </div>
      </div>

      <div className="sticky top-[57px] z-30 -mx-4 mt-4 bg-[#080714]/90 px-4 py-2 backdrop-blur-md">
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-bold ${tab === t.id ? 'bg-amber-400 text-slate-950' : 'bg-white/5 text-slate-200 hover:bg-white/10'}`}><t.icon size={14} />{t.label}</button>)}
        </div>
      </div>

      <div className="mt-4">
        {tab === 'interior' && <InteriorView building={building} agents={myAgents} onSelectAgent={setAgent} />}
        {tab === 'system' && <SystemPreview building={building} activity={activity} agentCount={myAgents.length} />}
        {tab === 'overview' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><h3 className="text-sm font-bold text-white">PURPOSE</h3><p className="mt-1.5 text-sm leading-relaxed text-slate-300">{building.purpose}</p>{building.slug === 'commerce-exchange' && <div className="mt-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-3.5"><p className="text-xs font-black tracking-widest text-emerald-300">📊 INFORMATION MARKET — LIVE HERE</p><p className="mt-1 text-xs leading-relaxed text-slate-300">Company rankings, money, tasks done, token usage and today's remaining budgets trade as public information on this floor. Agents visit the Leaderboard Gallery daily (simulated visits, logged in Operations).</p><div className="mt-2 flex flex-wrap gap-2"><Link to="/awards" className="rounded-full bg-emerald-400 px-3.5 py-2 text-[11px] font-black text-slate-950">Open Leaderboards & Awards</Link><Link to="/companies" className="rounded-full bg-white/5 px-3.5 py-2 text-[11px] font-bold text-white">Companies</Link><Link to="/treasury" className="rounded-full bg-white/5 px-3.5 py-2 text-[11px] font-bold text-white">Treasury</Link></div></div>}{building.slug === 'grand-library' && <div className="mt-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3.5"><p className="text-xs font-black tracking-widest text-amber-300">📚 OUTPUT RESOURCE LIBRARY — HOUSED HERE</p><p className="mt-1 text-xs leading-relaxed text-slate-300">Every company deliverable is shelved in this wing for citizen review (stars, views, likes) before Awards & Publishing. Company agents deliver outputs here in person (simulated visits, logged in Operations).</p><div className="mt-2 flex flex-wrap gap-2"><Link to="/library" className="rounded-full bg-amber-400 px-3.5 py-2 text-[11px] font-black text-slate-950">Open Resource Library</Link><Link to="/publishing" className="rounded-full bg-white/5 px-3.5 py-2 text-[11px] font-bold text-white">Publishing Center</Link></div></div>}{SPOTS[building.slug] && <div className="mt-3 rounded-2xl border border-violet-500/25 bg-violet-500/10 p-3.5"><p className="text-xs font-black tracking-widest text-violet-200">{SPOTS[building.slug].e} {SPOTS[building.slug].t}</p><p className="mt-1 text-xs leading-relaxed text-slate-300">{SPOTS[building.slug].d}</p><div className="mt-2 flex flex-wrap gap-2">{SPOTS[building.slug].links.map(([label, to]) => <Link key={to + label} to={to} className="rounded-full bg-violet-400/25 px-3.5 py-2 text-[11px] font-bold text-violet-100 hover:bg-violet-400/35">{label}</Link>)}</div></div>}<h3 className="mt-4 text-sm font-bold text-white">DEPARTMENTS</h3><div className="mt-2 flex flex-wrap gap-1.5">{building.departments.split(',').map(d => <span key={d} className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200">{d.trim()}</span>)}</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><h3 className="text-sm font-bold text-white">LIVE ACTIVITY HERE</h3>{activity.filter(a => a.building_slug === building.slug).length === 0 ? <p className="mt-2 text-sm text-slate-500">No recorded activity yet — create a task for this building in Operations and it will appear here.</p> : <ul className="mt-2 space-y-2.5">{activity.filter(a => a.building_slug === building.slug).slice(0, 6).map(a => <li key={a.id} className="text-sm"><span className="font-semibold text-slate-100">{a.title}</span><span className="block text-xs text-slate-400">{a.detail}</span></li>)}</ul>}<Link to="/operations" className="mt-3 inline-block text-xs font-bold text-amber-300 underline">Open City Operations →</Link></div>
          </div>
        )}
        {tab === 'people' && (
          <div className="space-y-4">
            <div><h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-white">AGENTS ASSIGNED HERE <Badge kind="live" /></h3>
              {myAgents.length === 0 ? <Empty>No agents are assigned to this building yet. Add one in the Agents directory.</Empty> : <div className="grid gap-2.5 sm:grid-cols-2">{myAgents.map(a => <button key={a.id} onClick={() => setAgent(a)} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left hover:border-amber-400/50"><Avatar name={a.name} color={a.avatar_color} size={42} /><span className="min-w-0"><span className="flex items-center gap-1.5 text-sm font-bold text-white"><StatusDot status={a.status} />{a.name} <span className="text-[10px] font-normal text-slate-500">{a.code}</span></span><span className="block truncate text-xs text-slate-400">{a.role} · {a.current_task}</span></span></button>)}</div>}</div>
            <div><h3 className="mb-2 text-sm font-bold text-white">TASKS IN THIS BUILDING</h3>
              {myTasks.length === 0 ? <Empty>No tasks recorded for this building.</Empty> : <div className="space-y-2">{myTasks.map(t => <div key={t.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-white">{t.title}</p><span className="flex shrink-0 items-center gap-1.5 text-[11px] text-slate-300"><StatusDot status={t.status} />{t.status.replace('_', ' ')}</span></div><p className="mt-0.5 text-xs text-slate-400">Owner: {t.agent_name} · Priority: {t.priority}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300" style={{ width: t.progress + '%' }} /></div><p className="mt-1 text-right text-[10px] text-slate-500">{t.progress}%</p></div>)}</div>}</div>
          </div>
        )}
      </div>
      <AgentModal agent={agent} buildings={buildings} onClose={() => setAgent(null)} onChanged={load} />
    </motion.div>
  );
}
