export function buildPublishJobs(task, videoUrl, targets, youtubeAccounts = [], metaAccounts = []) {
  const selected = [...new Set(Array.isArray(targets) && targets.length ? targets : ['youtube','facebook'])];
  const rows = [];
  const add = (provider, accountId, format) => rows.push({
    task_id: task.id, provider, account_id: String(accountId), video_url: videoUrl,
    title: String(task.title || 'Autopolis video').slice(0, 100),
    description: String(task.description || '').slice(0, 5000),
    privacy_status: 'public', status: 'queued', next_attempt_at: new Date().toISOString(),
    platform_payload: {
      format,
      content_mode: task.content_mode || 'auto',
      content_category: task.content_category || 'general',
      caption: [task.title, task.description].filter(Boolean).join('\n\n').slice(0, 2200),
    },
  });
  if (selected.includes('youtube') || selected.includes('youtube_shorts')) {
    const format = selected.includes('youtube') ? 'youtube_video' : 'youtube_short';
    for (const account of youtubeAccounts) if (account?.account_id) add('youtube', account.account_id, format);
  }
  if (selected.includes('facebook')) {
    for (const account of metaAccounts) {
      if (account?.account_id && !String(account.account_id).startsWith('ig:')) add('facebook', account.account_id, 'facebook_video');
    }
  }
  if (selected.includes('facebook_reels')) {
    for (const account of metaAccounts) {
      if (account?.account_id && !String(account.account_id).startsWith('ig:')) add('facebook_reels', account.account_id, 'facebook_reel');
    }
  }
  if (selected.includes('instagram_reels')) {
    for (const account of metaAccounts) {
      if (account?.account_id && String(account.account_id).startsWith('ig:')) add('instagram', account.account_id, 'instagram_reel');
    }
  }
  return rows;
}
