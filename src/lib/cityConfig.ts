// 3D geometry config for all 37 buildings. Display data (name, purpose, status)
// is fetched from Supabase via /api/buildings and merged by slug with BUILDING_META
// as a static fallback — so cards, Enter and System keep working (and never show a
// raw slug as a name) even when DB rows are missing. Run supabase/schema.sql to
// create/seed the real tables; fallback rows are labelled in the UI where shown.
export interface BuildingGeo { slug: string; x: number; z: number; w: number; d: number; h: number; shape: string; color: number; roof: number; emissive: number; }

export const BUILDING_GEO: BuildingGeo[] = [
  { slug: 'royal-palace-hq', x: 0, z: -64, w: 26, d: 16, h: 14, shape: 'palace', color: 0x2a2340, roof: 0xc9a227, emissive: 0xffd97a },
  { slug: 'operations-tower', x: -30, z: -64, w: 12, d: 12, h: 34, shape: 'tower', color: 0x1d2b4f, roof: 0x3b82f6, emissive: 0x93c5fd },
  { slug: 'security-command', x: 30, z: -64, w: 14, d: 12, h: 16, shape: 'fortress', color: 0x232733, roof: 0x64748b, emissive: 0xf87171 },
  { slug: 'ai-research-lab', x: -64, z: -40, w: 16, d: 14, h: 12, shape: 'lab', color: 0x16303a, roof: 0x22d3ee, emissive: 0x67e8f9 },
  { slug: 'data-vault', x: -64, z: -14, w: 18, d: 14, h: 9, shape: 'vault', color: 0x1a1f2e, roof: 0x475569, emissive: 0xa5b4fc },
  { slug: 'agent-academy', x: -64, z: 14, w: 16, d: 13, h: 12, shape: 'academy', color: 0x2e2440, roof: 0x8b5cf6, emissive: 0xc4b5fd },
  { slug: 'innovation-garage', x: -64, z: 44, w: 17, d: 13, h: 8, shape: 'garage', color: 0x33251a, roof: 0xf59e0b, emissive: 0xfcd34d },
  { slug: 'grand-library', x: -28, z: -30, w: 18, d: 13, h: 11, shape: 'library', color: 0x2b2118, roof: 0xb45309, emissive: 0xfde68a },
  { slug: 'archive-spire', x: -28, z: -4, w: 9, d: 9, h: 38, shape: 'spire', color: 0x241d33, roof: 0x7c3aed, emissive: 0xddd6fe },
  { slug: 'observatory', x: -28, z: 22, w: 13, d: 13, h: 10, shape: 'observatory', color: 0x1b2547, roof: 0xe2e8f0, emissive: 0xbfdbfe },
  { slug: 'eco-tower', x: -28, z: 54, w: 13, d: 13, h: 24, shape: 'eco', color: 0x17301f, roof: 0x22c55e, emissive: 0x86efac },
  { slug: 'social-nexus', x: 14, z: -30, w: 15, d: 15, h: 18, shape: 'nexus', color: 0x3a1c33, roof: 0xec4899, emissive: 0xf9a8d4 },
  { slug: 'media-studio', x: 14, z: -4, w: 17, d: 13, h: 11, shape: 'studio', color: 0x33181f, roof: 0xef4444, emissive: 0xfca5a5 },
  { slug: 'creator-hub', x: 14, z: 22, w: 14, d: 12, h: 15, shape: 'hub', color: 0x32241a, roof: 0xf97316, emissive: 0xfed7aa },
  { slug: 'culture-theatre', x: 14, z: 54, w: 18, d: 14, h: 10, shape: 'theatre', color: 0x2a1a2e, roof: 0xa855f7, emissive: 0xe9d5ff },
  { slug: 'commerce-exchange', x: 52, z: -40, w: 15, d: 13, h: 22, shape: 'exchange', color: 0x1c2e26, roof: 0x10b981, emissive: 0x6ee7b7 },
  { slug: 'health-clinic', x: 52, z: -12, w: 15, d: 12, h: 9, shape: 'clinic', color: 0x27333d, roof: 0xf8fafc, emissive: 0xffffff },
  { slug: 'transport-hub', x: 52, z: 18, w: 20, d: 12, h: 8, shape: 'transport', color: 0x1e2a38, roof: 0x38bdf8, emissive: 0xbae6fd },
  { slug: 'horizon-port', x: 60, z: 56, w: 10, d: 10, h: 26, shape: 'lighthouse', color: 0x26303d, roof: 0xfacc15, emissive: 0xfef08a },
  // ── City expansion (31 total): Studio District (south), Business & Finance (north), Vyom Works + Education (west)
  { slug: 'game-studio-b', x: -64, z: 92, w: 15, d: 13, h: 13, shape: 'gamestudio', color: 0x1f2a44, roof: 0x818cf8, emissive: 0xa5b4fc },
  { slug: 'animation-anime', x: -38, z: 92, w: 14, d: 12, h: 12, shape: 'anime', color: 0x3a1f33, roof: 0xf472b6, emissive: 0xfbcfe8 },
  { slug: 'animation-cartoon', x: 2, z: 92, w: 14, d: 12, h: 11, shape: 'cartoon', color: 0x33301c, roof: 0xfacc15, emissive: 0xfde68a },
  { slug: 'animation-movie', x: 20, z: 92, w: 14, d: 12, h: 14, shape: 'movie', color: 0x241f33, roof: 0xe2e8f0, emissive: 0xe2e8f0 },
  { slug: 'vfx-editing-co', x: 48, z: 92, w: 15, d: 13, h: 12, shape: 'vfx', color: 0x1c3038, roof: 0x2dd4bf, emissive: 0x99f6e4 },
  { slug: 'game-center', x: -90, z: 44, w: 14, d: 12, h: 9, shape: 'arcade', color: 0x2e1f3d, roof: 0xc084fc, emissive: 0xe9d5ff },
  { slug: 'award-center', x: -24, z: -92, w: 18, d: 14, h: 13, shape: 'award', color: 0x33270f, roof: 0xffd75e, emissive: 0xfef08a },
  { slug: 'review-company', x: 6, z: -92, w: 13, d: 11, h: 16, shape: 'review', color: 0x2b2440, roof: 0xfbbf24, emissive: 0xfde68a },
  { slug: 'royal-treasury-bank', x: 48, z: -92, w: 16, d: 13, h: 12, shape: 'bank', color: 0x2e2a1c, roof: 0xc9a227, emissive: 0xffd97a },
  { slug: 'vyom-construction', x: -90, z: -46, w: 15, d: 13, h: 15, shape: 'vyom', color: 0x1f2e3a, roof: 0x38bdf8, emissive: 0xbae6fd },
  { slug: 'automation-company', x: -90, z: -18, w: 14, d: 12, h: 12, shape: 'automation', color: 0x1d3328, roof: 0x4ade80, emissive: 0xbbf7d0 },
  { slug: 'ecc-team', x: -90, z: 12, w: 16, d: 13, h: 14, shape: 'ecc', color: 0x33241f, roof: 0xfb923c, emissive: 0xfed7aa },
  // ── Client & Services District + Security & R&D District (37 total)
  { slug: 'app-company', x: -58, z: -92, w: 13, d: 12, h: 17, shape: 'app', color: 0x26314d, roof: 0x7dd3fc, emissive: 0xbae6fd },
  { slug: 'website-company', x: 21, z: -92, w: 13, d: 12, h: 12, shape: 'website', color: 0x2b2340, roof: 0xa5b4fc, emissive: 0xc7d2fe },
  { slug: 'portfolio-company', x: -90, z: 92, w: 14, d: 12, h: 12, shape: 'portfolio', color: 0x37262e, roof: 0xfda4af, emissive: 0xfecdd3 },
  { slug: 'clone-lab', x: 62, z: 92, w: 11, d: 12, h: 13, shape: 'clonelab', color: 0x233038, roof: 0x67e8f9, emissive: 0xa5f3fc },
  { slug: 'security-lab', x: -90, z: -68, w: 14, d: 13, h: 13, shape: 'securitylab', color: 0x1e2430, roof: 0xf87171, emissive: 0xfca5a5 },
  { slug: 'tech-research-co', x: -40, z: -92, w: 12, d: 11, h: 15, shape: 'techresearch', color: 0x1f3040, roof: 0x93c5fd, emissive: 0xbfdbfe },
];

export const DISTRICT_COLORS: Record<string, string> = {
  'Royal Quarter': '#c9a227', 'Innovation District': '#22d3ee', 'Civic District': '#a5b4fc',
  'Culture & Media': '#ec4899', 'Harbor District': '#38bdf8', 'Eco District': '#22c55e',
  'Studio District': '#e879f9', 'Education District': '#facc15', 'Business & Finance District': '#2dd4bf',
  'Resource Quarter': '#fb923c', 'Vyom Works': '#38bdf8',
  'Client & Services District': '#fb7185', 'Security & R&D District': '#94a3b8',
};

// Purpose-specific extra rooms per building (combined with DB departments)
export const EXTRA_ROOMS: Record<string, string[]> = {
  'royal-palace-hq': ['Throne Reception Hall', 'Council Chamber', 'Royal Archive', 'Ceremonial Plaza Deck'],
  'ai-research-lab': ['Neural Training Lab', 'Model Evaluation Bay', 'Robotics Test Floor', 'Data Annotation Studio'],
  'data-vault': ['Cold Storage Hall A', 'Encryption Chamber', 'Backup Verification Room', 'Access Control Airlock'],
  'agent-academy': ['Entrepreneur Track Classroom', 'Animator Track Studio', 'Editor Track Suite', 'Researcher Track Lab', 'Coder Track Lab', 'Game-Dev Track Arena', 'Assessment & Re-Training Hall', 'Graduation Stage'],
  'operations-tower': ['City Watch Floor', 'Incident Response Room', 'Dispatch Wall', 'Situation Theatre'],
  'social-nexus': ['Publishing Atrium', 'YouTube Accounts Desk', 'Instagram & Facebook Desk', 'Play Store Desk', 'Autopolis Social Internal Feed Room', 'Scheduling & Moderation Desk'],
  'media-studio': ['Studio A — Broadcast', 'Studio B — Podcast', 'Client Projects Floor', 'Edit Suite Row', 'Green-Screen Stage'],
  'creator-hub': ['Shorts & Reels Floor', 'YouTube Long-Form Desks', 'Recording Booths', 'Thumbnail Design Corner', 'Trend Reaction Room'],
  'observatory': ['Telescope Dome', 'Trend-Spotting War Room', 'Niche Signal Lab', 'Star Chart Room', 'Viewing Terrace'],
  'grand-library': ['Grand Reading Hall', 'Output Resource Library Wing', 'Rare Manuscripts Vault', 'Study Carrels', 'Digital Archive Wing'],
  'commerce-exchange': ['Trading Floor', 'Information Market Floor', 'Merchant Booths', 'Escrow Office', 'Market Data Wall', 'Company Leaderboard Gallery'],
  'health-clinic': ['Triage Reception', 'Consultation Rooms 1–4', 'Recovery Ward', 'Pharmacy Counter'],
  'transport-hub': ['Departure Concourse', 'Platform Control', 'Vehicle Bays', 'Passenger Lounge'],
  'innovation-garage': ['Game Design Floor', 'Engine & Code Bay', 'Playtest Arena', '3D Print Bay (props)', 'Demo Pitch Corner'],
  'culture-theatre': ['Screen 1 — Movies', 'Screen 2 — Anime & Cartoon', 'Screen 3 — Documentaries', 'Premiere Red-Carpet Hall', 'Audience Review Lounge', 'Gallery Foyer'],
  'eco-tower': ['Sky Garden Level 1', 'Hydroponics Lab', 'Rainwater Systems Room', 'Seed Bank'],
  'security-command': ['Surveillance Ops Room', 'Cyber Defence Cell', 'Briefing Room', 'Evidence Vault'],
  'archive-spire': ['Documentary Edit Suites', 'Records Stacks L1', 'Digitisation Suite', 'Preservation Lab', 'Screening Balcony'],
  'horizon-port': ['World Gateway Departures', 'Global Info & Competition Desk', 'Harbour Control', 'Beacon Room', 'Observation Lantern Deck'],
  'game-studio-b': ['Design Pit', 'Engine Room', 'QA & Playtest Bay', 'Sound Booth', 'Release Corner'],
  'animation-anime': ['Storyboard Wall', 'Keyframe Desks', 'In-Betweening Row', 'Voice Booth', 'Compositing Suite'],
  'animation-cartoon': ['Toon Drawing Floor', 'Slapstick Timing Room', 'Voice & SFX Booth', 'Colour Department'],
  'animation-movie': ['Feature Story Room', 'Layout & Previz Stage', 'Render Farm Gallery', 'Score & Sound Suite'],
  'vfx-editing-co': ['VFX Compositing Floor', 'CGI Modelling Bay', 'Colour Grade Suite', 'Client Interview & Hiring Lounge', 'Render Watch Room'],
  'game-center': ['Arcade Floor', 'Playtest Stations', 'Review & Rating Wall', 'Tournament Corner', 'Snack Counter'],
  'award-center': ['Grand Award Stage', 'Red Carpet', 'Nominees Lounge', 'Trophy Gallery', 'Review Company Wing (critics’ desks)'],
  'review-company': ['Critics Screening Room', 'Star-Rating Desk', 'Audience Metrics Office (views/likes)', 'Leaderboard Feed Room'],
  'royal-treasury-bank': ['Token Bank Counters', 'Royal Coin Vault', 'Lending Desk', 'Daily Budget Office (30 crore reserve)'],
  'vyom-construction': ['Vyom App Repair Floor', 'Build & Release Bay', 'Crash-Test Lab', 'Client Support Desk'],
  'automation-company': ['Workflow Canvas Floor (n8n-style)', 'Client Deals Office', 'Hosting & Runs Monitor Wall', 'Integration Bench'],
  'ecc-team': ['Graduate Interview Hall', 'Multi-Niche War Room', 'Placement Desk (hiring into companies)', 'Scratch-Agent Onboarding'],
  'app-company': ['Product Planning', 'Dev Floor (Android/iOS)', 'QA Lab', 'Release Desk', 'CLIENT FINDER OFFICE'],
  'website-company': ['Design Studio', 'Frontend/Backend Floor', 'Hosting Desk', 'CLIENT FINDER OFFICE'],
  'portfolio-company': ['Portfolio Design Floor', 'Case Study Writers', 'Showreel Edit Bay', 'CLIENT FINDER OFFICE'],
  'security-lab': ['Red Team Floor (sandbox only)', 'Blue Team Defence', 'Audit & Reports', 'Bug Bounty Desk'],
  'clone-lab': ['Reference Analysis Floor', 'Rebuild Studio', 'Asset Replacement Bay', 'Legal/Originality Check'],
  'tech-research-co': ['Radar Floor (new tech)', 'Benchmark Lab', 'Report Writers', 'Tech Scouts'],
};

// ── Static fallback directory for ALL 37 buildings ──────────────────────────
// UI always prefers live Supabase rows; these fill any missing slug so a card,
// Enter or System page never breaks and never shows a raw slug as its name.
export interface BuildingMeta { name: string; purpose: string; district: string; departments: string; status: string; system_name: string; version: string; floors: number; description: string; }
const M = (name: string, purpose: string, district: string, departments: string, system_name: string, version: string, floors: number, description?: string, status = 'operational'): BuildingMeta => ({ name, purpose, district, departments, system_name, version, floors, status, description: description || purpose });

export const BUILDING_META: Record<string, BuildingMeta> = {
  'royal-palace-hq': M('Royal Palace HQ', 'Owner HQ — seat of city governance: strategy, approvals and the royal council that oversees every Autopolis system and company charter.', 'Royal Quarter', 'Royal Council, Strategy & Policy, Protocol Office, City Approvals', 'CrownCore Governance', '4.2.0', 4),
  'operations-tower': M('City Operations Tower', 'City work inbox + dispatch HQ and 24/7 control centre coordinating tasks, incidents and agent dispatch across all buildings.', 'Royal Quarter', 'City Watch, Incident Response, Agent Dispatch, Service Desk', 'OpsWatch Command', '6.1.3', 4),
  'security-command': M('Security Command', 'Cyber defence, surveillance oversight and city safety coordination.', 'Royal Quarter', 'Cyber Defence, Surveillance Ops, Access Audit, Emergency Coordination', 'Sentinel Shield', '3.8.1', 3),
  'ai-research-lab': M('AI Research Lab', 'Researcher & new-niche finder wing: model research and safety evaluation, plus hunting profitable new niches for city companies.', 'Innovation District', 'Model Research, Evaluation & Safety, Niche Research, Data Science', 'NeuralForge Lab Suite', '2.9.4', 3),
  'data-vault': M('Data Vault', 'Secure store of the Resource Library: verified storage and backups for owner references, assets and company outputs.', 'Resource Quarter', 'Storage Engineering, Encryption Services, Backup & Recovery, Data Governance', 'VaultKeep Storage', '5.0.2', 2),
  'agent-academy': M('Autopolis Institute', 'Hard training institute with 6 tracks — Entrepreneur, Animator, Editor, Researcher, Coder, Game Dev. Repeated mistakes (error status) send agents back for re-training; graduates face company/ECC interviews before hiring.', 'Education District', 'Entrepreneur Track, Animator Track, Editor Track, Researcher Track, Coder Track, Game-Dev Track, Assessment & Re-Training, Graduation Office', 'InstituteOS Training', '1.7.0', 3),
  'innovation-garage': M('Game Studio A', 'Game Studio A: designs, builds and playtests city games alongside Game Studio B. (3D print bay still under repair — see Operations.)', 'Studio District', 'Game Design, Engine & Code, Playtesting, Prototyping', 'GarageWorks Prototyper', '0.9.8', 2, undefined, 'maintenance'),
  'grand-library': M('Grand Library', 'Resource Library with the Data Vault — Store 1: owner-added references/assets/links (searchable); Store 2: every company output shelved for star reviews before Awards & Publishing.', 'Resource Quarter', 'Collections, Reader Services, Resource Library Wing, Digital Archives', 'Athenaeum Library', '3.3.0', 3),
  'archive-spire': M('Documentary & Archive Company', 'Produces documentaries from the city archives and preserves/digitises royal & civic records.', 'Studio District', 'Documentary Production, Records Preservation, Digitisation, Cataloguing', 'SpireArchive Records', '2.4.6', 4),
  'observatory': M('Observatory', 'Trend & niche spotting wing: astronomy and weather intelligence plus market/culture trend signals for companies and the Institute.', 'Civic District', 'Astronomy, Weather Intelligence, Trend Spotting, Public Stargazing', 'StarLens Observatory', '1.9.2', 2),
  'eco-tower': M('Eco Gardens Tower', 'Urban farming, green energy and environmental care for every district — the city’s ambience and fresh-food heart.', 'Eco District', 'Urban Farming, Energy Systems, Water Recycling, Eco Education', 'VerdantOS Eco', '2.1.0', 4),
  'social-nexus': M('Publishing Center', 'Multi-account publishing HQ (YouTube/Instagram/Facebook/Play Store desks — Connected only after real OAuth, otherwise Setup required) and home of the live Autopolis Social internal feed.', 'Studio District', 'YouTube Desk, Instagram & Facebook Desk, Play Store Desk, Autopolis Social Feed, Trust & Safety', 'Nexus Publishing Platform', '7.0.1', 3),
  'media-studio': M('Video & Content Co. 1', 'Real operating company #1 for video & content: broadcast, podcasts and client productions by hired agents (max 2 active).', 'Studio District', 'Broadcast Production, Podcast Unit, Client Projects, Video Editing', 'StudioWave Media', '4.5.5', 2),
  'creator-hub': M('Video & Content Co. 2', 'Real operating company #2 focused on Shorts/Reels and YouTube content, run by hired creator agents.', 'Studio District', 'Shorts & Reels, YouTube Long-Form, Thumbnail Design, Growth Coaching', 'CreatorFlow Hub', '2.6.3', 3),
  'culture-theatre': M('Royal Cinema Hall', 'City cinema: company-made movies, anime, cartoons and documentaries screen here and collect audience reviews, stars and likes that feed the Award Center.', 'Studio District', 'Screenings, Premieres, Audience Reviews, Box Office', 'CineRoyal Screenings', '1.4.0', 2),
  'commerce-exchange': M('Information Market', 'Food stalls & stores where agents exchange information; home of the public company leaderboards (rank, money, tasks done, token usage, remaining budget) and a Token Bank counter.', 'Business & Finance District', 'Food Stalls & Stores, Information Exchange, Leaderboard Gallery, Token Bank Counter, Escrow & Payments', 'RoyalExchange Markets', '5.7.2', 3),
  'health-clinic': M('Health Clinic', 'Citizen healthcare and agent health/repair monitoring: error-status agents are checked here before Institute re-training.', 'Harbor District', 'General Practice, Recovery Ward, Pharmacy, Wellness Programmes', 'CarePoint Clinic', '3.0.8', 2),
  'transport-hub': M('Transport Hub', 'Agent movement across the city: shuttle routes and transfers between districts and buildings, plus passenger services.', 'Harbor District', 'Route Planning, Vehicle Dispatch, Passenger Services, Maintenance Bays', 'TransitCore Mobility', '4.1.4', 2),
  'horizon-port': M('Horizon Port', 'Gateway to the outside world: entrepreneur agents depart to gather worldwide information & competition research (simulated briefs via Dispatch — no live web connection), plus river harbour control and the great beacon.', 'Harbor District', 'World Gateway, Harbour Control, Cargo & Manifests, Beacon Keepers', 'PortLight Harbour', '2.2.7', 4),
  'game-studio-b': M('Game Studio B', 'Second game studio: bigger titles, engine work and live playtests with Game Center reviewers.', 'Studio District', 'Game Design, Engine & Code, QA & Playtesting, Sound Design', 'StudioB GameForge', '1.0.0', 3),
  'animation-anime': M('Animation Company 1 — Anime', 'Anime series production: storyboards, keyframes, voice and compositing for Cinema Hall Screen 2.', 'Studio District', 'Direction & Storyboards, Key Animation, Voice Production, Compositing', 'SakuraFrame Anime', '1.0.0', 3),
  'animation-cartoon': M('Animation Company 2 — Cartoon', 'Cartoon shorts and series with slapstick timing, for Cinema Hall and Publishing Center shorts channels.', 'Studio District', 'Toon Drawing, Timing & Gags, Voice & SFX, Colour', 'ToonWorks Cartoon', '1.0.0', 2),
  'animation-movie': M('Animation Company 3 — Movies', 'Long-form animated feature films: story, layout, previz, render and score for Cinema Hall premieres.', 'Studio District', 'Feature Direction, Layout & Previz, Render Farm, Score & Sound', 'SilverReel Features', '1.0.0', 3),
  'vfx-editing-co': M('VFX / CGI / Editing Company', 'Shared VFX, CGI and editing powerhouse. Other companies interview and hire its editors/VFX agents from here for their productions.', 'Studio District', 'VFX Compositing, CGI Modelling, Editing & Grade, Talent Hiring Desk', 'FramePerfect VFX', '1.0.0', 3),
  'game-center': M('Game Center', 'Citizens play city-made games here; playtest scores and reviews flow back to the studios and leaderboards.', 'Studio District', 'Arcade Operations, Playtesting, Reviews & Ratings, Tournaments', 'PlayReview Arcade', '1.0.0', 2),
  'award-center': M('Award Center', 'Hollywood-style award shows: Best Entrepreneur, Editor, Company, Post, Agent (month/year), Best Show, Cartoon, Documentary, Coding Agent — judged from Review Company metrics.', 'Business & Finance District', 'Show Production, Nominations, Trophy Gallery, Review Company Wing', 'RoyalHonours Show', '1.0.0', 2),
  'review-company': M('Review Company', 'Professional critics + audience metrics: collects stars, views and likes from the Resource Library/Cinema/Game Center and feeds Award Center shortlists and leaderboards.', 'Business & Finance District', 'Critics Panel, Audience Metrics, Ratings Publishing, Leaderboard Feed', 'StarMetrics Reviews', '1.0.0', 3),
  'royal-treasury-bank': M('Royal Treasury / Token Bank', 'Holds the daily 30-crore token reserve (simulated): companies spend daily allocations, unused tokens stay in the Bank, extra budget can be borrowed; Royal Coin earnings settle here.', 'Business & Finance District', 'Token Bank, Coin Vault, Lending Desk, Budget Office', 'TreasuryCore Bank', '1.0.0', 2),
  'vyom-construction': M('Vyom Construction', 'The company that fixes, builds and maintains the Vyom app: crash fixes, releases and client support via Dispatch.', 'Vyom Works', 'App Engineering, Build & Release, Crash-Test Lab, Client Support', 'VyomBuild Maintainer', '1.0.0', 3),
  'automation-company': M('Automation Company', 'n8n-style automation studio: deals with clients, builds workflow canvases and hosts/monitors their automations.', 'Vyom Works', 'Workflow Design, Client Deals, Hosting & Monitoring, Integrations', 'FlowForge Automations', '1.0.0', 3),
  'ecc-team': M('ECC Team', 'Big multi-niche talent team: interviews Institute graduates (including scratch agents) and hires/places them into city companies or ECC squads.', 'Education District', 'Graduate Interviews, Multi-Niche Squads, Placements, Onboarding', 'ECC Placement OS', '1.0.0', 3),
  'app-company': M('App Development Company', 'Builds Android/iOS apps for clients found by its Client Finder office: product planning, dev floor, QA lab and release desk.', 'Client & Services District', 'Product Planning, App Development, QA Lab, Release Desk, Client Finder Office', 'AppCraft Studio OS', '1.0.0', 3),
  'website-company': M('Website Development Company', 'Builds and hosts client websites: design studio, frontend/backend floor, hosting desk and a Client Finder office.', 'Client & Services District', 'Design Studio, Frontend & Backend, Hosting Desk, Client Finder Office', 'WebNest Studio OS', '1.0.0', 3),
  'portfolio-company': M('Portfolio & Brand Studio', 'Creates portfolios and personal brands for creators/freelancers (motion, video, dev) with case-study writers and a showreel edit bay.', 'Client & Services District', 'Portfolio Design, Case Study Writing, Showreel Editing, Client Finder Office', 'FolioForge Studio', '1.0.0', 3),
  'security-lab': M('Ethical Security Lab', 'DEFENSIVE/ETHICAL ONLY: security testing of the city’s OWN apps (incl. Vyom) and sandbox/CTF targets — vulnerability scans, code audits, secret-leak checks, pentest reports. No attacks on third-party systems, no real malware. All work labelled Simulated/Sandbox or Own Assets.', 'Security & R&D District', 'Red Team (Sandbox), Blue Team Defence, Audit & Reports, Bug Bounty Desk', 'ShieldLab Defensive', '1.0.0', 3),
  'clone-lab': M('Clone Anything Company', 'Studies a reference app/website/UI to understand its function and layout, then builds an ORIGINAL recreation. Brand logos, copyrighted assets and proprietary code are never copied — every rebuild passes a Legal/Originality Check.', 'Client & Services District', 'Reference Analysis, Rebuild Studio, Asset Replacement, Legal/Originality Check', 'ReMake Originals', '1.0.0', 3),
  'tech-research-co': M('New Technology Research Company', 'Tracks new technologies, tools and models; benchmarks them, writes reports into the Resource Library and recommends adoption to city companies. Separate from the AI Research Lab.', 'Security & R&D District', 'Tech Radar, Benchmark Lab, Report Writing, Tech Scouts', 'NextRadar Research', '1.0.0', 3),
};

export interface MergedBuilding { id: number; slug: string; name: string; purpose: string; district: string; description: string; status: string; departments: string; system_name: string; version: string; floors: number; _fallback?: boolean; }

/** Full 37-building directory from static fallback (Demo data — used only when DB rows are missing). */
export function fallbackBuildings(): MergedBuilding[] {
  return BUILDING_GEO.map((g, i) => { const m = BUILDING_META[g.slug]; return { id: i + 1, slug: g.slug, name: m?.name || g.slug, purpose: m?.purpose || '', district: m?.district || 'Royal Quarter', description: m?.description || '', status: m?.status || 'operational', departments: m?.departments || '', system_name: m?.system_name || 'City System', version: m?.version || '1.0.0', floors: m?.floors || 3, _fallback: true }; });
}

/** DB rows win; any geo slug missing from the DB is filled from BUILDING_META (flagged _fallback). */
export function mergeBuildings(dbRows: any[] | null | undefined): MergedBuilding[] {
  const bySlug = new Map<string, any>((dbRows || []).map(r => [r.slug, r]));
  const out: MergedBuilding[] = fallbackBuildings().map(f => bySlug.has(f.slug) ? { ...f, ...bySlug.get(f.slug), _fallback: false } : f);
  (dbRows || []).forEach(r => { if (!BUILDING_META[r.slug]) out.push(r); });
  return out;
}

export const buildingDisplayName = (slug: string, dbName?: string) => dbName || BUILDING_META[slug]?.name || slug.replace(/-/g, ' ');
