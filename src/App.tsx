import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, Building2, Bot, LayoutDashboard, ListTodo, MessagesSquare, CalendarRange, Cpu, BarChart3, Bell, UserRound, Plug, Settings as SettingsIcon, Landmark, LayoutGrid, X, LogIn, Briefcase, Inbox, LibraryBig, Trophy, Rocket, PiggyBank, Handshake } from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { api } from './lib/api';
import { Avatar } from './components/ui';
import CityHome from './pages/CityHome';
import { BuildingsPage, BuildingDetail } from './pages/Buildings';
import AgentsPage from './pages/Agents';
import OperationsPage from './pages/Operations';
import SocialPage from './pages/Social';
import ManagePage from './pages/Manage';
import { SystemsPage, AnalyticsPage, NotificationsPage, ProfilePage, SettingsPage, LoginPage, ConnectedPage, FacilitiesPage } from './pages/Misc';
import { CompaniesPage, DispatchPage, LibraryPage, AwardsPage, PublishingPage, TreasuryPage } from './pages/Economy';
import ClientsPage from './pages/Clients';

const NAV = [
  { to: '/', label: 'City', icon: Crown },
  { to: '/buildings', label: 'Buildings', icon: Building2 },
  { to: '/facilities', label: 'Facilities', icon: Landmark },
  { to: '/agents', label: 'Agents', icon: Bot },
  { to: '/operations', label: 'Operations', icon: LayoutDashboard },
  { to: '/tasks', label: 'Tasks', icon: ListTodo },
  { to: '/companies', label: 'Companies', icon: Briefcase },
  { to: '/clients', label: 'Clients', icon: Handshake },
  { to: '/dispatch', label: 'Dispatch Inbox', icon: Inbox },
  { to: '/library', label: 'Resource Library', icon: LibraryBig },
  { to: '/awards', label: 'Awards & Ranks', icon: Trophy },
  { to: '/publishing', label: 'Publishing', icon: Rocket },
  { to: '/treasury', label: 'Treasury', icon: PiggyBank },
  { to: '/social', label: 'Social', icon: MessagesSquare },
  { to: '/manage', label: 'Social Mgmt', icon: CalendarRange },
  { to: '/systems', label: 'Systems', icon: Cpu },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/profile', label: 'Profile', icon: UserRound },
  { to: '/connected', label: 'Connected Accounts', icon: Plug },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];
const linkCls = ({ isActive }: { isActive: boolean }) => `flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold transition ${isActive ? 'bg-amber-400 text-slate-950' : 'text-slate-200 hover:bg-white/10'}`;

function Shell() {
  const { user } = useAuth();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  useEffect(() => { setMoreOpen(false); (async () => { try { const n = await api('/api/notifications'); setUnread(n.filter((x: any) => !x.is_read).length); } catch { /* silent */ } })(); }, [location.pathname]);
  useEffect(() => { if (location.pathname !== '/') window.scrollTo(0, 0); }, [location.pathname]);
  const bottomMain = ['/', '/buildings', '/social', '/agents'].map(p => NAV.find(n => n.to === p)!).filter(Boolean);
  return (
    <div className="min-h-dvh bg-[#080714] text-slate-100">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0918]/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center gap-2 px-3 py-2.5 sm:px-4">
          <Link to="/" className="flex shrink-0 items-center gap-2" aria-label="Autopolis Royal home">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-yellow-600 text-lg shadow-lg shadow-amber-500/30">👑</span>
            <span className="leading-none"><span className="font-display block whitespace-nowrap text-[13px] font-bold tracking-wide text-white sm:text-[15px]">AUTOPOLIS <span className="text-amber-400">ROYAL</span></span><span className="hidden text-[9px] font-bold tracking-[0.28em] text-slate-400 sm:block">LIVING AI CITY · 37 BUILDINGS</span></span>
          </Link>
          <nav className="ml-3 hidden flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] lg:flex [&::-webkit-scrollbar]:hidden" aria-label="Main">
            {NAV.map(n => <NavLink key={n.to} to={n.to} end={n.to === '/'} className={linkCls}><n.icon size={13} />{n.label}{n.to === '/notifications' && unread > 0 && <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-black text-white">{unread}</span>}</NavLink>)}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Link to="/notifications" className="relative rounded-full bg-white/5 p-2.5 text-slate-200 lg:hidden" aria-label="Notifications"><Bell size={17} />{unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-black text-white">{unread}</span>}</Link>
            {user ? <Link to="/profile" className="flex items-center gap-2 rounded-full bg-white/5 py-1 pl-1 pr-3 hover:bg-white/10"><Avatar name={user.email || 'Citizen'} color="#c9a227" size={28} /><span className="hidden max-w-[110px] truncate text-xs font-bold text-white sm:block">{user.email?.split('@')[0]}</span></Link> : <Link to="/login" className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 px-3 py-2 text-xs font-black text-slate-950"><LogIn size={13} /> Sign in</Link>}
          </div>
        </div>
      </header>

      <main className={location.pathname === '/' ? '' : 'pb-[84px] lg:pb-10'}>
        <Routes>
          <Route path="/" element={<CityHome />} />
          <Route path="/buildings" element={<BuildingsPage />} />
          <Route path="/building/:slug" element={<BuildingDetail />} />
          <Route path="/facilities" element={<FacilitiesPage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/operations" element={<OperationsPage />} />
          <Route path="/tasks" element={<OperationsPage initialTab="tasks" />} />
          <Route path="/companies" element={<CompaniesPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/dispatch" element={<DispatchPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/awards" element={<AwardsPage />} />
          <Route path="/publishing" element={<PublishingPage />} />
          <Route path="/treasury" element={<TreasuryPage />} />
          <Route path="/social" element={<SocialPage />} />
          <Route path="/manage" element={<ManagePage />} />
          <Route path="/systems" element={<SystemsPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/connected" element={<ConnectedPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<div className="mx-auto max-w-xl px-4 py-16 text-center"><p className="text-5xl">🏙️</p><h1 className="font-display mt-3 text-2xl font-bold text-white">This street doesn&apos;t exist (yet)</h1><p className="mt-1 text-sm text-slate-400">The address you requested is not part of Autopolis Royal.</p><Link to="/" className="mt-4 inline-block rounded-full bg-amber-400 px-5 py-2.5 text-sm font-black text-slate-950">Return to the City</Link></div>} />
        </Routes>
        {location.pathname !== '/' && <footer className="mx-auto max-w-7xl px-4 pb-4 pt-8 text-center text-[11px] leading-relaxed text-slate-600">👑 Autopolis Royal — a living 3D AI city. Database-backed features are live via Supabase; animated citizens, agent execution, external social publishing & reach analytics are labelled Demo / Simulated / Not Connected. Built Android-first.</footer>}
      </main>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#0a0918]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden" aria-label="Mobile">
        <div className="grid grid-cols-5">
          {bottomMain.map(n => <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[10px] font-bold ${isActive ? 'text-amber-300' : 'text-slate-400'}`}><n.icon size={19} />{n.label}</NavLink>)}
          <button onClick={() => setMoreOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-bold text-slate-400"><LayoutGrid size={19} />More</button>
        </div>
      </nav>

      <AnimatePresence>
        {moreOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] flex items-end bg-black/70 backdrop-blur-sm lg:hidden" onClick={() => setMoreOpen(false)}>
            <motion.div initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }} onClick={e => e.stopPropagation()} className="max-h-[78dvh] w-full overflow-y-auto rounded-t-3xl border-t border-amber-500/30 bg-[#100e20] p-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
              <div className="mb-3 flex items-center justify-between"><p className="font-display text-lg font-bold text-white">Explore Autopolis Royal</p><button onClick={() => setMoreOpen(false)} className="rounded-full bg-white/5 p-2 text-slate-300" aria-label="Close menu"><X size={17} /></button></div>
              <div className="grid grid-cols-3 gap-2">{NAV.map(n => <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-center text-[11px] font-bold ${isActive ? 'border-amber-400 bg-amber-400/15 text-amber-200' : 'border-white/10 bg-white/[0.03] text-slate-100'}`}><n.icon size={20} className="text-amber-400" />{n.label}{n.to === '/notifications' && unread > 0 && <span className="rounded-full bg-red-500 px-1.5 text-[9px] font-black text-white">{unread} new</span>}</NavLink>)}{!user && <Link to="/login" className="flex flex-col items-center gap-1.5 rounded-2xl border border-amber-400 bg-amber-400 p-3 text-center text-[11px] font-black text-slate-950"><LogIn size={20} />Sign in</Link>}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (<AuthProvider><BrowserRouter><Shell /></BrowserRouter></AuthProvider>);
}
