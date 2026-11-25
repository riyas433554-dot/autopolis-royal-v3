import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { DoorOpen, Users, Sparkles, Layers } from 'lucide-react';
import type { Building, Agent } from '../lib/api';
import { EXTRA_ROOMS } from '../lib/cityConfig';
import { Avatar, Badge, StatusDot } from './ui';

const ROOM_ICONS = ['🏛️', '🖥️', '🧪', '🎙️', '📚', '🌿', '🛋️', '🔭', '🎭', '💼', '☕', '🗄️'];
const ROOM_ACTIVITIES = ['Team stand-up in progress', 'Focused deep-work session', 'Client demo running', 'Equipment calibration', 'Collaborative review', 'Quiet study & research', 'Live production underway', 'Planning session', 'Maintenance check', 'Open for visitors'];

export default function InteriorView({ building, agents, onSelectAgent }: { building: Building; agents: Agent[]; onSelectAgent: (a: Agent) => void }) {
  const floors = Math.min(Math.max(building.floors || 2, 1), 4);
  const [floor, setFloor] = useState(0);
  const allRooms = useMemo(() => {
    const deps = (building.departments || '').split(',').map(s => s.trim()).filter(Boolean).map(d => d + ' Office');
    const extra = EXTRA_ROOMS[building.slug] || [];
    const base = ['Reception & Grand Lobby', ...extra, ...deps, 'Meeting & Briefing Room', 'Citizen Lounge & Café', 'Services & Facilities Core'];
    return [...new Set(base)];
  }, [building]);
  const roomsThisFloor = allRooms.filter((_, i) => floor === 0 ? i < 6 : (i % floors) === floor || i >= 6 && (i % floors) === floor);
  const rooms = floor === 0 ? allRooms.slice(0, 6) : (roomsThisFloor.length ? roomsThisFloor : allRooms.slice(6, 10));
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const roomAgents = (room: string) => agents.filter((_, i) => (i % Math.max(rooms.length, 1)) === rooms.indexOf(room));
  const active = activeRoom && rooms.includes(activeRoom) ? activeRoom : rooms[0];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Layers size={16} className="text-amber-400" />
        <span className="text-sm font-semibold text-white">Floor navigation</span>
        <Badge kind="sim" />
        <span className="text-xs text-slate-400">Interactive floor-plan interior — rooms & people are simulated; agents below are real database records.</span>
      </div>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {Array.from({ length: floors }).map((_, i) => (
          <button key={i} onClick={() => { setFloor(i); setActiveRoom(null); }} className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${floor === i ? 'bg-amber-400 text-slate-950' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}>
            {i === 0 ? 'Ground — Lobby Level' : `Level ${i + 1}`}
          </button>
        ))}
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-amber-500/20 bg-gradient-to-br from-[#141126] via-[#0d0b1d] to-[#080714] p-3 sm:p-5">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'linear-gradient(#c9a227 1px, transparent 1px), linear-gradient(90deg, #c9a227 1px, transparent 1px)', backgroundSize: '34px 34px' }} />
        <div className="relative mb-3 flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-xs font-bold tracking-widest text-amber-300"><DoorOpen size={14} /> MAIN ENTRANCE ↓ — {building.name.toUpperCase()} · {floor === 0 ? 'GROUND FLOOR' : 'LEVEL ' + (floor + 1)}</p>
          <p className="hidden items-center gap-1 text-xs text-slate-400 sm:flex"><Users size={13} /> {agents.length} agents assigned</p>
        </div>
        <div className="relative grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
          {rooms.map((room, i) => {
            const inRoom = roomAgents(room);
            const isActive = active === room;
            return (
              <motion.button key={room} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} onClick={() => setActiveRoom(room)}
                className={`group relative min-h-[104px] rounded-2xl border p-3 text-left transition ${isActive ? 'border-amber-400 bg-amber-400/10 shadow-[0_0_24px_rgba(201,162,39,0.25)]' : 'border-white/10 bg-white/[0.04] hover:border-amber-400/50 hover:bg-white/[0.07]'}`}>
                <span className="text-xl">{ROOM_ICONS[i % ROOM_ICONS.length]}</span>
                <p className="mt-1 text-[13px] font-bold leading-tight text-white">{room}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{ROOM_ACTIVITIES[(i + floor * 3) % ROOM_ACTIVITIES.length]}</p>
                <div className="mt-2 flex -space-x-1.5">
                  {inRoom.slice(0, 4).map(a => <span key={a.id} className="ring-2 ring-[#12101f] rounded-full"><Avatar name={a.name} color={a.avatar_color} size={20} /></span>)}
                  {inRoom.length === 0 && <span className="text-[10px] text-slate-500">No agents here now</span>}
                </div>
                <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400/20 text-[10px] font-black text-amber-300">{i + 1}</span>
              </motion.button>
            );
          })}
        </div>
        <div className="relative mt-3 flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 py-2 text-[11px] tracking-widest text-slate-500">← CORRIDOR · LIFTS · STAIRS →</div>
      </div>

      {active && (
        <motion.div key={active + floor} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles size={16} className="text-amber-400" />
            <h3 className="font-display text-lg font-bold text-white">{active}</h3>
            <Badge kind="sim" />
          </div>
          <p className="mt-1 text-sm text-slate-400">Part of {building.name} ({building.district}). {building.description}</p>
          <p className="mt-2 text-xs font-bold tracking-wide text-slate-300">AGENTS IN THIS ROOM <span className="text-slate-500">(tap to open profile)</span></p>
          {roomAgents(active).length === 0 ? <p className="mt-1 text-sm text-slate-500">No database agents are currently placed in this room. Simulated citizens pass through during the day.</p> : (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {roomAgents(active).map(a => (
                <button key={a.id} onClick={() => onSelectAgent(a)} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-left hover:border-amber-400/50">
                  <Avatar name={a.name} color={a.avatar_color} size={36} />
                  <span className="min-w-0"><span className="flex items-center gap-1.5 text-sm font-semibold text-white"><StatusDot status={a.status} />{a.name}</span><span className="block truncate text-xs text-slate-400">{a.role} · {a.current_task}</span></span>
                </button>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
