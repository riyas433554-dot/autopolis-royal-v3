import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Plus, Trash2, BarChart3, Clock3, FileEdit, Send } from 'lucide-react';
import { api, type ScheduledPost, type Post } from '../lib/api';
import { Spinner, ErrorBox, Empty, PageHead, Badge } from '../components/ui';

const PLATFORMS = ['Autopolis Social', 'Instagram', 'Facebook', 'YouTube', 'X', 'LinkedIn'];

export default function ManagePage() {
  const [items, setItems] = useState<ScheduledPost[]>([]); const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true); const [err, setErr] = useState('');
  const [view, setView] = useState<'month' | 'list'>('month');
  const [form, setForm] = useState({ content: '', platform: 'Autopolis Social', scheduled_for: '', status: 'draft' });
  const [note, setNote] = useState(''); const [saving, setSaving] = useState(false);
  const load = async () => { setLoading(true); setErr(''); try { const [s, p] = await Promise.all([api('/api/scheduled'), api('/api/posts')]); setItems(s); setPosts(p); } catch (e: any) { setErr(e.message); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const create = async (e: React.FormEvent) => { e.preventDefault(); if (!form.content.trim()) { setNote('Content is required.'); return; } setSaving(true); try { await api('/api/scheduled', { method: 'POST', body: JSON.stringify(form) }); setNote(form.platform === 'Autopolis Social' ? 'Saved to the content planner (database). Use “Publish to feed” to post it in Autopolis Social.' : `Saved as a ${form.status} plan for ${form.platform}. It was NOT sent to ${form.platform} — that account is not connected.`); setForm({ content: '', platform: 'Autopolis Social', scheduled_for: '', status: 'draft' }); load(); } catch (e2: any) { setNote(e2.message); } finally { setSaving(false); } };
  const setStatus = async (it: ScheduledPost, status: string) => { try { await api('/api/scheduled', { method: 'PUT', body: JSON.stringify({ id: it.id, status }) }); load(); } catch (e: any) { setNote(e.message); } };
  const publishToFeed = async (it: ScheduledPost) => { try { await api('/api/posts', { method: 'POST', body: JSON.stringify({ author_name: 'Autopolis Royal (Official)', author_handle: '@autopolisroyal', content: it.content, hashtags: (it.content.match(/#[\w]+/g) || []).join(' ') }) }); await api('/api/scheduled', { method: 'PUT', body: JSON.stringify({ id: it.id, status: 'published' }) }); setNote('Published to the Autopolis Social feed. External platforms were not touched.'); load(); } catch (e: any) { setNote('Publish failed: ' + e.message); } };
  const remove = async (it: ScheduledPost) => { try { await api('/api/scheduled', { method: 'DELETE', body: JSON.stringify({ id: it.id }) }); load(); } catch (e: any) { setNote(e.message); } };

  const now = new Date(); const year = now.getFullYear(); const month = now.getMonth();
  const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate();
  const byDay = useMemo(() => { const m = new Map<number, ScheduledPost[]>(); items.forEach(it => { if (!it.scheduled_for) return; const d = new Date(it.scheduled_for); if (d.getFullYear() === year && d.getMonth() === month) { const k = d.getDate(); m.set(k, [...(m.get(k) || []), it]); } }); return m; /* eslint-disable-next-line */ }, [items]);
  const published = posts.filter(p => !p.is_draft);
  const totalLikes = published.reduce((s, p) => s + p.likes, 0); const totalShares = published.reduce((s, p) => s + p.shares, 0);
  const topPosts = [...published].sort((a, b) => b.likes - a.likes).slice(0, 5);
  const maxLikes = Math.max(1, ...topPosts.map(p => p.likes));
  const demoReach = [42, 58, 51, 73, 66, 89, 77];
  const statusColor = (s: string) => s === 'published' ? 'bg-emerald-500/20 text-emerald-300' : s === 'scheduled' ? 'bg-sky-500/20 text-sky-300' : 'bg-white/10 text-slate-300';

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <PageHead title="Social Media Management" sub="Plan content for Autopolis Social and external channels. Only Autopolis Social publishing is real. External accounts are not connected, so nothing is ever sent to them — plans for those platforms stay in this planner." badge="demo" />
      {loading ? <Spinner label="Loading the content studio…" /> : err ? <ErrorBox message={err} onRetry={load} /> : (
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="space-y-5">
            <form onSubmit={create} className="rounded-3xl border border-amber-500/20 bg-white/[0.03] p-4">
              <p className="flex items-center gap-2 text-sm font-bold text-white"><Plus size={16} className="text-amber-400" /> Composer & scheduler</p>
              <textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} rows={3} placeholder="Write your post… #AutopolisRoyal" className="mt-3 w-full resize-none rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none" />
              <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
                <select value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })} className="rounded-xl border border-white/10 bg-[#151228] px-3 py-2.5 text-sm text-white">{PLATFORMS.map(p => <option key={p}>{p}{p !== 'Autopolis Social' ? ' (not connected)' : ''}</option>)}</select>
                <input type="datetime-local" value={form.scheduled_for} onChange={e => setForm({ ...form, scheduled_for: e.target.value })} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white [color-scheme:dark]" />
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="rounded-xl border border-white/10 bg-[#151228] px-3 py-2.5 text-sm text-white"><option value="draft">Save as draft</option><option value="scheduled">Schedule</option></select>
              </div>
              {form.platform !== 'Autopolis Social' && <p className="mt-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">⚠ {form.platform} is <b>Not connected</b>. Scheduling here only saves a plan in this app — it will not publish to {form.platform}. See <Link to="/connected" className="underline">Connected Accounts</Link>.</p>}
              {note && <p className="mt-2 text-xs text-amber-200">{note}</p>}
              <button disabled={saving} className="mt-3 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 px-5 py-2.5 text-xs font-black text-slate-950 disabled:opacity-50">{saving ? 'SAVING…' : form.status === 'scheduled' ? 'SCHEDULE (PLANNER)' : 'SAVE DRAFT'}</button>
            </form>

            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-center gap-2"><h3 className="flex items-center gap-2 text-sm font-bold text-white"><CalendarDays size={16} className="text-amber-400" /> Content calendar — {now.toLocaleString('en-GB', { month: 'long', year: 'numeric' })}</h3><div className="ml-auto flex gap-1.5"><button onClick={() => setView('month')} className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${view === 'month' ? 'bg-amber-400 text-slate-950' : 'bg-white/5 text-slate-200'}`}>Month</button><button onClick={() => setView('list')} className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${view === 'list' ? 'bg-amber-400 text-slate-950' : 'bg-white/5 text-slate-200'}`}>List</button></div></div>
              {view === 'month' ? (
                <div className="mt-3 grid grid-cols-7 gap-1">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <p key={d} className="py-1 text-center text-[10px] font-black text-slate-500">{d}</p>)}{Array.from({ length: firstDay }).map((_, i) => <span key={'e' + i} />)}{Array.from({ length: daysInMonth }).map((_, i) => { const day = i + 1; const dayItems = byDay.get(day) || []; const today = day === now.getDate(); return <div key={day} className={`min-h-[52px] rounded-lg border p-1 ${today ? 'border-amber-400 bg-amber-400/10' : 'border-white/5 bg-white/[0.02]'}`}><p className={`text-[10px] font-bold ${today ? 'text-amber-300' : 'text-slate-400'}`}>{day}</p>{dayItems.slice(0, 2).map(it => <p key={it.id} className="mt-0.5 truncate rounded bg-sky-500/20 px-1 py-0.5 text-[8px] font-semibold text-sky-200">{it.platform}: {it.content}</p>)}{dayItems.length > 2 && <p className="text-[8px] text-slate-400">+{dayItems.length - 2} more</p>}</div>; })}</div>
              ) : items.length === 0 ? <div className="mt-3"><Empty>No planned content yet. Compose your first post above.</Empty></div> : (
                <div className="mt-3 space-y-2">{items.map(it => <div key={it.id} className="rounded-2xl border border-white/10 bg-black/20 p-3"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${statusColor(it.status)}`}>{it.status.toUpperCase()}</span><span className="text-[11px] font-semibold text-slate-300">{it.platform}</span>{it.scheduled_for && <span className="flex items-center gap-1 text-[11px] text-slate-400"><Clock3 size={11} />{new Date(it.scheduled_for).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}</div><p className="mt-1.5 text-[13px] text-slate-100">{it.content}</p><div className="mt-2 flex flex-wrap gap-1.5">{it.status === 'draft' && <button onClick={() => setStatus(it, 'scheduled')} className="rounded-full bg-sky-500/20 px-3 py-1.5 text-[11px] font-bold text-sky-200">Schedule</button>}{it.status !== 'published' && <button onClick={() => publishToFeed(it)} className="flex items-center gap-1 rounded-full bg-amber-400 px-3 py-1.5 text-[11px] font-black text-slate-950"><Send size={11} /> Publish to Autopolis feed</button>}<button onClick={() => remove(it)} className="ml-auto flex items-center gap-1 rounded-full bg-white/5 px-3 py-1.5 text-[11px] font-bold text-slate-400 hover:text-red-300"><Trash2 size={11} /> Delete</button></div></div>)}</div>
              )}
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500"><FileEdit size={12} /> Drafts: {items.filter(i => i.status === 'draft').length} · Scheduled (planner only): {items.filter(i => i.status === 'scheduled').length} · Published to feed: {items.filter(i => i.status === 'published').length}</p>
            </div>
          </div>

          <aside className="space-y-5">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2"><h3 className="flex items-center gap-2 text-sm font-bold text-white"><BarChart3 size={16} className="text-amber-400" /> Autopolis Social analytics</h3><Badge kind="live" /></div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-black/25 p-2.5"><p className="font-display text-xl font-bold text-white">{published.length}</p><p className="text-[9px] font-black tracking-widest text-slate-400">POSTS</p></div><div className="rounded-xl bg-black/25 p-2.5"><p className="font-display text-xl font-bold text-white">{totalLikes}</p><p className="text-[9px] font-black tracking-widest text-slate-400">LIKES</p></div><div className="rounded-xl bg-black/25 p-2.5"><p className="font-display text-xl font-bold text-white">{totalShares}</p><p className="text-[9px] font-black tracking-widest text-slate-400">SHARES</p></div></div>
              <p className="mt-3 text-[11px] font-bold text-slate-300">TOP POSTS BY LIKES (REAL)</p>
              {topPosts.length === 0 ? <p className="mt-1 text-xs text-slate-500">No posts yet.</p> : topPosts.map(p => <div key={p.id} className="mt-2"><p className="truncate text-[11px] text-slate-300">{p.author_name}: {p.content}</p><div className="mt-1 flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-pink-500 to-amber-400" style={{ width: (p.likes / maxLikes) * 100 + '%' }} /></div><span className="text-[11px] font-bold text-slate-200">❤ {p.likes} · ↗ {p.shares}</span></div></div>)}
            </div>
            <div className="rounded-3xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
              <div className="flex items-center gap-2"><h3 className="text-sm font-bold text-white">Reach & impressions</h3><Badge kind="demo" /></div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">No external provider analytics are connected, so reach/impressions cannot be measured. The chart below is <b className="text-amber-200">simulated demo data</b> shown only to illustrate layout.</p>
              <div className="mt-3 flex h-24 items-end gap-1.5">{demoReach.map((v, i) => <div key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-amber-600/40 to-amber-400/70" style={{ height: v + '%' }} title={'Demo value ' + v} />)}</div>
              <p className="mt-1 flex justify-between text-[9px] text-slate-500"><span>Mon</span><span>Sun</span></p>
              <Link to="/connected" className="mt-2 inline-block text-[11px] font-bold text-amber-300 underline">Why is this demo? → Connected Accounts</Link>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4"><h3 className="text-sm font-bold text-white">ACCOUNTS</h3><p className="mt-1.5 text-xs leading-relaxed text-slate-400">Autopolis Social — <b className="text-emerald-300">active (in-app)</b>. Facebook + Instagram (Meta) and YouTube (Google) — <b className="text-amber-300">Setup required</b> (server OAuth env vars missing); account switching activates once a real account connects. X / LinkedIn — later.</p><Link to="/connected" className="mt-2 inline-block rounded-full bg-white/5 px-3.5 py-2 text-[11px] font-bold text-white hover:bg-white/10">Manage connected accounts</Link></div>
          </aside>
        </div>
      )}
    </div>
  );
}
