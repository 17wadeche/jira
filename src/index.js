import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';

const resolver = new Resolver();

const DEFAULT_JQL = 'filter = "Replan - Business Testing & Approval"';

const DEFAULT_DONE_STATUSES = [
  'Done',
  'Closed',
  'Resolved',
  'Completed',
  'Approved',
  'Business Approved'
];

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

async function jiraJson(path, options = {}) {
  const response = await api.asUser().requestJira(path, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Jira API failed: ${response.status} ${text}`);
  }

  return response.json();
}

async function searchIssues(jql) {
  const allIssues = [];
  let nextPageToken = undefined;

  do {
    const body = {
      jql,
      maxResults: 100,
      fields: [
        'summary',
        'status',
        'created',
        'updated',
        'resolutiondate',
        'assignee',
        'parent'
      ]
    };

    if (nextPageToken) {
      body.nextPageToken = nextPageToken;
    }

    const response = await jiraJson(route`/rest/api/3/search/jql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    allIssues.push(...(response.issues || []));
    nextPageToken = response.nextPageToken;
  } while (nextPageToken && allIssues.length < 500);

  return allIssues;
}

async function getIssueChangelog(issueKey) {
  const histories = [];
  let startAt = 0;
  let total = 0;

  do {
    const response = await jiraJson(
      route`/rest/api/3/issue/${issueKey}/changelog?startAt=${startAt}&maxResults=100`
    );

    histories.push(...(response.values || []));
    total = response.total || 0;
    startAt += response.maxResults || 100;
  } while (startAt < total && histories.length < 500);

  return histories;
}

function findCompletedDate(issue, histories, doneStatuses) {
  const doneSet = new Set(doneStatuses.map(normalize));

  const sorted = [...histories].sort(
    (a, b) => new Date(a.created) - new Date(b.created)
  );

  for (const history of sorted) {
    for (const item of history.items || []) {
      if (item.field === 'status' && doneSet.has(normalize(item.toString))) {
        return history.created;
      }
    }
  }

  const currentStatus = issue.fields?.status?.name;
  if (doneSet.has(normalize(currentStatus))) {
    return issue.fields?.resolutiondate || issue.fields?.updated || issue.fields?.created;
  }

  return null;
}

function buildSeries(enrichedIssues) {
  const today = new Date();
  const thisWeekStart = startOfWeek(today);
  const chartStart = addDays(thisWeekStart, -77); // 12 weekly points

  const buckets = Array.from({ length: 12 }, (_, index) => {
    const start = addDays(chartStart, index * 7);
    const end = addDays(start, 6);
    end.setHours(23, 59, 59, 999);

    return {
      label: `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      start,
      end
    };
  });

  const series = buckets.map((bucket) => {
    const total = enrichedIssues.filter((issue) => {
      return new Date(issue.created) <= bucket.end;
    }).length;

    const completed = enrichedIssues.filter((issue) => {
      return issue.completedDate && new Date(issue.completedDate) <= bucket.end;
    }).length;

    const remaining = Math.max(total - completed, 0);

    return {
      label: bucket.label,
      date: formatDate(bucket.end),
      total,
      completed,
      remaining
    };
  });

  const current = series[series.length - 1] || {
    total: 0,
    completed: 0,
    remaining: 0
  };

  const first = series[0] || {
    total: 0
  };

  const completedPercent =
    current.total > 0 ? Math.round((current.completed / current.total) * 100) : 0;

  const scopeChange = current.total - first.total;

  return {
    series,
    metrics: {
      totalWork: current.total,
      completedWork: current.completed,
      remainingWork: current.remaining,
      completedPercent,
      scopeChange,
      activeInterval: current.remaining
    }
  };
}

resolver.define('getBurndownData', async ({ payload }) => {
  const jql = payload?.jql || DEFAULT_JQL;
  const doneStatuses = payload?.doneStatuses || DEFAULT_DONE_STATUSES;

  const issues = await searchIssues(jql);

  const enrichedIssues = [];

  for (const issue of issues) {
    const histories = await getIssueChangelog(issue.key);

    enrichedIssues.push({
      key: issue.key,
      summary: issue.fields?.summary,
      status: issue.fields?.status?.name,
      created: issue.fields?.created,
      updated: issue.fields?.updated,
      completedDate: findCompletedDate(issue, histories, doneStatuses)
    });
  }

  return {
    jql,
    doneStatuses,
    issueCount: enrichedIssues.length,
    ...buildSeries(enrichedIssues)
  };
});

export const handler = resolver.getDefinitions();