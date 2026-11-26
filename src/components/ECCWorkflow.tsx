import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

type Company = { id: number; name: string; building_slug?: string };
type LifecycleProfile = {
  id: number;
  agent_id: number;
  origin: 'ecc_preconfigured' | 'scratch';
  source_agent_key?: string | null;
  lifecycle_status: string;
  training_level: number;
  current_score: number;
  mistakes_this_cycle: number;
  assigned_building_slug?: string | null;
  assignment_duty?: string | null;
  company_id?: number | null;
  agent?: { id: number; name: string; code: string; role: string; department: string; building_slug: string; status: string; current_task: string } | null;
  company?: { id: number; name: string; building_slug: string } | null;
};

const STATUS_LABELS: Record<string, string> = {
  academy: 'ACADEMY',
  training: 'TRAINING',
  interview: 'INTERVIEW / HIRING',
  company: 'COMPANY WORKER',
  city_staff: 'ECC CITY STAFF',
  expelled: 'RETURNED TO ACADEMY',
  graduated: 'GRADUATED',
  inactive: 'INACTIVE',
};

export default function ECCWorkflow() {
  const [profiles, setProfiles] = useState<LifecycleProfile[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [notice, setNotice] = useState('');
  const [scores, setScores] = useState<Record<number, string>>({});
  const [mistakes, setMistakes] = useState<Record<number, string>>({});
  const [companyChoice, setCompanyChoice] = useState<Record<number, string>>({});
  const [trainCompanyChoice, setTrainCompanyChoice] = useState('');
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [lifecycle, companyRows] = await Promise.all([
        api<LifecycleProfile[]>('/api/lifecycle'),
        api<Company[]>('/api/companies'),
      ]);
      setProfiles(Array.isArray(lifecycle) ? lifecycle : []);
      setCompanies(Array.isArray(companyRows) ? companyRows : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load lifecycle data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => profiles.reduce<Record<string, number>>((acc, profile) => {
    acc[profile.lifecycle_status] = (acc[profile.lifecycle_status] || 0) + 1;
    return acc;
  }, {}), [profiles]);

  const visibleProfiles = useMemo(() => {
    const rows = filter === 'all' ? profiles : profiles.filter(profile => profile.lifecycle_status === filter);
    return [...rows].sort((a, b) => {
      const nameA = a.agent?.name || a.source_agent_key || String(a.agent_id);
      const nameB = b.agent?.name || b.source_agent_key || String(b.agent_id);
      return nameA.localeCompare(nameB);
    });
  }, [profiles, filter]);

  const act = async (profile: LifecycleProfile, action: string) => {
    if (!token.trim()) {
      setError('Owner lifecycle token required. It stays only in this page memory and is not saved.');
      return;
    }
    const agentId = profile.agent_id;
    const score = Number(scores[agentId] ?? 80);
    const mistakeCount = Number(mistakes[agentId] ?? 0);
    if ((action === 'complete_training' || action === 'record_work') &&
        (!Number.isFinite(score) || score < 0 || score > 100 ||
         !Number.isInteger(mistakeCount) || mistakeCount < 0)) {
      setError('Score must be 0–100 and mistakes a non-negative whole number.');
      return;
    }
    const companyId = Number(companyChoice[agentId] || companies[0]?.id || 0);
    if (action === 'hire' && (!Number.isInteger(companyId) || companyId <= 0)) {
      setError('Select a valid company before hiring.');
      return;
    }

    const key = agentId + ':' + action;
    setBusyKey(key);
    setError('');
    setNotice('');
    try {
      const body: Record<string, unknown> = { action, agent_id: agentId };
      if (action === 'start_training' || action === 'run_training') {
        body.track = profile.training_level === 0 ? 'foundation' : 'strict_level_' + profile.training_level;
      }
      if (action === 'complete_training' || action === 'record_work') {
        body.score = score;
        body.mistakes = mistakeCount;
        body.feedback = 'Recorded from Autopolis Academy / company workflow';
      }
      if (action === 'hire') body.company_id = companyId;
      const result = await api('/api/lifecycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token.trim() },
        body: JSON.stringify(body),
      });
      setNotice(action === 'run_training'
        ? 'AI Academy assessment complete: ' + (result.agent_name || profile.agent?.name || agentId) + ' scored ' + result.evaluation.score + '/100 · ' + result.completion.status + '. ' + result.evaluation.feedback
        : action.replaceAll('_', ' ') + ' succeeded for ' + (profile.agent?.name || profile.source_agent_key || agentId) + '.');
      if (result?.expelled) setNotice('Agent returned to Academy. Strict training level ' + result.training_level + ' enrolled.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lifecycle action failed');
    } finally {
      setBusyKey('');
    }
  };

  const importEcc = async () => {
    if (!token.trim()) {
      setError('Owner lifecycle token required to import ECC definitions.');
      return;
    }
    setBusyKey('ecc-import');
    setError('');
    setNotice('');
    try {
      const result = await api('/api/eccimport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token.trim() },
        body: JSON.stringify({}),
      });
      setNotice('ECC import completed: ' + result.definitions + ' definitions. ' + JSON.stringify(result.result));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ECC import failed');
    } finally {
      setBusyKey('');
    }
  };

  const trainNext = async () => {
    if (!token.trim()) { setError('Owner lifecycle token required to train the Academy queue.'); return; }
    setBusyKey('train-next'); setError(''); setNotice('');
    try {
      const result = await api('/api/lifecycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token.trim() },
        body: JSON.stringify({ action: 'train_next', company_id: Number(trainCompanyChoice || companies.find(company => company.name === 'Vyom Construction')?.id || companies[0]?.id || 0) }),
      });
      if (result?.no_agents) setNotice(result.message || 'Academy queue is empty.');
      else if (result.completion?.passed && result.hiring?.ok) setNotice('AI Academy: ' + result.agent_name + ' scored ' + result.evaluation.score + '/100 and was hired by ' + (companies.find(company => company.id === Number(trainCompanyChoice || companies.find(item => item.name === 'Vyom Construction')?.id || companies[0]?.id))?.name || 'selected company') + '. ' + result.evaluation.feedback);
      else if (result.completion?.passed) setNotice('AI Academy: ' + result.agent_name + ' scored ' + result.evaluation.score + '/100 and passed. Hire remains pending: ' + (result.hire_error || 'choose a company on the profile card') + '.');
      else setNotice('AI Academy: ' + (result.agent_name || 'agent #' + result.agent_id) + ' scored ' + result.evaluation.score + '/100 and returned to Academy. ' + result.evaluation.feedback);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Next Academy training failed');
      await load();
    } finally { setBusyKey(''); }
  };

  const renderActions = (profile: LifecycleProfile) => {
    const id = profile.agent_id;
    const status = profile.lifecycle_status;
    const working = busyKey.startsWith(id + ':');
    if (status === 'academy' || status === 'training') return <button disabled={!!busyKey} onClick={() => void act(profile, 'run_training')} className="rounded-full bg-amber-400 px-3 py-2 text-xs font-black text-slate-950 disabled:opacity-50">{working ? 'ASSESSING…' : status === 'training' ? 'RESUME AI TRAINING' : 'RUN AI TRAINING'}</button>;
    if (status === 'company') {
      return <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-1.5">
        <label className="text-[10px] text-slate-400">Score<input type="number" min="0" max="100" value={scores[id] ?? '80'} onChange={e => setScores(prev => ({ ...prev, [id]: e.target.value }))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-sm text-white" /></label>
        <label className="text-[10px] text-slate-400">Mistakes<input type="number" min="0" step="1" value={mistakes[id] ?? '0'} onChange={e => setMistakes(prev => ({ ...prev, [id]: e.target.value }))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-sm text-white" /></label>
        <button disabled={!!busyKey} onClick={() => void act(profile, 'record_work')} className="self-end rounded-full border border-amber-400/50 px-3 py-2 text-[10px] font-black text-amber-200 disabled:opacity-50">{working ? 'SAVING…' : 'SCORE WORK'}</button>
      </div>;
    }
    if (status === 'interview') return <div className="mt-2 flex gap-2">
      <select value={companyChoice[id] ?? String(companies[0]?.id ?? '')} onChange={e => setCompanyChoice(prev => ({ ...prev, [id]: e.target.value }))} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#151228] px-2 py-2 text-xs text-white">
        {companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
      </select>
      <button disabled={!!busyKey || companies.length === 0} onClick={() => void act(profile, 'hire')} className="rounded-full bg-emerald-400 px-3 py-2 text-xs font-black text-slate-950 disabled:opacity-50">{working ? 'HIRING…' : 'HIRE'}</button>
    </div>;
    return null;
  };

  return <section className="mb-6 rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/25 to-white/[0.02] p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[10px] font-black tracking-[0.25em] text-cyan-300">ECC · CITY ECOSYSTEM</p>
        <h2 className="mt-1 font-display text-xl font-bold text-white">Agent lifecycle & Academy</h2>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-400">Pinned ECC role definitions are agent instructions/personas, not trained model weights. AI assessment generates a role-specific work sample, scores it against a rubric, and records the submission/evaluation before graduation eligibility.</p>
      </div>
      <button onClick={() => void load()} disabled={loading || !!busyKey} className="rounded-full border border-white/15 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Refresh</button>
    </div>

    <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
      <label className="block text-xs font-semibold text-slate-300">Owner lifecycle token <span className="font-normal text-slate-500">(not persisted)</span>
        <input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="AUTOPOLIS_LIFECYCLE_ADMIN_TOKEN" className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-slate-600" />
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button onClick={() => void importEcc()} disabled={!!busyKey} className="rounded-full bg-cyan-300 px-4 py-2.5 text-xs font-black text-slate-950 disabled:opacity-50">{busyKey === 'ecc-import' ? 'IMPORTING 72 ECC DEFINITIONS…' : 'IMPORT / SYNC ECC 72'}</button>
        <label className="text-[10px] font-bold text-slate-400">Auto-hire passed agent to<select value={trainCompanyChoice || String(companies.find(company => company.name === 'Vyom Construction')?.id || companies[0]?.id || '')} onChange={e => setTrainCompanyChoice(e.target.value)} className="mt-1 rounded-xl border border-white/10 bg-[#151228] px-3 py-2 text-xs text-white">{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
        <button onClick={() => void trainNext()} disabled={!!busyKey || !token.trim() || companies.length === 0} className="rounded-full bg-amber-400 px-4 py-2.5 text-xs font-black text-slate-950 disabled:opacity-50">{busyKey === 'train-next' ? 'TRAINING & HIRING…' : 'TRAIN NEXT → AUTO-HIRE'}</button>
        <span className="text-[10px] text-slate-500">One Academy agent at a time. Score ≥80 and fewer than 10 mistakes passes; passing agent is hired to the selected company (2-agent company cap enforced).</span>
      </div>
    </div>

    {error && <p role="alert" className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-200">{error}</p>}
    {notice && <p role="status" className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-xs text-emerald-200">{notice}</p>}

    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {['academy','training','interview','company','city_staff','expelled','inactive'].map(status => <button key={status} onClick={() => setFilter(filter === status ? 'all' : status)} className={'rounded-xl border p-2 text-left ' + (filter === status ? 'border-cyan-300 bg-cyan-300/10' : 'border-white/10 bg-white/[0.02]')}>
        <p className="text-lg font-bold text-white">{counts[status] || 0}</p><p className="text-[9px] font-black tracking-wider text-slate-400">{STATUS_LABELS[status]}</p>
      </button>)}
    </div>

    <div className="mt-4 flex items-center justify-between gap-2">
      <p className="text-xs font-bold text-white">{filter === 'all' ? 'All lifecycle agents' : STATUS_LABELS[filter]} · {visibleProfiles.length}</p>
      <select value={filter} onChange={e => setFilter(e.target.value)} className="rounded-full border border-white/10 bg-[#151228] px-3 py-2 text-xs text-white">
        <option value="all">All statuses</option>
        {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>

    {loading ? <p className="py-5 text-center text-xs text-slate-400">Loading lifecycle records…</p> : visibleProfiles.length === 0 ? <p className="py-5 text-center text-xs text-slate-500">No lifecycle profiles yet. Apply the migrations, configure the owner token, then import the ECC roster.</p> : <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {visibleProfiles.map(profile => <article key={profile.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0"><p className="truncate text-sm font-bold text-white">{profile.agent?.name || profile.source_agent_key || 'Agent #' + profile.agent_id}</p><p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">{profile.agent?.role || 'Scratch Academy trainee'}</p></div>
          <span className="shrink-0 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[9px] font-black text-cyan-200">{STATUS_LABELS[profile.lifecycle_status] || profile.lifecycle_status.toUpperCase()}</span>
        </div>
        <p className="mt-2 text-[10px] text-slate-500">Agent #{profile.agent_id} · Level {profile.training_level} · Score {Number(profile.current_score || 0).toFixed(0)} · Mistakes {profile.mistakes_this_cycle}</p>
        <p className="mt-1 text-[10px] text-slate-500">Station: {profile.assigned_building_slug || profile.agent?.building_slug || 'unassigned'}{profile.company?.name ? ' · ' + profile.company.name : ''}</p>
        {renderActions(profile)}
      </article>)}
    </div>}
  </section>;
}
