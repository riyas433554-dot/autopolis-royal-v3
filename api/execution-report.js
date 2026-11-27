import supabase from './db-client.js';

function isOwner(req) {
  const token = process.env.AUTOPOLIS_LIFECYCLE_ADMIN_TOKEN;
  return Boolean(token && req.headers?.authorization === 'Bearer ' + token);
}

function groupCount(rows, key) {
  const counts = {};
  for (const row of rows || []) {
    const value = String(row?.[key] ?? 'unknown');
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!isOwner(req)) return res.status(401).json({ error: 'Owner token required' });

  try {
    const [companiesResult, agentsResult, profilesResult, membershipsResult, tasksResult, outputsResult] = await Promise.all([
      supabase.from('companies').select('id,name,building_slug'),
      supabase.from('agents').select('id,name,status,building_slug'),
      supabase.from('agent_lifecycle_profiles').select('agent_id,company_id,lifecycle_status'),
      supabase.from('company_members').select('agent_id,company_id,is_active'),
      supabase.from('tasks').select('id,title,status,company_id,assigned_agent_id,deliverable_type,building_slug,error,created_at,completed_at'),
      supabase.from('outputs').select('id,task_id,company_id,title,deliverable_type,status,created_at'),
    ]);
    for (const result of [companiesResult, agentsResult, profilesResult, membershipsResult, tasksResult, outputsResult]) {
      if (result.error) throw result.error;
    }

    const companies = companiesResult.data || [];
    const agents = agentsResult.data || [];
    const profiles = profilesResult.data || [];
    const memberships = membershipsResult.data || [];
    const tasks = tasksResult.data || [];
    const outputs = outputsResult.data || [];
    const activeMemberships = memberships.filter(item => item.is_active);
    const activeCompanyAgentIds = new Set(activeMemberships.map(item => Number(item.agent_id)));
    const profileByAgent = new Map(profiles.map(item => [Number(item.agent_id), item]));
    const taskByCompany = new Map();
    for (const task of tasks) {
      if (task.company_id == null) continue;
      const key = Number(task.company_id);
      taskByCompany.set(key, (taskByCompany.get(key) || []).concat(task));
    }

    let publishJobs = [];
    let publishJobsAvailable = true;
    const publishResult = await supabase.from('social_publish_jobs')
      .select('id,task_id,provider,account_id,status,provider_url,error,attempts,created_at,published_at')
      .order('id', { ascending: false }).limit(200);
    if (publishResult.error) {
      publishJobsAvailable = false;
    } else {
      publishJobs = publishResult.data || [];
    }

    const companyReport = companies.map(company => {
      const companyId = Number(company.id);
      const memberIds = new Set(activeMemberships.filter(item => Number(item.company_id) === companyId).map(item => Number(item.agent_id)));
      const companyAgents = agents.filter(agent => memberIds.has(Number(agent.id))).map(agent => ({
        id: agent.id,
        name: agent.name,
        runtime_status: agent.status,
        lifecycle_status: profileByAgent.get(Number(agent.id))?.lifecycle_status || 'missing_profile',
        active_membership: true,
      }));
      const companyTasks = taskByCompany.get(companyId) || [];
      return {
        id: company.id,
        name: company.name,
        building_slug: company.building_slug,
        active_worker_count: companyAgents.length,
        workers: companyAgents,
        task_counts: groupCount(companyTasks, 'status'),
        deliverable_counts: groupCount(companyTasks, 'deliverable_type'),
        tasks_without_assigned_agent: companyTasks.filter(task => !task.assigned_agent_id).length,
        missing_active_worker: companyAgents.length === 0,
      };
    });

    const agentReport = agents.map(agent => {
      const profile = profileByAgent.get(Number(agent.id));
      const assignedTasks = tasks.filter(task => Number(task.assigned_agent_id) === Number(agent.id));
      return {
        id: agent.id,
        name: agent.name,
        runtime_status: agent.status,
        lifecycle_status: profile?.lifecycle_status || 'missing_profile',
        company_id: profile?.company_id ?? null,
        active_company_membership: activeCompanyAgentIds.has(Number(agent.id)),
        assigned_task_counts: groupCount(assignedTasks, 'status'),
      };
    });

    return res.status(200).json({
      generated_at: new Date().toISOString(),
      report_scope: 'database-backed snapshot; configuration presence is not counted as execution',
      totals: {
        companies: companies.length,
        agents: agents.length,
        tasks: tasks.length,
        outputs: outputs.length,
      },
      task_counts: groupCount(tasks, 'status'),
      task_deliverable_counts: groupCount(tasks, 'deliverable_type'),
      output_counts: groupCount(outputs, 'status'),
      publish_jobs_available: publishJobsAvailable,
      publish_job_counts: groupCount(publishJobs, 'status'),
      recent_publish_jobs: publishJobs.slice(0, 50),
      companies: companyReport,
      agents: agentReport,
      recent_tasks: tasks.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, 100),
    });
  } catch (error) {
    console.error('Execution report failed:', String(error?.message || error).slice(0, 500));
    return res.status(500).json({ error: 'Execution report could not read all required runtime tables' });
  }
}
