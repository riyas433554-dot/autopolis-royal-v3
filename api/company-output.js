export const DELIVERABLE_TYPES = Object.freeze([
  'app', 'website', 'automation', 'game', 'ad', 'video', 'reel',
  'anime', 'movie', 'proposal', 'report', 'design', 'code', 'other',
]);

const TYPE_PATTERNS = [
  ['anime', /\b(anime|manga|animation series)\b/i],
  ['movie', /\b(movie|film|feature film|screenplay)\b/i],
  ['reel', /\b(reel|short-form|short video|shorts)\b/i],
  ['game', /\b(game|godot|unity|unreal|gameplay)\b/i],
  ['automation', /\b(automation|workflow|bot|integrat(e|ion))\b/i],
  ['website', /\b(website|web site|landing page|web app|web application)\b/i],
  ['app', /\b(mobile app|android app|ios app|application)\b/i],
  ['ad', /\b(ad|advertisement|campaign|marketing creative)\b/i],
  ['video', /\b(video|youtube|production|storyboard)\b/i],
  ['proposal', /\b(proposal|quote|pitch|sales offer)\b/i],
  ['design', /\b(design|brand|logo|visual identity|ui|ux)\b/i],
  ['code', /\b(code|implementation|source code|repository)\b/i],
];

export function inferDeliverableType(task = {}) {
  const explicit = String(task.deliverable_type || '').trim().toLowerCase();
  if (DELIVERABLE_TYPES.includes(explicit)) return explicit;
  const text = String(task.title || '') + '\n' + String(task.description || '');
  for (const [type, pattern] of TYPE_PATTERNS) {
    if (pattern.test(text)) return type;
  }
  return 'report';
}

export function buildCompanyOutput({ task, agent, profile, result }) {
  if (profile?.lifecycle_status !== 'company') return null;
  if (!Number.isInteger(profile.company_id) || profile.company_id <= 0) {
    throw new Error('Company profile is missing a valid company_id');
  }
  const content = typeof result === 'string' ? result.trim() : '';
  if (!content) throw new Error('Company output must contain non-empty content');
  const title = String(task?.title || '').trim();
  if (!title) throw new Error('Company output requires a task title');
  return {
    title,
    type: inferDeliverableType(task),
    deliverable_type: inferDeliverableType(task),
    company_id: profile.company_id,
    agent_name: String(agent?.name || 'Company Agent'),
    building_slug: String(task?.building_slug || agent?.building_slug || 'operations-tower'),
    status: 'draft',
    content,
    task_id: task.id,
    source_agent_id: agent?.id ?? null,
    tokens_used: 0,
    earning_coins: 0,
    approved_at: null,
  };
}
