-- Seed the first real Autopolis company portfolio by existing company building.
-- Idempotent by building_slug; existing AppCraft and WebNest demo rows are preserved.
insert into public.companies(name,building_slug,industry,balance_coins,daily_token_budget,tokens_used_today,color,created_at)
select v.name,v.slug,v.industry,0,50000,0,v.color,now()
from (values
 ('Vyom Construction','vyom-construction','Construction, architecture, civil engineering','#22c55e'),
 ('Autopolis Anime Studio','animation-anime','Original anime, manga, character and story IP','#ec4899'),
 ('Autopolis Cartoon Studio','animation-cartoon','Original cartoons, animation and family content','#f97316'),
 ('Royal Film & Movie Studio','animation-movie','Original films, screenplay and movie production','#ef4444'),
 ('Game Studio A','innovation-garage','Original games, prototypes and 3D game previews','#8b5cf6'),
 ('Game Studio B','game-studio-b','Game development, playable demos and game assets','#06b6d4'),
 ('Video & Content Studio 1','media-studio','Video production, YouTube content and editing','#f59e0b'),
 ('Video & Content Studio 2','creator-hub','Creator content, reels and short-form videos','#14b8a6'),
 ('VFX & Editing Studio','vfx-editing-co','VFX, CGI, compositing and post-production','#d946ef'),
 ('Automation Solutions Co','automation-company','Business process automation and AI workflow systems','#3b82f6'),
 ('Social & Ads Agency','social-nexus','Creative ads, campaign assets and social content','#eab308'),
 ('Brand & Portfolio Studio','portfolio-company','Brand identity, portfolios and digital presence','#a855f7'),
 ('Documentary & Archive Studio','archive-spire','Documentaries, research-based video and archival storytelling','#64748b'),
 ('Tech Research Company','tech-research-co','Technology research, prototypes and product intelligence','#0ea5e9'),
 ('Client Solutions Studio','clone-lab','Client discovery, product rebuilds and custom digital solutions','#f43f5e')
) as v(name,slug,industry,color)
where not exists (select 1 from public.companies c where c.building_slug=v.slug);
