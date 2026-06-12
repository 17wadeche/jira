import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';

const resolver = new Resolver();

const DEFAULT_CONFIG = {
  jql: 'filter = "Replan - Business Testing & Approval"',
  doneStatuses: ['Done', 'Closed', 'Resolved', 'Completed', 'Approved', 'Business Approved'],
  rangeCount: 6,
  rangeUnit: 'biweeks',
  groupBy: 'weekly',
  showCompleted: true,
  showRemaining: true,
  showTotal: true,
  showValueLabels: true,
  showForecast: true,
  showBreakdown: true,
  showRemainingIssues: true
};

function startOfWeek(date) {
  const result = new Date(date);
  result.setDate(result.getDate() - result.getDay());
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function parseDoneStatuses(value) {
  if (Array.isArray(value)) return value;
  return String(value || DEFAULT_CONFIG.doneStatuses.join(','))
    .split(',')
    .map((status) => status.trim())
    .filter(Boolean);
}

async function jiraJson(path, options = {}) {
  // asUser() ensures Jira performs its normal permission checks for the person
  // viewing the dashboard. The gadget never receives issues they cannot browse.
  const response = await api.asUser().requestJira(path, {
    ...options,
    headers: { Accept: 'application/json', ...(options.headers || {}) }
  });

  if (!response.ok) {
    throw new Error(`Jira API failed (${response.status}): ${await response.text()}`);
  }

  return response.json();
}

async function searchIssues(jql) {
  const issues = [];
  let nextPageToken;

  do {
    const body = {
      jql,
      maxResults: 100,
      fields: ['summary', 'status', 'issuetype', 'created', 'updated', 'resolutiondate', 'assignee', 'parent']
    };
    if (nextPageToken) body.nextPageToken = nextPageToken;

    const page = await jiraJson(route`/rest/api/3/search/jql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    issues.push(...(page.issues || []));
    nextPageToken = page.nextPageToken;
  } while (nextPageToken && issues.length < 500);

  return issues;
}

async function getIssueChangelog(issueKey) {
  const histories = [];
  let startAt = 0;
  let total = 0;

  do {
    const page = await jiraJson(route`/rest/api/3/issue/${issueKey}/changelog?startAt=${startAt}&maxResults=100`);
    histories.push(...(page.values || []));
    total = page.total || 0;
    startAt += page.maxResults || 100;
  } while (startAt < total && histories.length < 500);

  return histories;
}

function findCompletedDate(issue, histories, doneStatuses) {
  const doneSet = new Set(doneStatuses.map(normalize));
  const sorted = [...histories].sort((a, b) => new Date(a.created) - new Date(b.created));

  for (const history of sorted) {
    for (const item of history.items || []) {
      if (item.field === 'status' && doneSet.has(normalize(item.toString))) return history.created;
    }
  }

  if (doneSet.has(normalize(issue.fields?.status?.name))) {
    return issue.fields?.resolutiondate || issue.fields?.updated || issue.fields?.created;
  }

  return null;
}

function buildSeries(issues, config) {
  const groupDays = { daily: 1, weekly: 7, biweekly: 14, monthly: 30, quarterly: 91 }[config.groupBy] || 7;
  const rangeDays = { days: 1, weeks: 7, biweeks: 14, months: 30, quarters: 91 }[config.rangeUnit] || 14;
  const pointCount = Math.max(4, Math.min(18, Math.ceil((Number(config.rangeCount) * rangeDays) / groupDays)));
  const currentStart = startOfWeek(new Date());
  const chartStart = addDays(currentStart, -(pointCount - 1) * groupDays);

  const series = Array.from({ length: pointCount }, (_, index) => {
    const start = addDays(chartStart, index * groupDays);
    const end = addDays(start, groupDays - 1);
    end.setHours(23, 59, 59, 999);
    const total = issues.filter((issue) => new Date(issue.created) <= end).length;
    const completed = issues.filter((issue) => issue.completedDate && new Date(issue.completedDate) <= end).length;
    return {
      label: `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      total,
      completed,
      remaining: Math.max(total - completed, 0)
    };
  });

  const current = series[series.length - 1] || { total: 0, completed: 0, remaining: 0 };
  const first = series[0] || { total: 0 };
  return {
    series,
    metrics: {
      totalWork: current.total,
      completedWork: current.completed,
      remainingWork: current.remaining,
      activeInterval: current.remaining,
      completedPercent: current.total ? Math.round((current.completed / current.total) * 100) : 0,
      scopeChange: current.total - first.total
    }
  };
}

function buildForecast(series) {
  const current = series[series.length - 1] || { remaining: 0 };
  const velocities = series.slice(1).map((point, index) => Math.max(0, point.completed - series[index].completed)).filter(Boolean);
  const average = velocities.length ? Math.max(1, Math.round(velocities.reduce((sum, value) => sum + value, 0) / velocities.length)) : 1;
  const max = Math.max(average, ...velocities, 1);
  const min = Math.max(1, Math.min(...(velocities.length ? velocities : [average])));
  const row = (label, key, velocity) => ({
    label,
    key,
    type: 'Auto',
    velocity,
    intervals: Math.ceil(current.remaining / velocity),
    completeDate: addDays(new Date(), Math.ceil(current.remaining / velocity) * 7).toLocaleDateString('en-US')
  });
  return [row('Max', 'max', max), row('Average', 'average', average), row('Min', 'min', min)];
}

function buildBreakdown(issues) {
  const map = new Map();
  for (const issue of issues) {
    const parent = issue.parent || 'No parent';
    const type = issue.issueType || 'Other';
    if (!map.has(parent)) map.set(parent, new Map());
    map.get(parent).set(type, (map.get(parent).get(type) || 0) + 1);
  }
  const total = issues.length;
  return {
    total,
    groups: [...map.entries()].map(([label, children]) => {
      const groupTotal = [...children.values()].reduce((sum, value) => sum + value, 0);
      return {
        label,
        total: groupTotal,
        percent: total ? Math.round((groupTotal / total) * 100) : 0,
        children: [...children.entries()].map(([childLabel, childTotal]) => ({
          label: childLabel,
          total: childTotal,
          percent: groupTotal ? Math.round((childTotal / groupTotal) * 100) : 0
        }))
      };
    })
  };
}

resolver.define('getBurndownData', async ({ payload }) => {
  const config = { ...DEFAULT_CONFIG, ...(payload?.config || {}), jql: payload?.jql || payload?.config?.jql || DEFAULT_CONFIG.jql };
  const doneStatuses = parseDoneStatuses(config.doneStatuses);
  const rawIssues = await searchIssues(config.jql);

  // Changelogs are deliberately collected in small batches. This prevents a
  // large filter from exhausting Jira's concurrent request limits.
  const issues = [];
  for (let index = 0; index < rawIssues.length; index += 8) {
    const batch = rawIssues.slice(index, index + 8);
    issues.push(...await Promise.all(batch.map(async (issue) => ({
      key: issue.key,
      summary: issue.fields?.summary || '',
      status: issue.fields?.status?.name || 'Unknown',
      assignee: issue.fields?.assignee?.displayName || 'Unassigned',
      issueType: issue.fields?.issuetype?.name || 'Other',
      parent: issue.fields?.parent?.key || 'No parent',
      created: issue.fields?.created,
      completedDate: findCompletedDate(issue, await getIssueChangelog(issue.key), doneStatuses)
    }))));
  }

  const chart = buildSeries(issues, config);
  const remainingIssues = issues.filter((issue) => !issue.completedDate).map((issue) => ({ ...issue, url: `/browse/${issue.key}` }));
  return {
    config,
    doneStatuses,
    issueCount: issues.length,
    ...chart,
    forecast: buildForecast(chart.series),
    breakdown: buildBreakdown(remainingIssues),
    remainingIssues
  };
});

export const handler = resolver.getDefinitions();
