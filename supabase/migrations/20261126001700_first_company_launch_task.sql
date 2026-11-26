-- Replace the explicit demo placeholder with the first real, bounded city launch task.
update public.tasks
set title='Autopolis company portfolio launch: first B2B sales and marketing kit',
    description='Create the first owner-reviewable B2B launch kit for the 17-company Autopolis portfolio. Include: (1) clear service packages for apps, websites, automation, games/3D previews, ads, original video/anime/movie content and construction services; (2) company differentiation and likely business-buyer profiles; (3) source-code handoff as the default and hosting as optional; (4) pricing tiers as hypotheses only, clearly marked for owner validation; (5) public-source client research criteria and a lead qualification checklist; (6) landing-page/portfolio copy and draft outreach templates. Do not claim existing clients, revenue, completed work or verified market prices. Do not contact anyone, publish content, spend money or deploy. Deliver a complete practical launch kit with risks and next actions.',
    building_slug='archive-spire',
    agent_name='Unassigned',
    priority='critical',
    status='queued',
    progress=0,
    company_id=null,
    deliverable_type='report',
    assigned_agent_id=43,
    parent_task_id=null,
    claimed_agent_id=null,
    lease_expires_at=null,
    lease_token=null,
    error=null,
    started_at=null,
    completed_at=null
where id=1 and title='[Demo] Sample city task — replace via Dispatch Inbox';
