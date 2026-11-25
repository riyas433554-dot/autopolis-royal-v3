import { Loader2, AlertTriangle, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

export const Spinner = ({ label = 'Loading…' }: { label?: string }) => (
  <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
    <Loader2 className="animate-spin text-amber-400" size={30} />
    <p className="text-sm">{label}</p>
  </div>
);

export const ErrorBox = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-center">
    <AlertTriangle className="mx-auto text-red-400" size={26} />
    <p className="mt-2 text-sm text-red-200">{message}</p>
    <p className="mt-1 text-xs text-red-300/70">The database may be waking up — please retry in a few seconds.</p>
    {onRetry && <button onClick={onRetry} className="mt-3 rounded-full bg-red-500/20 px-4 py-1.5 text-xs font-semibold text-red-100 hover:bg-red-500/30">Retry</button>}
  </div>
);

export const isSetupError = (message?: string) => /does not exist|relation .* does not exist|42P01|schema cache|Could not find the table|PGRST205/i.test(message || '');

export const SetupRequired = ({ what = 'This feature', onRetry }: { what?: string; onRetry?: () => void }) => (
  <div className="rounded-3xl border border-amber-500/30 bg-amber-500/[0.07] p-6 text-center">
    <p className="text-3xl">🏗️</p>
    <h3 className="font-display mt-2 text-lg font-bold text-white">Setup required</h3>
    <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-slate-300">{what} needs database tables that don&apos;t exist in this Supabase project yet. Nothing is broken — run the one-time schema file in Supabase → SQL Editor, then retry.</p>
    <div className="mt-3 flex flex-wrap justify-center gap-2">
      <a href="/schema.sql" download className="rounded-full bg-amber-400 px-4 py-2 text-xs font-black text-slate-950">⬇ Download supabase/schema.sql</a>
      <a href="/api/bootstrap" target="_blank" rel="noreferrer" className="rounded-full border border-white/20 px-4 py-2 text-xs font-bold text-white">Check /api/bootstrap</a>
      {onRetry && <button onClick={onRetry} className="rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white">Retry</button>}
    </div>
    <p className="mt-2 text-[11px] text-slate-500">Until then this page shows an honest empty state — no fake data.</p>
  </div>
);

export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] py-12 text-center text-slate-400">
    <Inbox size={26} className="text-slate-500" />
    <p className="text-sm">{children}</p>
  </div>
);

export type BadgeKind = 'live' | 'demo' | 'unavailable' | 'sim';
export const Badge = ({ kind }: { kind: BadgeKind }) => {
  const map: Record<BadgeKind, { t: string; c: string }> = {
    live: { t: '● Live / Verified', c: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
    demo: { t: '◆ Demo', c: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
    sim: { t: '◆ Simulated', c: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
    unavailable: { t: '○ Unavailable', c: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
  };
  return <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide ${map[kind].c}`}>{map[kind].t}</span>;
};

export const Avatar = ({ name, color = '#c9a227', size = 40 }: { name: string; color?: string; size?: number }) => (
  <div className="flex shrink-0 items-center justify-center rounded-full font-bold text-white" style={{ width: size, height: size, background: `linear-gradient(135deg, ${color}, ${color}88)`, fontSize: size * 0.38 }}>
    {name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()}
  </div>
);

export const StatusDot = ({ status }: { status: string }) => {
  const c: Record<string, string> = { active: 'bg-emerald-400', operational: 'bg-emerald-400', busy: 'bg-amber-400', idle: 'bg-sky-400', error: 'bg-red-400', maintenance: 'bg-orange-400', completed: 'bg-emerald-400', in_progress: 'bg-amber-400', queued: 'bg-slate-400', blocked: 'bg-red-400' };
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${(c[status] || 'bg-slate-400')} animate-pulse`} />;
};

export const PageHead = ({ title, sub, badge }: { title: string; sub?: string; badge?: BadgeKind }) => (
  <div className="mb-5">
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="font-display text-2xl font-bold tracking-wide text-white sm:text-3xl">{title}</h1>
      {badge && <Badge kind={badge} />}
    </div>
    {sub && <p className="mt-1 max-w-2xl text-sm text-slate-400">{sub}</p>}
  </div>
);
