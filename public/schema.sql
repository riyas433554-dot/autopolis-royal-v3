-- ═══════════════════════════════════════════════════════════════════════════
-- AUTOPOLIS ROYAL — full database schema + seed  (run once: Supabase → SQL Editor)
-- Safe to re-run: CREATE TABLE IF NOT EXISTS + seed guarded by ON CONFLICT / NOT EXISTS.
-- Secrets: NONE in this file. OAuth tokens (if ever added) must be stored encrypted
-- server-side only — never in frontend code, never in this file.
-- After running, verify at:  /api/bootstrap
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Core city ────────────────────────────────────────────────────────────────
create table if not exists buildings (
  id serial primary key, slug text not null, name text, purpose text, district text,
  description text, status text default 'operational', departments text,
  system_name text, version text, floors integer default 3
);
create unique index if not exists buildings_slug_unique on buildings (slug);

create table if not exists agents (
  id serial primary key, name text, code text, role text, department text,
  building_slug text, status text default 'idle', current_task text, avatar_color text default '#c9a227'
);
create table if not exists tasks (
  id serial primary key, title text, building_slug text, agent_name text,
  status text default 'queued', progress integer default 0, priority text default 'medium',
  created_at timestamptz default now()
);
create table if not exists activity (
  id serial primary key, type text, title text, building_slug text, detail text,
  created_at timestamptz default now()
);

-- ── Autopolis Social ─────────────────────────────────────────────────────────
create table if not exists posts (
  id serial primary key, author_name text, author_handle text, content text,
  image_url text default '', likes integer default 0, shares integer default 0,
  hashtags text default '', is_draft boolean default false, created_at timestamptz default now()
);
create table if not exists comments (
  id serial primary key, post_id integer references posts(id) on delete cascade,
  author_name text, content text, parent_id integer, created_at timestamptz default now()
);
create table if not exists bookmarks (
  id serial primary key, post_id integer references posts(id) on delete cascade, user_email text
);
create table if not exists conversations (
  id serial primary key, participant_name text, participant_handle text,
  last_message text, unread integer default 0, avatar_color text default '#c9a227'
);
create table if not exists messages (
  id serial primary key, conversation_id integer references conversations(id) on delete cascade,
  sender_name text, content text, is_read boolean default false, created_at timestamptz default now()
);
create table if not exists notifications (
  id serial primary key, type text, title text, detail text,
  is_read boolean default false, created_at timestamptz default now()
);
create table if not exists profiles (
  id serial primary key, name text, handle text, bio text, avatar_color text default '#c9a227',
  followers integer default 0, following integer default 0, building_slug text
);
create table if not exists scheduled_posts (
  id serial primary key, content text, platform text, scheduled_for text default '', status text default 'draft'
);
create table if not exists connected_accounts (
  id serial primary key, provider text,            -- 'meta' | 'youtube'
  account_name text, account_id text, avatar_url text,
  status text default 'connected', last_sync timestamptz, created_at timestamptz default now()
  -- NOTE: real OAuth tokens must NEVER be stored in plaintext or in the frontend.
);

-- ── Company economy ──────────────────────────────────────────────────────────
create table if not exists companies (
  id serial primary key, name text not null, building_slug text, industry text,
  balance_coins integer default 0, daily_token_budget integer default 50000,
  tokens_used_today integer default 0, color text default '#c9a227', created_at timestamptz default now()
);
create table if not exists company_members (   -- RULE (enforced in /api/members): max 2 is_active per company
  id serial primary key, company_id integer references companies(id) on delete cascade,
  agent_id integer, agent_name text, is_active boolean default false
);
create table if not exists outputs (
  id serial primary key, title text, type text default 'report',
  company_id integer references companies(id) on delete cascade,
  agent_name text, building_slug text, status text default 'in_library',
  views integer default 0, likes integer default 0, tokens_used integer default 0,
  earning_coins integer default 0, created_at timestamptz default now()
);
create table if not exists reviews (
  id serial primary key, output_id integer references outputs(id) on delete cascade,
  reviewer_name text, stars integer, comment text, created_at timestamptz default now()
);
create table if not exists awards (
  id serial primary key, title text, recipient text, category text, prize_coins integer default 0,
  output_id integer references outputs(id) on delete set null, created_at timestamptz default now()
);
create table if not exists treasury_txns (
  id serial primary key, company_id integer references companies(id) on delete cascade,
  type text, amount integer default 0, note text, created_at timestamptz default now()
);
create table if not exists dispatch_inbox (
  id serial primary key, source text default 'owner', title text, detail text,
  company_id integer, building_slug text, agent_name text, status text default 'new',
  created_at timestamptz default now()
);
create table if not exists resources (
  id serial primary key, title text, url text default '', type text default 'reference',
  tags text default '', added_by text default 'Owner', created_at timestamptz default now()
);

-- ── Client Finder pipeline ───────────────────────────────────────────────────
create table if not exists client_leads (
  id serial primary key, business_name text, contact_name text, need text,
  source_url text, source_label text, is_live boolean default false, score integer default 50,
  stage text default 'lead',  -- lead|contacted|proposal|deal|delivery|paid
  company_id integer references companies(id) on delete set null,
  finder_name text, outreach_draft text, outreach_approved boolean default false,
  proposal_draft text, follow_up text, created_at timestamptz default now()
);
create table if not exists deals (
  id serial primary key, lead_id integer references client_leads(id) on delete cascade,
  company_id integer references companies(id) on delete cascade,
  title text, value_coins integer default 0, status text default 'active', -- active|delivered|paid
  created_at timestamptz default now()
);

-- ── SEED: 37 buildings (slug is the stable ID/URL — names/purposes editable) ──
insert into buildings (slug, name, purpose, district, description, status, departments, system_name, version, floors) values
('royal-palace-hq','Royal Palace HQ','Owner HQ — seat of city governance.','Royal Quarter','Owner HQ — seat of city governance.','operational','Royal Council, Strategy & Policy, Protocol Office, City Approvals','CrownCore Governance','4.2.0',4),
('operations-tower','City Operations Tower','City work inbox + dispatch HQ and 24/7 control centre.','Royal Quarter','City work inbox + dispatch HQ and 24/7 control centre.','operational','City Watch, Incident Response, Agent Dispatch, Service Desk','OpsWatch Command','6.1.3',4),
('security-command','Security Command','Cyber defence, surveillance oversight and city safety.','Royal Quarter','Cyber defence, surveillance oversight and city safety.','operational','Cyber Defence, Surveillance Ops, Access Audit, Emergency Coordination','Sentinel Shield','3.8.1',3),
('ai-research-lab','AI Research Lab','Researcher & new-niche finder wing.','Innovation District','Researcher & new-niche finder wing.','operational','Model Research, Evaluation & Safety, Niche Research, Data Science','NeuralForge Lab Suite','2.9.4',3),
('data-vault','Data Vault','Secure store of the Resource Library.','Resource Quarter','Secure store of the Resource Library.','operational','Storage Engineering, Encryption Services, Backup & Recovery, Data Governance','VaultKeep Storage','5.0.2',2),
('agent-academy','Autopolis Institute','Hard training: Entrepreneur/Animator/Editor/Researcher/Coder/Game-Dev tracks; graduation then company/ECC interviews.','Education District','Hard training institute with 6 tracks and re-training for error-status agents.','operational','Entrepreneur Track, Animator Track, Editor Track, Researcher Track, Coder Track, Game-Dev Track, Assessment & Re-Training, Graduation Office','InstituteOS Training','1.7.0',3),
('innovation-garage','Game Studio A','Game Studio A: designs, builds and playtests city games.','Studio District','Game Studio A.','maintenance','Game Design, Engine & Code, Playtesting, Prototyping','GarageWorks Prototyper','0.9.8',2),
('grand-library','Grand Library','Resource Library: Store 1 owner resources + Store 2 company outputs.','Resource Quarter','Resource Library home.','operational','Collections, Reader Services, Resource Library Wing, Digital Archives','Athenaeum Library','3.3.0',3),
('archive-spire','Documentary & Archive Company','Documentaries from the city archives + records preservation.','Studio District','Documentary & Archive Company.','operational','Documentary Production, Records Preservation, Digitisation, Cataloguing','SpireArchive Records','2.4.6',4),
('observatory','Observatory','Trend & niche spotting wing + astronomy.','Civic District','Trend & niche spotting wing.','operational','Astronomy, Weather Intelligence, Trend Spotting, Public Stargazing','StarLens Observatory','1.9.2',2),
('eco-tower','Eco Gardens Tower','Urban farming, green energy, city ambience.','Eco District','Urban farming tower.','operational','Urban Farming, Energy Systems, Water Recycling, Eco Education','VerdantOS Eco','2.1.0',4),
('social-nexus','Publishing Center','Multi-account publishing HQ + live Autopolis Social internal feed. External = Setup required until real OAuth.','Studio District','Publishing Center.','operational','YouTube Desk, Instagram & Facebook Desk, Play Store Desk, Autopolis Social Feed, Trust & Safety','Nexus Publishing Platform','7.0.1',3),
('media-studio','Video & Content Co. 1','Video & content company #1 (broadcast/podcast/client work).','Studio District','Video & Content Co. 1.','operational','Broadcast Production, Podcast Unit, Client Projects, Video Editing','StudioWave Media','4.5.5',2),
('creator-hub','Video & Content Co. 2','Video & content company #2 (Shorts/Reels/YouTube).','Studio District','Video & Content Co. 2.','operational','Shorts & Reels, YouTube Long-Form, Thumbnail Design, Growth Coaching','CreatorFlow Hub','2.6.3',3),
('culture-theatre','Royal Cinema Hall','Movies/anime/cartoon/documentary screenings + audience reviews.','Studio District','Royal Cinema Hall.','operational','Screenings, Premieres, Audience Reviews, Box Office','CineRoyal Screenings','1.4.0',2),
('commerce-exchange','Information Market','Food stalls/stores, info exchange, leaderboards + Token Bank counter.','Business & Finance District','Information Market.','operational','Food Stalls & Stores, Information Exchange, Leaderboard Gallery, Token Bank Counter, Escrow & Payments','RoyalExchange Markets','5.7.2',3),
('health-clinic','Health Clinic','Citizen healthcare + agent health/repair monitoring.','Harbor District','Health Clinic.','operational','General Practice, Recovery Ward, Pharmacy, Wellness Programmes','CarePoint Clinic','3.0.8',2),
('transport-hub','Transport Hub','Agent movement: routes, shuttles, transfers.','Harbor District','Transport Hub.','operational','Route Planning, Vehicle Dispatch, Passenger Services, Maintenance Bays','TransitCore Mobility','4.1.4',2),
('horizon-port','Horizon Port','World gateway (simulated briefs) + harbour control + beacon.','Harbor District','Horizon Port.','operational','World Gateway, Harbour Control, Cargo & Manifests, Beacon Keepers','PortLight Harbour','2.2.7',4),
('game-studio-b','Game Studio B','Bigger game titles + playtests.','Studio District','Game Studio B.','operational','Game Design, Engine & Code, QA & Playtesting, Sound Design','StudioB GameForge','1.0.0',3),
('animation-anime','Animation Company 1 — Anime','Anime series production.','Studio District','Anime studio.','operational','Direction & Storyboards, Key Animation, Voice Production, Compositing','SakuraFrame Anime','1.0.0',3),
('animation-cartoon','Animation Company 2 — Cartoon','Cartoon shorts/series.','Studio District','Cartoon studio.','operational','Toon Drawing, Timing & Gags, Voice & SFX, Colour','ToonWorks Cartoon','1.0.0',2),
('animation-movie','Animation Company 3 — Movies','Animated feature films.','Studio District','Feature animation studio.','operational','Feature Direction, Layout & Previz, Render Farm, Score & Sound','SilverReel Features','1.0.0',3),
('vfx-editing-co','VFX / CGI / Editing Company','Shared VFX/CGI/editing; other companies hire its agents.','Studio District','VFX company.','operational','VFX Compositing, CGI Modelling, Editing & Grade, Talent Hiring Desk','FramePerfect VFX','1.0.0',3),
('game-center','Game Center','Play + review city-made games.','Studio District','Game Center.','operational','Arcade Operations, Playtesting, Reviews & Ratings, Tournaments','PlayReview Arcade','1.0.0',2),
('award-center','Award Center','Hollywood-style city award shows.','Business & Finance District','Award Center.','operational','Show Production, Nominations, Trophy Gallery, Review Company Wing','RoyalHonours Show','1.0.0',2),
('review-company','Review Company','Stars/views/likes feeding awards + leaderboards.','Business & Finance District','Review Company.','operational','Critics Panel, Audience Metrics, Ratings Publishing, Leaderboard Feed','StarMetrics Reviews','1.0.0',3),
('royal-treasury-bank','Royal Treasury / Token Bank','30-crore daily token reserve (simulated) + Royal Coin settlement.','Business & Finance District','Treasury & Token Bank.','operational','Token Bank, Coin Vault, Lending Desk, Budget Office','TreasuryCore Bank','1.0.0',2),
('vyom-construction','Vyom Construction','Fixes/builds/maintains the Vyom app.','Vyom Works','Vyom Construction.','operational','App Engineering, Build & Release, Crash-Test Lab, Client Support','VyomBuild Maintainer','1.0.0',3),
('automation-company','Automation Company','n8n-style client automations: build + host + monitor.','Vyom Works','Automation Company.','operational','Workflow Design, Client Deals, Hosting & Monitoring, Integrations','FlowForge Automations','1.0.0',3),
('ecc-team','ECC Team','Graduate interviews + placement into companies.','Education District','ECC Team.','operational','Graduate Interviews, Multi-Niche Squads, Placements, Onboarding','ECC Placement OS','1.0.0',3),
('app-company','App Development Company','Android/iOS apps for clients (Client Finder Office inside).','Client & Services District','App Development Company.','operational','Product Planning, App Development, QA Lab, Release Desk, Client Finder Office','AppCraft Studio OS','1.0.0',3),
('website-company','Website Development Company','Client websites (Client Finder Office inside).','Client & Services District','Website Development Company.','operational','Design Studio, Frontend & Backend, Hosting Desk, Client Finder Office','WebNest Studio OS','1.0.0',3),
('portfolio-company','Portfolio & Brand Studio','Portfolios/brands for creators & freelancers (Client Finder Office inside).','Client & Services District','Portfolio & Brand Studio.','operational','Portfolio Design, Case Study Writing, Showreel Editing, Client Finder Office','FolioForge Studio','1.0.0',3),
('security-lab','Ethical Security Lab','DEFENSIVE ONLY: own-assets + sandbox/CTF security testing. No third-party attacks, no real malware.','Security & R&D District','Ethical Security Lab.','operational','Red Team (Sandbox), Blue Team Defence, Audit & Reports, Bug Bounty Desk','ShieldLab Defensive','1.0.0',3),
('clone-lab','Clone Anything Company','Original recreations from reference study. No logos/copyrighted assets/proprietary code copied.','Client & Services District','Clone Anything Company.','operational','Reference Analysis, Rebuild Studio, Asset Replacement, Legal/Originality Check','ReMake Originals','1.0.0',3),
('tech-research-co','New Technology Research Company','Tracks new tech/tools/models; reports to Resource Library; recommends to companies.','Security & R&D District','New Technology Research Company.','operational','Tech Radar, Benchmark Lab, Report Writing, Tech Scouts','NextRadar Research','1.0.0',3)
on conflict (slug) do nothing;

-- ── SEED (Demo-labelled): two starter companies + client-finder roles + tasks ─
insert into companies (name, building_slug, industry, balance_coins, daily_token_budget, color)
select 'AppCraft Studio (Demo seed)','app-company','Mobile App Development',500,60000,'#7dd3fc'
where not exists (select 1 from companies where name = 'AppCraft Studio (Demo seed)');
insert into companies (name, building_slug, industry, balance_coins, daily_token_budget, color)
select 'WebNest Studio (Demo seed)','website-company','Website Development',500,55000,'#a5b4fc'
where not exists (select 1 from companies where name = 'WebNest Studio (Demo seed)');
insert into agents (name, code, role, department, building_slug, status, current_task, avatar_color)
select 'Demo Client Finder','DEMO-001','Client Finder','Client Finder Office','app-company','idle','Demo seed — research public leads (simulated)','#fb7185'
where not exists (select 1 from agents where code = 'DEMO-001');
insert into tasks (title, building_slug, agent_name, status, progress, priority)
select '[Demo] Sample city task — replace via Dispatch Inbox','operations-tower','Unassigned','queued',0,'low'
where not exists (select 1 from tasks where title like '[Demo] Sample city task%');
insert into client_leads (business_name, need, source_label, is_live, score, stage, finder_name)
select 'Demo Bakery (sample lead)','Needs an online ordering page','Demo/Simulated lead',false,55,'lead','Demo Client Finder'
where not exists (select 1 from client_leads where business_name = 'Demo Bakery (sample lead)');
-- ═══════════════════════════════════════════════════════════════════════════
