-- One launch-ready deliverable brief for each company; idempotent by company and title.
insert into public.tasks(title,description,building_slug,agent_name,priority,status,progress,company_id,deliverable_type,created_at)
select v.title,v.description,c.building_slug,'Unassigned','high','queued',0,c.id,v.deliverable_type,now()
from (values
 ('AppCraft flagship app service package','Create a reusable B2B app delivery package: product brief, user flows, screen list, architecture, starter source files and client handoff checklist. Do not claim the app is built, tested or deployed.','app','app-company'),
 ('WebNest website delivery package','Create a reusable B2B website package: sitemap, page copy, responsive component plan, SEO checklist, starter source files and source handoff. Hosting must be optional.','website','website-company'),
 ('Vyom Construction B2B service portfolio','Create Vyom Construction service catalog, project proposal template, estimation assumptions, project delivery stages and original portfolio copy. Do not invent completed client projects.','proposal','vyom-construction'),
 ('Original anime IP bible','Create an original anime concept with logline, world, cast, character arcs, pilot episode outline, season arc and IP originality checklist. Do not use existing copyrighted characters or franchises.','anime','animation-anime'),
 ('Original cartoon short package','Create an original cartoon short: premise, characters, 3-minute script, storyboard shot list, dialogue, visual style guide and production checklist.','video','animation-cartoon'),
 ('Original film pitch package','Create an original movie pitch: logline, synopsis, treatment, key characters, scene outline, sample screenplay pages and production assumptions.','movie','animation-movie'),
 ('Game Studio A 3D preview vertical slice','Create a small original 3D game vertical-slice deliverable: core loop, Godot 4 scene tree, controls, scripts, placeholder asset plan and instructions to run locally. Do not claim it was executed.','game','innovation-garage'),
 ('Game Studio B starter game package','Create an original game starter package with project structure, gameplay loop, player/control scripts, level plan, test checklist and source handoff notes for Godot 4.','game','game-studio-b'),
 ('Video & Content Studio 1 YouTube launch pack','Create a YouTube channel launch pack: content pillars, three series, ten episode ideas, first complete script, thumbnail briefs, title options and production checklist.','video','media-studio'),
 ('Video & Content Studio 2 reels launch pack','Create a 30-day short-form reels plan with hooks, scripts, shot lists, captions, CTA and reusable editing template. Keep all concepts original.','reel','creator-hub'),
 ('VFX & Editing Studio service portfolio','Create VFX/CGI/editing service catalog, sample demo briefs, production pipeline, revision policy, portfolio page copy and client handoff checklist.','design','vfx-editing-co'),
 ('Automation Solutions lead workflow','Design a client-safe lead capture → qualification → CRM → follow-up automation with data fields, approval gates, failure handling and implementation source outline. No unsolicited outreach.','automation','automation-company'),
 ('Social & Ads agency campaign kit','Create an ad campaign kit with creative concepts, copy variations, visual briefs, audience hypotheses, platform adaptations and measurement plan.','ad','social-nexus'),
 ('Brand & Portfolio identity package','Create a brand identity package: positioning, voice, color/type direction, portfolio sitemap, page copy, case-study template and reusable design tokens.','design','portfolio-company'),
 ('Documentary concept and research plan','Create an original documentary concept, thesis, episode outline, interview questions, source-validation plan and production checklist. Do not fabricate sources or interviews.','video','archive-spire'),
 ('Tech Research prototype brief','Create a technology product brief with user problem, requirements, architecture options, prototype scope, validation tests, risks and next-step experiments. Mark market assumptions for later verification.','report','tech-research-co'),
 ('Client Solutions public lead research automation','Create a public-source B2B lead research workflow: ICP, search criteria, evidence fields, qualification rubric, CRM schema, human review and opt-out policy. No automated contact.','automation','clone-lab')
) as v(title,description,deliverable_type,slug)
join public.companies c on c.building_slug=v.slug
where not exists (select 1 from public.tasks t where t.company_id=c.id and t.title=v.title);
