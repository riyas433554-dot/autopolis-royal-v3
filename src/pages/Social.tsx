import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Heart, MessageCircle, Share2, Bookmark, Send, ImagePlus, Search, Home, Compass, MessagesSquare, Users, BookmarkCheck, LayoutGrid, Trash2, FileEdit, X, CheckCheck } from 'lucide-react';
import { api, timeAgo, type Post, type CommentItem, type Profile, type Conversation, type MessageItem } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Spinner, ErrorBox, Empty, Avatar, Badge } from '../components/ui';

const COLORS = ['#c9a227', '#ec4899', '#22d3ee', '#a855f7', '#22c55e', '#f97316', '#3b82f6'];
const colorFor = (name: string) => COLORS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORS.length];
const renderRich = (text: string) => text.split(/(#[\w]+|@[\w.]+)/g).map((part, i) => part.startsWith('#') || part.startsWith('@') ? <span key={i} className="font-semibold text-amber-300">{part}</span> : <span key={i}>{part}</span>);

export default function SocialPage() {
  const { user } = useAuth();
  const myName = user ? (user.user_metadata?.full_name || user.email?.split('@')[0] || 'Citizen') : 'Guest Citizen';
  const myHandle = user ? '@' + (user.email?.split('@')[0] || 'citizen') : '@guest';
  const myEmail = user?.email || 'guest';
  const [tab, setTab] = useState('feed');
  const [posts, setPosts] = useState<Post[]>([]); const [profiles, setProfiles] = useState<Profile[]>([]);
  const [convs, setConvs] = useState<Conversation[]>([]); const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [loading, setLoading] = useState(true); const [err, setErr] = useState('');
  const [draft, setDraft] = useState(''); const [imgUrl, setImgUrl] = useState(''); const [posting, setPosting] = useState(false); const [note, setNote] = useState('');
  const [liked, setLiked] = useState<number[]>(() => JSON.parse(localStorage.getItem('ar-liked') || '[]'));
  const [followed, setFollowed] = useState<number[]>(() => JSON.parse(localStorage.getItem('ar-followed') || '[]'));
  const [openComments, setOpenComments] = useState<number | null>(null);
  const [comments, setComments] = useState<CommentItem[]>([]); const [commentText, setCommentText] = useState(''); const [replyTo, setReplyTo] = useState<CommentItem | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [activeConv, setActiveConv] = useState<Conversation | null>(null); const [msgs, setMsgs] = useState<MessageItem[]>([]); const [msgText, setMsgText] = useState(''); const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null); const chatEndRef = useRef<HTMLDivElement>(null);

  const load = async () => { setLoading(true); setErr(''); try { const [p, pr, cv, bm] = await Promise.all([api('/api/posts'), api('/api/profiles'), api('/api/messages'), api('/api/bookmarks?user_email=' + encodeURIComponent(myEmail))]); setPosts(p); setProfiles(pr); setConvs(cv); setBookmarks(bm.map((b: any) => b.post_id)); } catch (e: any) { setErr(e.message); } finally { setLoading(false); } };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [myEmail]);
  useEffect(() => { localStorage.setItem('ar-liked', JSON.stringify(liked)); }, [liked]);
  useEffect(() => { localStorage.setItem('ar-followed', JSON.stringify(followed)); }, [followed]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const published = posts.filter(p => !p.is_draft);
  const myDrafts = posts.filter(p => p.is_draft && p.author_handle === myHandle);
  const hashtags = useMemo(() => { const m = new Map<string, number>(); published.forEach(p => (p.content.match(/#[\w]+/g) || []).forEach(h => m.set(h.toLowerCase(), (m.get(h.toLowerCase()) || 0) + 1))); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8); }, [posts]);

  const publish = async (asDraft: boolean) => {
    if (!draft.trim()) { setNote('Write something first.'); return; }
    setPosting(true); setNote('');
    try { await api('/api/posts', { method: 'POST', body: JSON.stringify({ author_name: myName, author_handle: myHandle, content: draft, image_url: imgUrl, hashtags: (draft.match(/#[\w]+/g) || []).join(' '), is_draft: asDraft }) }); setDraft(''); setImgUrl(''); setNote(asDraft ? 'Draft saved to the database. Find it under “My drafts” below.' : 'Published to Autopolis Social (in-app feed, saved in Supabase).'); load(); if (!asDraft) setTab('feed'); }
    catch (e: any) { setNote('Could not publish: ' + e.message); } finally { setPosting(false); }
  };
  const onFile = (f: File) => { if (f.size > 900_000) { setNote('Image too large for in-app demo storage (max ~900KB). Use an image URL instead.'); return; } const r = new FileReader(); r.onload = () => setImgUrl(r.result as string); r.readAsDataURL(f); };
  const toggleLike = async (p: Post) => { const has = liked.includes(p.id); setLiked(has ? liked.filter(id => id !== p.id) : [...liked, p.id]); try { await api('/api/posts', { method: 'PUT', body: JSON.stringify({ id: p.id, action: has ? 'unlike' : 'like' }) }); load(); } catch { /* keep optimistic */ } };
  const share = async (p: Post) => { try { await api('/api/posts', { method: 'PUT', body: JSON.stringify({ id: p.id, action: 'share' }) }); setNote('Reposted — share count updated in the database. (In-app only; not sent to any external platform.)'); load(); } catch (e: any) { setNote('Share failed: ' + e.message); } };
  const toggleBookmark = async (p: Post) => { try { const r = await api('/api/bookmarks', { method: 'POST', body: JSON.stringify({ post_id: p.id, user_email: myEmail }) }); setBookmarks(r.saved ? [...bookmarks, p.id] : bookmarks.filter(id => id !== p.id)); } catch (e: any) { setNote('Bookmark failed: ' + e.message); } };
  const deletePost = async (p: Post) => { try { await api('/api/posts', { method: 'DELETE', body: JSON.stringify({ id: p.id }) }); load(); } catch (e: any) { setNote('Delete failed: ' + e.message); } };
  const publishDraft = async (p: Post) => { try { await api('/api/posts', { method: 'PUT', body: JSON.stringify({ id: p.id, is_draft: false }) }); setNote('Draft published.'); load(); setTab('feed'); } catch (e: any) { setNote(e.message); } };
  const loadComments = async (postId: number) => { if (openComments === postId) { setOpenComments(null); return; } setOpenComments(postId); setReplyTo(null); try { setComments(await api('/api/comments?post_id=' + postId)); } catch { setComments([]); } };
  const addComment = async (postId: number) => { if (!commentText.trim()) return; try { await api('/api/comments', { method: 'POST', body: JSON.stringify({ post_id: postId, author_name: myName, content: commentText, parent_id: replyTo?.id || null }) }); setCommentText(''); setReplyTo(null); setComments(await api('/api/comments?post_id=' + postId)); } catch (e: any) { setNote('Comment failed: ' + e.message); } };
  const toggleFollow = async (pr: Profile) => { const has = followed.includes(pr.id); setFollowed(has ? followed.filter(id => id !== pr.id) : [...followed, pr.id]); try { await api('/api/profiles', { method: 'PUT', body: JSON.stringify({ id: pr.id, action: has ? 'unfollow' : 'follow' }) }); load(); } catch { /* optimistic */ } };
  const openConv = async (c: Conversation) => { setActiveConv(c); try { setMsgs(await api('/api/messages?conversation_id=' + c.id)); await api('/api/messages', { method: 'PUT', body: JSON.stringify({ conversation_id: c.id }) }); const cv = await api('/api/messages'); setConvs(cv); } catch { /* noop */ } };
  const sendMsg = async () => { if (!activeConv || !msgText.trim()) return; setSending(true); const text = msgText; setMsgText(''); try { await api('/api/messages', { method: 'POST', body: JSON.stringify({ conversation_id: activeConv.id, sender_name: 'You', content: text }) }); setMsgs(await api('/api/messages?conversation_id=' + activeConv.id)); setTimeout(async () => { try { await api('/api/messages', { method: 'POST', body: JSON.stringify({ conversation_id: activeConv.id, sender_name: activeConv.participant_name, content: 'Thanks for your message! (Simulated auto-reply — this citizen is a demo character, not a real person.)' }) }); setMsgs(await api('/api/messages?conversation_id=' + activeConv.id)); } catch { /* noop */ } }, 1100); } catch (e: any) { setNote('Message failed: ' + e.message); } finally { setSending(false); } };

  const tabs = [{ id: 'feed', label: 'Home Feed', icon: Home }, { id: 'explore', label: 'Explore', icon: Compass }, { id: 'search', label: 'Search', icon: Search }, { id: 'messages', label: `Messages${convs.reduce((s, c) => s + (c.unread || 0), 0) ? ' (' + convs.reduce((s, c) => s + (c.unread || 0), 0) + ')' : ''}`, icon: MessagesSquare }, { id: 'people', label: 'Connections', icon: Users }, { id: 'saved', label: 'Saved', icon: BookmarkCheck }, { id: 'media', label: 'Media Library', icon: LayoutGrid }];

  const PostCard = ({ p }: { p: Post }) => (
    <motion.article initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-3"><Avatar name={p.author_name} color={colorFor(p.author_name)} size={42} /><div className="min-w-0"><p className="truncate text-sm font-bold text-white">{p.author_name} {p.author_handle === myHandle && <span className="text-[10px] font-semibold text-amber-300">· you</span>}</p><p className="text-[11px] text-slate-400">{p.author_handle} · {timeAgo(p.created_at)}</p></div>
        {p.author_handle === myHandle && <button onClick={() => deletePost(p)} className="ml-auto rounded-full bg-white/5 p-2 text-slate-400 hover:text-red-300" aria-label="Delete post"><Trash2 size={14} /></button>}</div>
      <p className="mt-2.5 whitespace-pre-wrap text-[14px] leading-relaxed text-slate-100">{renderRich(p.content)}</p>
      {p.image_url && <img src={p.image_url} alt="Post media" className="mt-3 max-h-80 w-full rounded-2xl object-cover" loading="lazy" />}
      <div className="mt-3 flex items-center gap-1 border-t border-white/5 pt-2.5">
        <button onClick={() => toggleLike(p)} className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold ${liked.includes(p.id) ? 'bg-pink-500/20 text-pink-300' : 'text-slate-300 hover:bg-white/5'}`}><Heart size={15} fill={liked.includes(p.id) ? 'currentColor' : 'none'} />{p.likes}</button>
        <button onClick={() => loadComments(p.id)} className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/5"><MessageCircle size={15} />Comments</button>
        <button onClick={() => share(p)} className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/5"><Share2 size={15} />{p.shares}</button>
        <button onClick={() => toggleBookmark(p)} className={`ml-auto flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold ${bookmarks.includes(p.id) ? 'bg-amber-500/20 text-amber-300' : 'text-slate-300 hover:bg-white/5'}`}><Bookmark size={15} fill={bookmarks.includes(p.id) ? 'currentColor' : 'none'} />{bookmarks.includes(p.id) ? 'Saved' : 'Save'}</button>
      </div>
      {openComments === p.id && (
        <div className="mt-2 rounded-2xl bg-black/25 p-3">
          {comments.length === 0 && <p className="text-xs text-slate-500">No comments yet — be the first.</p>}
          <div className="space-y-2.5">{comments.map(c => (
            <div key={c.id} className={c.parent_id ? 'ml-6 border-l-2 border-amber-500/30 pl-3' : ''}>
              <p className="text-[13px] text-slate-200"><b className="text-white">{c.author_name}</b> <span className="text-[10px] text-slate-500">{timeAgo(c.created_at)}</span>{c.parent_id && <span className="text-[10px] text-amber-300"> · reply</span>}</p>
              <p className="text-[13px] text-slate-300">{renderRich(c.content)}</p>
              {!c.parent_id && <button onClick={() => setReplyTo(c)} className="text-[11px] font-bold text-amber-300">Reply</button>}
            </div>))}</div>
          {replyTo && <p className="mt-2 flex items-center gap-2 text-[11px] text-amber-200">Replying to {replyTo.author_name} <button onClick={() => setReplyTo(null)} aria-label="Cancel reply"><X size={12} /></button></p>}
          <div className="mt-2.5 flex gap-2"><input value={commentText} onChange={e => setCommentText(e.target.value)} onKeyDown={e => e.key === 'Enter' && addComment(p.id)} placeholder="Write a comment…" className="flex-1 rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none" /><button onClick={() => addComment(p.id)} className="rounded-full bg-amber-400 px-3.5 text-slate-950" aria-label="Send comment"><Send size={15} /></button></div>
        </div>
      )}
    </motion.article>
  );

  const searchPosts = published.filter(p => (p.content + p.author_name + p.author_handle).toLowerCase().includes(searchQ.toLowerCase()));
  const searchPeople = profiles.filter(p => (p.name + p.handle + p.bio).toLowerCase().includes(searchQ.toLowerCase()));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-1 flex flex-wrap items-center gap-3"><h1 className="font-display text-2xl font-bold text-white sm:text-3xl">Autopolis Social</h1><Badge kind="live" /></div>
      <p className="mb-4 max-w-2xl text-sm text-slate-400">The city&apos;s own social network, run from the Publishing Center (Social Nexus building). Posts, comments, messages and bookmarks are saved in Supabase.{!user && <> You are browsing as <b className="text-amber-200">Guest Citizen (Demo identity)</b> — <Link to="/login" className="text-amber-300 underline">sign in</Link> for your own account.</>}</p>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-bold ${tab === t.id ? 'bg-amber-400 text-slate-950' : 'bg-white/5 text-slate-200 hover:bg-white/10'}`}><t.icon size={14} />{t.label}</button>)}</div>
      {note && <p className="mb-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-100">{note}</p>}
      {loading ? <Spinner label="Loading Autopolis Social…" /> : err ? <ErrorBox message={err} onRetry={load} /> : (
        <>
          {(tab === 'feed') && (
            <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
              <div className="space-y-4">
                <div className="rounded-3xl border border-amber-500/20 bg-white/[0.03] p-4">
                  <div className="flex gap-3"><Avatar name={myName} color={colorFor(myName)} size={42} /><textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3} placeholder={`Share city news, ${myName.split(' ')[0]}… use #hashtags and @mentions`} className="flex-1 resize-none rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none" /></div>
                  <input value={imgUrl.startsWith('data:') ? '' : imgUrl} onChange={e => setImgUrl(e.target.value)} placeholder="Image / video URL (optional) — or attach a photo →" className="mt-2.5 w-full rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-xs text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none" />
                  {imgUrl && <div className="relative mt-2.5"><img src={imgUrl} alt="Attachment preview" className="max-h-52 w-full rounded-2xl object-cover" /><button onClick={() => setImgUrl('')} className="absolute right-2 top-2 rounded-full bg-black/70 p-1.5 text-white" aria-label="Remove image"><X size={14} /></button></div>}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
                    <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded-full bg-white/5 px-3.5 py-2.5 text-xs font-bold text-slate-200 hover:bg-white/10"><ImagePlus size={14} className="text-amber-400" /> Photo</button>
                    <span className="text-[11px] text-slate-500">{draft.length}/500</span>
                    <button disabled={posting} onClick={() => publish(true)} className="ml-auto flex items-center gap-1.5 rounded-full border border-white/20 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"><FileEdit size={13} /> Save draft</button>
                    <button disabled={posting || draft.length > 500} onClick={() => publish(false)} className="rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 px-5 py-2.5 text-xs font-black text-slate-950 disabled:opacity-50">{posting ? 'PUBLISHING…' : 'PUBLISH'}</button>
                  </div>
                </div>
                {myDrafts.length > 0 && <div className="rounded-3xl border border-dashed border-amber-500/30 bg-amber-500/5 p-4"><p className="text-xs font-black tracking-widest text-amber-300">MY DRAFTS ({myDrafts.length})</p>{myDrafts.map(d => <div key={d.id} className="mt-2 flex items-start gap-2 rounded-xl bg-black/25 p-3"><p className="flex-1 text-[13px] text-slate-200">{d.content}</p><button onClick={() => { setDraft(d.content); setImgUrl(d.image_url || ''); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white">Edit</button><button onClick={() => publishDraft(d)} className="shrink-0 rounded-full bg-amber-400 px-3 py-1.5 text-[11px] font-black text-slate-950">Publish</button><button onClick={() => deletePost(d)} className="shrink-0 rounded-full bg-white/5 p-1.5 text-slate-400" aria-label="Delete draft"><Trash2 size={13} /></button></div>)}</div>}
                {published.length === 0 ? <Empty>The feed is empty — publish the first post.</Empty> : published.map(p => <PostCard key={p.id} p={p} />)}
              </div>
              <aside className="space-y-4">
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs font-black tracking-widest text-slate-300">TRENDING IN THE CITY</p>{hashtags.length === 0 ? <p className="mt-2 text-xs text-slate-500">No hashtags yet.</p> : hashtags.map(([h, n]) => <button key={h} onClick={() => { setSearchQ(h); setTab('search'); }} className="mt-2 flex w-full items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-left text-sm font-semibold text-amber-200 hover:bg-white/[0.06]">{h}<span className="text-[11px] text-slate-400">{n} post{n > 1 ? 's' : ''}</span></button>)}</div>
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs font-black tracking-widest text-slate-300">CITIZENS TO CONNECT</p>{profiles.slice(0, 4).map(pr => <div key={pr.id} className="mt-2.5 flex items-center gap-2.5"><Avatar name={pr.name} color={pr.avatar_color} size={36} /><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-bold text-white">{pr.name}</p><p className="text-[11px] text-slate-400">{pr.handle}</p></div><button onClick={() => toggleFollow(pr)} className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold ${followed.includes(pr.id) ? 'bg-white/10 text-slate-200' : 'bg-amber-400 text-slate-950'}`}>{followed.includes(pr.id) ? 'Following' : 'Connect'}</button></div>)}</div>
              </aside>
            </div>
          )}
          {tab === 'explore' && (
            <div><p className="mb-3 text-sm text-slate-400">Most-loved posts across Autopolis, ranked by real like counts.</p><div className="grid gap-4 md:grid-cols-2">{[...published].sort((a, b) => b.likes - a.likes).map(p => <PostCard key={p.id} p={p} />)}</div>{published.length === 0 && <Empty>Nothing to explore yet.</Empty>}</div>
          )}
          {tab === 'search' && (
            <div><label className="relative block"><Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" /><input autoFocus value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search people, posts, #hashtags…" className="w-full rounded-full border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none" /></label>
              {searchQ && <><p className="mb-2 mt-4 text-xs font-black tracking-widest text-slate-300">PEOPLE ({searchPeople.length})</p>{searchPeople.length === 0 ? <p className="text-sm text-slate-500">No citizens match.</p> : <div className="grid gap-2.5 sm:grid-cols-2">{searchPeople.map(pr => <div key={pr.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3"><Avatar name={pr.name} color={pr.avatar_color} size={40} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-white">{pr.name}</p><p className="truncate text-[11px] text-slate-400">{pr.handle} · {pr.followers} followers</p></div><button onClick={() => toggleFollow(pr)} className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${followed.includes(pr.id) ? 'bg-white/10 text-slate-200' : 'bg-amber-400 text-slate-950'}`}>{followed.includes(pr.id) ? 'Following' : 'Connect'}</button></div>)}</div>}
              <p className="mb-2 mt-5 text-xs font-black tracking-widest text-slate-300">POSTS ({searchPosts.length})</p>{searchPosts.length === 0 ? <p className="text-sm text-slate-500">No posts match.</p> : <div className="space-y-4">{searchPosts.map(p => <PostCard key={p.id} p={p} />)}</div>}</>}</div>
          )}
          {tab === 'messages' && (
            <div className="grid gap-4 md:grid-cols-[300px_1fr]">
              <div className={`space-y-2 ${activeConv ? 'hidden md:block' : ''}`}>{convs.map(c => <button key={c.id} onClick={() => openConv(c)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left ${activeConv?.id === c.id ? 'border-amber-400 bg-amber-400/10' : 'border-white/10 bg-white/[0.03] hover:border-amber-400/40'}`}><Avatar name={c.participant_name} color={c.avatar_color} size={42} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-white">{c.participant_name}</span><span className="block truncate text-[11px] text-slate-400">{c.last_message}</span></span>{c.unread > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-black text-slate-950">{c.unread}</span>}</button>)}{convs.length === 0 && <Empty>No conversations yet.</Empty>}<p className="flex items-center gap-1.5 pt-1 text-[11px] text-slate-500"><Badge kind="sim" /> Citizens are demo characters; replies are labelled simulations.</p></div>
              <div className={`flex min-h-[420px] flex-col rounded-3xl border border-white/10 bg-white/[0.03] ${activeConv ? '' : 'hidden md:flex'}`}>
                {!activeConv ? <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate-500">Select a conversation to start chatting.</div> : (<>
                  <div className="flex items-center gap-3 border-b border-white/10 p-3.5"><button onClick={() => setActiveConv(null)} className="rounded-full bg-white/5 px-3 py-1.5 text-xs font-bold text-white md:hidden">← Back</button><Avatar name={activeConv.participant_name} color={activeConv.avatar_color} size={38} /><div><p className="text-sm font-bold text-white">{activeConv.participant_name}</p><p className="text-[11px] text-slate-400">{activeConv.participant_handle} · demo citizen</p></div></div>
                  <div className="flex-1 space-y-2.5 overflow-y-auto p-4">{msgs.map(m => { const mine = m.sender_name === 'You'; return <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${mine ? 'rounded-br-md bg-gradient-to-br from-amber-500 to-yellow-400 text-slate-950' : 'rounded-bl-md bg-white/10 text-slate-100'}`}><p className="text-[13px] leading-relaxed">{m.content}</p><p className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${mine ? 'text-slate-800' : 'text-slate-400'}`}>{timeAgo(m.created_at)}{mine && <CheckCheck size={12} />}{mine ? (m.is_read ? ' read' : ' sent') : ''}</p></div></div>; })}<div ref={chatEndRef} /></div>
                  <div className="flex gap-2 border-t border-white/10 p-3"><input value={msgText} onChange={e => setMsgText(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMsg()} placeholder="Message…" className="flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none" /><button disabled={sending} onClick={sendMsg} className="rounded-full bg-amber-400 px-4 text-slate-950 disabled:opacity-50" aria-label="Send message"><Send size={16} /></button></div>
                </>)}
              </div>
            </div>
          )}
          {tab === 'people' && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{profiles.map(pr => <div key={pr.id} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4"><div className="flex items-center gap-3"><Avatar name={pr.name} color={pr.avatar_color} size={48} /><div className="min-w-0"><p className="truncate font-bold text-white">{pr.name}</p><p className="text-[11px] text-slate-400">{pr.handle}</p></div></div><p className="mt-2 line-clamp-2 min-h-[34px] text-xs leading-relaxed text-slate-300">{pr.bio}</p><p className="mt-1 text-[11px] text-slate-400"><b className="text-white">{pr.followers}</b> followers · <b className="text-white">{pr.following}</b> following</p><div className="mt-3 flex gap-2"><button onClick={() => toggleFollow(pr)} className={`flex-1 rounded-full py-2 text-xs font-bold ${followed.includes(pr.id) ? 'bg-white/10 text-slate-100' : 'bg-amber-400 text-slate-950'}`}>{followed.includes(pr.id) ? 'Following ✓' : 'Connect'}</button><Link to={'/building/' + pr.building_slug} className="rounded-full border border-white/15 px-3 py-2 text-xs font-bold text-slate-200">Their building</Link></div></div>)}{profiles.length === 0 && <Empty>No citizen profiles yet.</Empty>}</div>
          )}
          {tab === 'saved' && (bookmarks.length === 0 ? <Empty>Nothing saved yet — tap “Save” on any post and it will live here (stored per account in the database).</Empty> : <div className="space-y-4">{published.filter(p => bookmarks.includes(p.id)).map(p => <PostCard key={p.id} p={p} />)}</div>)}
          {tab === 'media' && (published.filter(p => p.image_url).length === 0 ? <Empty>No media posts yet. Publish a post with a photo to start the city media library.</Empty> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{published.filter(p => p.image_url).map(p => <button key={p.id} onClick={() => setTab('feed')} className="group relative overflow-hidden rounded-2xl"><img src={p.image_url} alt={p.content.slice(0, 60)} className="aspect-square w-full object-cover transition group-hover:scale-105" loading="lazy" /><span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-2.5 text-left text-[11px] font-semibold text-white">{p.author_name} · ❤ {p.likes}</span></button>)}</div>)}
        </>
      )}
    </div>
  );
}
