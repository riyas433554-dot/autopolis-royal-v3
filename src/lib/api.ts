export async function api<T = any>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new Error('City API unavailable (unexpected response). The database may be waking up — please retry.');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || 'Request failed with status ' + res.status);
  return data as T;
}

export interface Building { id: number; slug: string; name: string; purpose: string; district: string; description: string; status: string; departments: string; system_name: string; version: string; floors: number; }
export interface Agent { id: number; name: string; code: string; role: string; department: string; building_slug: string; status: string; current_task: string; avatar_color: string; }
export interface Task { id: number; title: string; description?: string | null; building_slug: string; agent_name: string; status: string; progress: number; priority: string; created_at?: string; result?: string | null; error?: string | null; started_at?: string | null; completed_at?: string | null; attempts?: number; }
export interface ActivityItem { id: number; type: string; title: string; building_slug: string; detail: string; created_at?: string; }
export interface Post { id: number; author_name: string; author_handle: string; content: string; image_url: string; likes: number; shares: number; hashtags: string; is_draft: boolean; created_at?: string; }
export interface CommentItem { id: number; post_id: number; author_name: string; content: string; parent_id: number | null; created_at?: string; }
export interface Profile { id: number; name: string; handle: string; bio: string; avatar_color: string; followers: number; following: number; building_slug: string; }
export interface Conversation { id: number; participant_name: string; participant_handle: string; last_message: string; unread: number; avatar_color: string; }
export interface MessageItem { id: number; conversation_id: number; sender_name: string; content: string; is_read: boolean; created_at?: string; }
export interface NotifItem { id: number; type: string; title: string; detail: string; is_read: boolean; created_at?: string; }
export interface ScheduledPost { id: number; content: string; platform: string; scheduled_for: string; status: string; }

export const timeAgo = (iso?: string) => {
  if (!iso) return 'just now';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
};
