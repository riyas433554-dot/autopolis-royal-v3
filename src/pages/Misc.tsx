import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Cpu, LogOut, Mail, Lock, UserRound, Plug, ShieldCheck, Moon, Gauge, Landmark, Heart } from 'lucide-react';
import { api, timeAgo, type Building, type Agent, type Task, type Post, type Profile, type NotifItem } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import supabase from '../lib/supabase';
import { signInWithGoogle } from '../lib/googleAuth';
import { DISTRICT_COLORS, mergeBuildings, fallbackBuildings } from '../lib/cityConfig';
import { Spinner, ErrorBox, Empty, PageHead, Avatar, StatusDot, Badge, SetupRequired } from '../components/ui';

/* ---------------- SYSTEMS ---------------- */
export function SystemsPage() {
  const [buildings, setBuildings] = useState<Building[]>([]); const [loading, setLoading] = useState(true); const [err, setErr] = useState('');
  const load = async () => { setLoading(true); try { setBuildings(mergeBuildings(await api('/api/buildings')) as Building[]); } catch { setBuildings(fallbackBuildings() as Building[]); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <PageHead title="City Systems" sub={`One software system per building — ${buildings.length || 37} in total (19 original + 12 expansion + 6 services). Open any System Preview for its stack, workflow, modules and honest Live / Demo / Unavailable status.`} badge="live" />
      <div className="mb-5 rounded-3xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-relaxed text-slate-300"><b className="text-white">Shared platform (verified):</b> React + Vite frontend · Vercel serverless API routes in <code className="text-amber-300">/api</code> · Supabase Postgres database · Supabase Auth. <b className="text-white">Not connected:</b> message queues, uptime/latency monitoring, third-party provider APIs. Versions below are illustrative demo strings.</div>
      {loading ? <Spinner /> : err ? <ErrorBox message={err} onRetry={load} /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{buildings.map(b => <Link key={b.slug} to={'/building/' + b.slug + '?tab=system'} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 hover:border-amber-400/50"><p className="flex items-center gap-2 text-[10px] font-black tracking-widest" style={{ color: DISTRICT_COLORS[b.district] || '#c9a227' }}><Cpu size={13} />{b.district.toUpperCase()}</p><h3 className="font-display mt-1 text-lg font-bold text-white">{b.system_name}</h3><p className="text-xs text-slate-400">{b.name} · v{b.version} <span className="text-amber-300">(demo version)</span></p><p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-300"><StatusDot status={b.status} />{b.status} · DB record #{b.id}</p><p className="mt-2 text-[11px] font-bold text-amber-300">Open System Preview →</p></Link>)}</div>
      )}
    </div>
  );
}

/* ---------------- ANALYTICS ---------------- */
export function AnalyticsPage() {
  const [posts, setPosts] = useState<Post[]>([]); const [tasks, setTasks] = useState<Task[]>([]); const [agents, setAgents] = useState<Agent[]>([]); const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true); const [err, setErr] = useState('');
  const load = async () => { setLoading(true); try { const [p, t, a, b] = await Promise.all([api('/api/posts'), api('/api/tasks'), api('/api/agents'), api('/api/buildings')]); setPosts(p); setTasks(t); setAgents(a); setBuildings(b); } catch (e: any) { setErr(e.message); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const published = posts.filter(p => !p.is_draft);
  const bar = (label: string, value: number, max: number, color = 'from-amber-500 to-yellow-300') => (<div className="mt-2"><p className="flex justify-between text-[11px] text-slate-300"><span className="truncate pr-2">{label}</span><b className="text-white">{value}</b></p><div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full bg-gradient-to-r ${color}`} style={{ width: Math.max(3, (value / max) * 100) + '%' }} /></div></div>);
  const taskByStatus = ['queued', 'in_progress', 'blocked', 'completed'].map(s => ({ s, n: tasks.filter(t => t.status === s).length }));
  const agentByStatus = ['active', 'busy', 'idle', 'error'].map(s => ({ s, n: agents.filter(a => a.status === s).length }));
  const top = [...published].sort((a, b) => b.likes - a.likes).slice(0, 6);
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <PageHead title="City Analytics" sub="Computed live from Supabase records. External reach, impressions and follower-change metrics are unavailable (no provider connected) and are never fabricated." badge="live" />
      {loading ? <Spinner /> : err ? <ErrorBox message={err} onRetry={load} /> : (
        <>
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 sm:gap-3">{[{ l: 'SOCIAL POSTS', v: published.length }, { l: 'TOTAL LIKES', v: published.reduce((s, p) => s + p.likes, 0) }, { l: 'TOTAL SHARES', v: published.reduce((s, p) => s + p.shares, 0) }, { l: 'TASK COMPLETION', v: tasks.length ? Math.round(tasks.filter(t => t.status === 'completed').length / tasks.length * 100) + '%' : '—' }].map(c => <div key={c.l} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 text-center"><p className="font-display text-3xl font-bold text-white">{c.v}</p><p className="text-[10px] font-black tracking-widest text-slate-400">{c.l}</p></div>)}</div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4"><h3 className="flex items-center gap-2 text-sm font-bold text-white"><Heart size={15} className="text-pink-400" /> TOP POSTS BY LIKES <Badge kind="live" /></h3>{top.length === 0 ? <p className="mt-2 text-xs text-slate-500">No posts yet.</p> : top.map(p => bar(`${p.author_name}: ${p.content}`, p.likes, Math.max(1, top[0].likes), 'from-pink-500 to-amber-400'))}</div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4"><h3 className="text-sm font-bold text-white">TASKS BY STATUS <Badge kind="live" /></h3>{taskByStatus.map(x => bar(x.s.replace('_', ' '), x.n, Math.max(1, ...taskByStatus.map(y => y.n)), 'from-sky-500 to-cyan-300'))}<h3 className="mt-4 text-sm font-bold text-white">AGENTS BY STATUS</h3>{agentByStatus.map(x => bar(x.s, x.n, Math.max(1, ...agentByStatus.map(y => y.n)), 'from-violet-500 to-fuchsia-300'))}</div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4"><h3 className="text-sm font-bold text-white">BUILDINGS PER DISTRICT</h3>{Object.keys(DISTRICT_COLORS).map(d => bar(d, buildings.filter(b => b.district === d).length, 6))}</div>
            <div className="rounded-3xl border border-amber-500/20 bg-amber-500/[0.04] p-4"><div className="flex items-center gap-2"><h3 className="text-sm font-bold text-white">Reach · Impressions · Follower change</h3><Badge kind="unavailable" /></div><p className="mt-2 text-xs leading-relaxed text-slate-400">These metrics only exist inside Instagram/Facebook/YouTube/X/LinkedIn. No provider account is connected to this deployment, so they cannot be retrieved. Connect a real provider integration (with its own OAuth app credentials) to enable them — until then this panel intentionally shows no numbers.</p><Link to="/connected" className="mt-2 inline-block text-xs font-bold text-amber-300 underline">Connected Accounts →</Link></div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- NOTIFICATIONS ---------------- */
export function NotificationsPage() {
  const [items, setItems] = useState<NotifItem[]>([]); const [loading, setLoading] = useState(true); const [err, setErr] = useState('');
  const load = async () => { setLoading(true); try { setItems(await api('/api/notifications')); } catch (e: any) { setErr(e.message); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const mark = async (id?: number) => { try { await api('/api/notifications', { method: 'PUT', body: JSON.stringify(id ? { id } : { all: true }) }); load(); } catch { /* noop */ } };
  const icon = (t: string) => t === 'like' ? '❤️' : t === 'comment' ? '💬' : t === 'follow' ? '👥' : t === 'task' ? '📋' : t === 'alert' ? '🚨' : t === 'mention' ? '🔔' : '🏙️';
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex flex-wrap items-center gap-3"><div className="flex-1"><PageHead title="Notifications" sub="City & social notifications stored in the database." badge="live" /></div>{items.some(i => !i.is_read) && <button onClick={() => mark()} className="flex items-center gap-1.5 rounded-full bg-amber-400 px-4 py-2.5 text-xs font-black text-slate-950"><CheckCheck size={14} /> Mark all read</button>}</div>
      {loading ? <Spinner /> : err ? <ErrorBox message={err} onRetry={load} /> : items.length === 0 ? <Empty><Bell className="mx-auto mb-1" size={20} />No notifications yet.</Empty> : (
        <div className="space-y-2">{items.map(n => <button key={n.id} onClick={() => !n.is_read && mark(n.id)} className={`flex w-full gap-3 rounded-2xl border p-3.5 text-left ${n.is_read ? 'border-white/5 bg-white/[0.02] opacity-70' : 'border-amber-500/25 bg-amber-500/[0.06]'}`}><span className="text-xl">{icon(n.type)}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-white">{n.title}</span><span className="block text-xs text-slate-400">{n.detail}</span><span className="text-[10px] text-slate-500">{timeAgo(n.created_at)} · {n.type}</span></span>{!n.is_read && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400" />}</button>)}</div>
      )}
    </div>
  );
}

/* ---------------- LOGIN ---------------- */
export function LoginPage() {
  const { user, loading } = useAuth(); const navigate = useNavigate();
  const [mode, setMode] = useState<'in' | 'up'>('in'); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(''); const [isErr, setIsErr] = useState(false);
  useEffect(() => { if (!loading && user) navigate('/profile'); }, [user, loading, navigate]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(''); setIsErr(false);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setIsErr(true); setMsg('Please enter a valid email address.'); return; }
    if (password.length < 6) { setIsErr(true); setMsg('Password must be at least 6 characters.'); return; }
    setBusy(true);
    try {
      if (mode === 'up') { const { error } = await supabase.auth.signUp({ email, password }); if (error) throw error; setMsg('Account created. You can now sign in (if email confirmation is enabled on this project, check your inbox first).'); setMode('in'); }
      else { const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw error; setMsg('Signed in — redirecting to your profile…'); }
    } catch (e2: any) { setIsErr(true); setMsg(e2.message || 'Authentication failed.'); } finally { setBusy(false); }
  };
  const reset = async () => { if (!email) { setIsErr(true); setMsg('Enter your email above first, then tap “Forgot password”.'); return; } const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/login' }); setIsErr(!!error); setMsg(error ? error.message : 'Password reset email requested. Check your inbox for the secure link from Supabase.'); };
  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="rounded-3xl border border-amber-500/25 bg-white/[0.03] p-6">
        <p className="text-center text-3xl">👑</p>
        <h1 className="font-display mt-1 text-center text-2xl font-bold text-white">{mode === 'in' ? 'Welcome back, Citizen' : 'Become a Citizen'}</h1>
        <p className="mt-1 text-center text-xs leading-relaxed text-slate-400">Real accounts via Supabase Auth. Passwords are hashed by Supabase — never stored in plaintext, never seen by this app.</p>
        <div className="mt-4 grid grid-cols-2 gap-1 rounded-full bg-black/30 p-1"><button onClick={() => setMode('in')} className={`rounded-full py-2 text-xs font-bold ${mode === 'in' ? 'bg-amber-400 text-slate-950' : 'text-slate-300'}`}>Sign in</button><button onClick={() => setMode('up')} className={`rounded-full py-2 text-xs font-bold ${mode === 'up' ? 'bg-amber-400 text-slate-950' : 'text-slate-300'}`}>Register</button></div>
        <form onSubmit={submit} className="mt-4 space-y-2.5">
          <label className="relative block"><Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" /><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address" autoComplete="email" className="w-full rounded-full border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none" /></label>
          <label className="relative block"><Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" /><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password (min 6 characters)" autoComplete={mode === 'up' ? 'new-password' : 'current-password'} className="w-full rounded-full border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none" /></label>
          {msg && <p className={`rounded-xl px-3 py-2.5 text-xs leading-relaxed ${isErr ? 'bg-red-500/15 text-red-200' : 'bg-emerald-500/15 text-emerald-200'}`}>{msg}</p>}
          <button disabled={busy} className="w-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 py-3 text-sm font-black text-slate-950 disabled:opacity-50">{busy ? 'PLEASE WAIT…' : mode === 'in' ? 'SIGN IN' : 'CREATE ACCOUNT'}</button>
        </form>
        <button onClick={reset} className="mt-2.5 w-full text-center text-xs font-semibold text-amber-300 underline">Forgot password? Email me a reset link</button>
        <div className="my-4 flex items-center gap-3 text-[10px] font-bold tracking-widest text-slate-500"><span className="h-px flex-1 bg-white/10" />OR<span className="h-px flex-1 bg-white/10" /></div>
        <button onClick={() => signInWithGoogle('Autopolis Royal')} className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-3 text-sm font-bold text-slate-800 hover:bg-slate-100"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-white font-black text-[#4285F4]">G</span> Sign in with Google</button>
        <div className="mt-4 rounded-2xl border border-dashed border-amber-500/30 bg-amber-500/5 p-3 text-center"><p className="text-[10px] font-black tracking-widest text-amber-300">DEMO ACCOUNT</p><p className="mt-1 text-xs text-slate-200">demo@autopolis.royal · royal123456</p><button onClick={() => { setEmail('demo@autopolis.royal'); setPassword('royal123456'); setMode('in'); }} className="mt-2 rounded-full bg-amber-400/20 px-3.5 py-1.5 text-[11px] font-bold text-amber-200">Fill demo credentials</button></div>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-500"><ShieldCheck size={12} /> Sessions persist securely via Supabase. Guest browsing stays available.</p>
      </div>
    </div>
  );
}

/* ---------------- PROFILE ---------------- */
export function ProfilePage() {
  const { user, loading: authLoading } = useAuth(); const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]); const [profiles, setProfiles] = useState<Profile[]>([]); const [loading, setLoading] = useState(true);
  const [editName, setEditName] = useState(''); const [editBio, setEditBio] = useState(''); const [note, setNote] = useState(''); const [saving, setSaving] = useState(false);
  const myHandle = user ? '@' + (user.email?.split('@')[0] || 'citizen') : '@guest';
  const load = async () => { try { const [p, pr] = await Promise.all([api('/api/posts'), api('/api/profiles')]); setPosts(p); setProfiles(pr); if (pr[0]) { setEditName(pr[0].name); setEditBio(pr[0].bio); } } catch { /* noop */ } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const official = profiles[0];
  const myPosts = posts.filter(p => p.author_handle === myHandle);
  const saveProfile = async () => { if (!official) return; if (!editName.trim()) { setNote('Name cannot be empty.'); return; } setSaving(true); try { await api('/api/profiles', { method: 'PUT', body: JSON.stringify({ id: official.id, name: editName, bio: editBio }) }); setNote('Official city profile updated in the database.'); load(); } catch (e: any) { setNote(e.message); } finally { setSaving(false); } };
  const signOut = async () => { await supabase.auth.signOut(); navigate('/'); };
  if (authLoading || loading) return <div className="mx-auto max-w-3xl px-4 py-10"><Spinner /></div>;
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <PageHead title="Profile" sub={user ? 'Your real Supabase account and city presence.' : 'You are browsing as Guest Citizen (Demo identity).'} badge={user ? 'live' : 'demo'} />
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-center gap-4"><Avatar name={user?.email || 'Guest Citizen'} color="#c9a227" size={64} /><div className="min-w-0 flex-1"><h2 className="font-display truncate text-2xl font-bold text-white">{user ? (user.user_metadata?.full_name || user.email?.split('@')[0]) : 'Guest Citizen'}</h2><p className="text-sm text-slate-400">{myHandle}{user?.email ? ' · ' + user.email : ''}</p><p className="mt-1 text-xs text-slate-400">Auth provider: <b className="text-slate-200">{user ? (user.app_metadata?.provider || 'email') : 'none (guest)'}</b> · Session: <b className="text-slate-200">{user ? 'active & persisted' : 'guest mode'}</b></p></div>
          {user ? <button onClick={signOut} className="flex items-center gap-1.5 rounded-full bg-red-500/20 px-4 py-2.5 text-xs font-bold text-red-200 hover:bg-red-500/30"><LogOut size={13} /> Sign out</button> : <Link to="/login" className="rounded-full bg-amber-400 px-4 py-2.5 text-xs font-black text-slate-950">Sign in / Register</Link>}</div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-black/25 p-3"><p className="font-display text-xl font-bold text-white">{myPosts.filter(p => !p.is_draft).length}</p><p className="text-[9px] font-black tracking-widest text-slate-400">MY POSTS</p></div><div className="rounded-xl bg-black/25 p-3"><p className="font-display text-xl font-bold text-white">{myPosts.reduce((s, p) => s + p.likes, 0)}</p><p className="text-[9px] font-black tracking-widest text-slate-400">LIKES RECEIVED</p></div><div className="rounded-xl bg-black/25 p-3"><p className="font-display text-xl font-bold text-white">{myPosts.filter(p => p.is_draft).length}</p><p className="text-[9px] font-black tracking-widest text-slate-400">DRAFTS</p></div></div>
      </div>
      {official && (
        <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-white"><UserRound size={15} className="text-amber-400" /> Edit official city profile <span className="text-[11px] font-normal text-slate-500">(public database record shown in Connections)</span></h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2"><input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Display name" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none" /><input value={editBio} onChange={e => setEditBio(e.target.value)} placeholder="Bio" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none" /></div>
          <p className="mt-2 text-[11px] text-slate-500">{official.handle} · {official.followers} followers · {official.following} following</p>
          {note && <p className="mt-2 text-xs text-amber-200">{note}</p>}
          <button disabled={saving} onClick={saveProfile} className="mt-3 rounded-full bg-amber-400 px-5 py-2.5 text-xs font-black text-slate-950 disabled:opacity-50">{saving ? 'SAVING…' : 'SAVE PROFILE'}</button>
        </div>
      )}
      <h3 className="mb-2 mt-6 text-sm font-bold text-white">MY POSTS</h3>
      {myPosts.length === 0 ? <Empty>No posts under {myHandle} yet. <Link to="/social" className="text-amber-300 underline">Publish your first post →</Link></Empty> : <div className="space-y-2.5">{myPosts.map(p => <div key={p.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5"><p className="text-sm text-slate-100">{p.content}</p><p className="mt-1 text-[11px] text-slate-500">{p.is_draft ? '📝 Draft · ' : ''}❤ {p.likes} · ↗ {p.shares} · {timeAgo(p.created_at)}</p></div>)}</div>}
    </div>
  );
}

/* ---------------- CONNECTED ACCOUNTS ---------------- */
export function ConnectedPage() {
  const { user } = useAuth();
  const googleSignIn = !!user && user.app_metadata?.provider === 'google';
  const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(true); const [err, setErr] = useState('');
  const [active, setActive] = useState<Record<string, number>>({});
  const [ownerToken, setOwnerToken] = useState(''); const [connecting, setConnecting] = useState(''); const [oauthNote, setOauthNote] = useState('');
  const load = async () => { setLoading(true); setErr(''); try { setData(await api('/api/connected')); const params = new URLSearchParams(window.location.search); if (params.get('oauth_status') === 'success') setOauthNote('Connected ' + params.get('provider') + ' account(s): ' + (params.get('connected') || '1') + '.'); else if (params.get('oauth_status') === 'error') setOauthNote(params.get('oauth_message') || 'OAuth connection failed.'); } catch (e: any) { setErr(e.message); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const connect = async (provider: string) => { if (!ownerToken.trim()) { setOauthNote('Enter the owner lifecycle token to connect an account.'); return; } setConnecting(provider); setOauthNote(''); try { const result = await api('/api/connected', { method: 'POST', headers: { Authorization: 'Bearer ' + ownerToken.trim() }, body: JSON.stringify({ provider }) }); if (!result.authUrl) throw new Error('OAuth URL was not returned'); window.location.assign(result.authUrl); } catch (e: any) { setOauthNote(e.message || 'Could not start OAuth.'); setConnecting(''); } };
  const disconnect = async (id: number) => { try { await api('/api/connected', { method: 'DELETE', headers: { Authorization: 'Bearer ' + ownerToken.trim() }, body: JSON.stringify({ id }) }); load(); } catch (e: any) { setOauthNote(e.message || 'Disconnect failed.'); } };
  const meta = { meta: { icon: '📘', color: '#1877F2', cta: 'Connect Facebook + Instagram (Meta)' }, youtube: { icon: '▶️', color: '#FF0000', cta: 'Connect YouTube (Google)' } } as Record<string, any>;
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <PageHead title="Connected Accounts" sub="Login-to-connect only (Metricool-style). An account shows Connected only after a real OAuth succeeds and is stored server-side. Secrets live in server env vars — never in frontend code, never shown here." badge="live" />
      <div className="mb-3 rounded-3xl border border-amber-500/20 bg-amber-500/[0.04] p-4"><label className="block text-xs font-bold text-slate-200">Owner lifecycle token <input type="password" value={ownerToken} onChange={e => setOwnerToken(e.target.value)} autoComplete="off" placeholder="Paste server owner token (not stored)" className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 font-mono text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none" /></label><p className="mt-1.5 text-[10px] text-slate-500">Used only for owner-authorized connect/disconnect requests; kept in this page's memory only.</p></div>
      {oauthNote && <p className="mb-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-100">{oauthNote}</p>}
      {loading ? <Spinner label="Checking provider setup…" /> : err ? <ErrorBox message={err} onRetry={load} /> : (
        <div className="space-y-3">
          {(data?.providers || []).map((p: any) => { const m = meta[p.id] || { icon: '🔌', color: '#c9a227', cta: 'Connect' }; const accs = p.accounts || []; const current = accs.find((a: any) => a.id === active[p.id]) || accs[0]; return (
            <div key={p.id} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg" style={{ background: m.color + '33' }}>{m.icon}</span>
                <div className="min-w-0 flex-1"><p className="font-bold text-white">{p.name}</p><p className={`text-[11px] font-bold ${p.status === 'connected' ? 'text-emerald-300' : p.status === 'ready_to_connect' ? 'text-sky-300' : 'text-amber-300'}`}>{p.status === 'connected' ? `● Connected (${accs.length} account${accs.length > 1 ? 's' : ''})` : p.status === 'ready_to_connect' ? '◐ Credentials present — ready to connect' : '○ Setup required'}</p></div>
                <button disabled={!p.oauthReady || !ownerToken.trim() || connecting === p.id} title={p.oauthReady ? (ownerToken.trim() ? "Start provider OAuth" : "Enter owner token first") : "Configure the server environment variables shown below"} onClick={() => void connect(p.id)} className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/5 px-4 py-2.5 text-xs font-bold text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"><Plug size={13} /> {connecting === p.id ? "Opening…" : m.cta}</button></div>
              {accs.length > 0 && current && (<div className="mt-3 rounded-2xl bg-black/25 p-3">
                <div className="flex flex-wrap items-center gap-2.5"><Avatar name={current.account_name} color={m.color} size={36} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-white">{current.account_name}</p><p className="text-[10px] text-slate-500">Last sync: {current.last_sync ? new Date(current.last_sync).toLocaleString('en-GB') : 'never recorded'}</p></div>
                {accs.length > 1 && <select value={current.id} onChange={e => setActive({ ...active, [p.id]: Number(e.target.value) })} className="rounded-xl border border-white/10 bg-[#151228] px-2.5 py-2 text-xs text-white">{accs.map((a: any) => <option key={a.id} value={a.id}>{a.account_name}</option>)}</select>}
                <button disabled={!ownerToken.trim()} onClick={() => disconnect(current.id)} className="rounded-full bg-red-500/20 px-3.5 py-2 text-[11px] font-bold text-red-200 disabled:opacity-40">Disconnect</button></div>
                <p className="mt-1.5 text-[10px] text-slate-500">Account switcher: scheduling in Social Mgmt targets the selected account (Demo mode until connected).</p></div>)}
              <p className="mt-2.5 text-xs leading-relaxed text-slate-400">{p.note}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">{p.env.map((k: string) => <span key={k} className={`rounded-full border px-2.5 py-1 font-mono text-[10px] ${p.envPresent?.[k] ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-red-500/30 bg-red-500/10 text-red-200'}`}>{p.envPresent?.[k] ? '✓' : '✕'} {k} (server env)</span>)}<span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 font-mono text-[10px] text-slate-300">redirect URI: /api/oauth/{p.id}/callback</span></div>
            </div>); })}
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-4 opacity-80"><p className="text-sm font-bold text-white">Later</p><p className="mt-1 text-xs leading-relaxed text-slate-400">𝕏 X (Twitter) · 💼 LinkedIn — planned later, intentionally not offered until their OAuth apps exist. <b className="text-slate-200">Google Sign-In</b> (login only) is separate and already live: {googleSignIn ? 'you are signed in with Google ✓ (no publishing access granted).' : <>try it on the <Link to="/login" className="text-amber-300 underline">login page</Link>.</>}</p></div>
          {data?.tableMissing && <SetupRequired what="Connected Accounts storage" onRetry={load} />}
          <div className="rounded-3xl border border-amber-500/20 bg-amber-500/[0.05] p-4 text-xs leading-relaxed text-slate-300"><b className="text-amber-200">Publishing rule:</b> in <Link to="/manage" className="text-amber-300 underline">Social Mgmt</Link>, a post is only really published when the target account above is Connected. Until then everything stays in the planner, labelled <b>Demo mode</b>. Autopolis Social (internal feed) works fully today.</div>
        </div>
      )}
    </div>
  );
}

/* ---------------- SETTINGS ---------------- */
export function SettingsPage() {
  const { user } = useAuth(); const navigate = useNavigate();
  const [night, setNight] = useState(localStorage.getItem('ar-night') === '1');
  const [reduced, setReduced] = useState(localStorage.getItem('ar-reduced') === '1');
  useEffect(() => { localStorage.setItem('ar-night', night ? '1' : '0'); }, [night]);
  useEffect(() => { localStorage.setItem('ar-reduced', reduced ? '1' : '0'); }, [reduced]);
  const Toggle = ({ on, set, icon: Icon, title, desc }: any) => (<button onClick={() => set(!on)} className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left hover:border-amber-400/40"><Icon size={19} className="shrink-0 text-amber-400" /><span className="flex-1"><span className="block text-sm font-bold text-white">{title}</span><span className="block text-xs text-slate-400">{desc}</span></span><span className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-amber-400' : 'bg-white/15'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${on ? 'left-[22px]' : 'left-0.5'}`} /></span></button>);
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <PageHead title="Settings" sub="Preferences are stored on this device. Account settings use your real Supabase session." />
      <div className="space-y-2.5">
        <Toggle on={night} set={setNight} icon={Moon} title="Start city at night" desc="The 3D city opens in night mode with lit windows, street lamps and stars." />
        <Toggle on={reduced} set={setReduced} icon={Gauge} title="Reduced-detail (Lite) mode" desc="Fewer animated citizens & cars. Recommended for older Android phones to keep the city smooth." />
      </div>
      <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
        <h3 className="text-sm font-bold text-white">ACCOUNT</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">{user ? `Signed in as ${user.email} via ${user.app_metadata?.provider || 'email'}. Session persists across visits.` : 'You are in guest mode. City browsing works, and social actions use the Demo identity.'}</p>
        <div className="mt-3 flex flex-wrap gap-2">{user ? <><Link to="/profile" className="rounded-full bg-amber-400 px-4 py-2.5 text-xs font-black text-slate-950">My profile</Link><button onClick={async () => { await supabase.auth.signOut(); navigate('/'); }} className="rounded-full bg-red-500/20 px-4 py-2.5 text-xs font-bold text-red-200">Sign out</button></> : <Link to="/login" className="rounded-full bg-amber-400 px-4 py-2.5 text-xs font-black text-slate-950">Sign in / Register</Link>}<Link to="/connected" className="rounded-full border border-white/15 px-4 py-2.5 text-xs font-bold text-white">Connected accounts</Link></div>
      </div>
      <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-relaxed text-slate-400"><b className="text-white">Data honesty policy.</b> Live data (buildings, agents, tasks, posts, messages) comes from Supabase through <code className="text-amber-300">/api</code> routes. Animated citizens, agent “work”, reach charts and version strings are labelled Demo/Simulated. External social platforms are Not Connected. No secrets are stored in this app; passwords live only inside Supabase Auth.</div>
    </div>
  );
}

/* ---------------- FACILITIES ---------------- */
export function FacilitiesPage() {
  const [buildings, setBuildings] = useState<Building[]>([]); const [loading, setLoading] = useState(true); const [err, setErr] = useState('');
  const load = async () => { setLoading(true); try { setBuildings(mergeBuildings(await api('/api/buildings')) as Building[]); } catch { setBuildings(fallbackBuildings() as Building[]); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const districts = Object.keys(DISTRICT_COLORS);
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <PageHead title="City Facilities & Services" sub="Public services grouped by district. Facility records are live; opening hours are illustrative demo information." badge="live" />
      {loading ? <Spinner /> : err ? <ErrorBox message={err} onRetry={load} /> : districts.map(d => (
        <section key={d} className="mb-6"><h2 className="mb-2.5 flex items-center gap-2 font-display text-lg font-bold text-white"><Landmark size={17} style={{ color: DISTRICT_COLORS[d] }} />{d}</h2>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">{buildings.filter(b => b.district === d).map(b => <Link key={b.slug} to={'/building/' + b.slug} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 hover:border-amber-400/50"><p className="flex items-center gap-2 text-sm font-bold text-white"><StatusDot status={b.status} />{b.name}</p><p className="mt-1 line-clamp-2 text-xs text-slate-400">{b.purpose}</p><p className="mt-1.5 text-[11px] text-slate-500">🕐 Open 24/7 to citizens <span className="text-amber-300/80">(demo hours)</span> · Services: {b.departments.split(',').slice(0, 2).join(', ')}</p></Link>)}</div></section>
      ))}
    </div>
  );
}
