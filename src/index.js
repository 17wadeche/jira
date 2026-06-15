import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';

const resolver = new Resolver();

const DEFAULT_CONFIG = {
  jql: 'filter = "Replan - Business Testing & Approval - dash"',
  rangeMode: 'last',
  rangeCount: 6,
  rangeUnit: 'biweeks',
  sinceDate: '',
  fixedFrom: '',
  fixedTo: '',
  groupBy: 'weekly',
  showCompleted: true,
  showRemaining: true,
  showTotal: true,
  showValueLabels: true,
  showForecast: true,
  forecastMonths: 1,
  showBreakdown: true,
  showRemainingIssues: true,
  assignees: [],
  peopleDisplay: 'combined'
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

function decodeHtmlEntities(value) {
  // Dashboard configuration can arrive HTML-escaped by its host context. Jira's
  // JQL API expects the original characters, so decode the small, predictable
  // set of entities that can legitimately appear in a JQL expression.
  const namedEntities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
  return String(value || '').replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (entity, code) => {
    if (code[0] !== '#') return namedEntities[code.toLowerCase()];
    const radix = code[1].toLowerCase() === 'x' ? 16 : 10;
    const digits = radix === 16 ? code.slice(2) : code.slice(1);
    return String.fromCodePoint(Number.parseInt(digits, radix));
  });
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

const COMPLETION_FIELD_NAME = 'Business Tested & Approved';
const COMPLETION_FROM_VALUE = 'Reviewing';
const COMPLETION_TO_VALUE = 'Ready for Review (Demoed)';

async function findCompletionField() {
  // Jira custom-field IDs vary between sites. Looking up the ID by its stable,
  // customer-facing name keeps this single-site app readable without hard-coding
  // an opaque customfield_12345 value in source control.
  const fields = await jiraJson(route`/rest/api/3/field`);
  const field = fields.find((candidate) => candidate.name === COMPLETION_FIELD_NAME);

  if (!field) {
    throw new Error(`Jira field "${COMPLETION_FIELD_NAME}" was not found.`);
  }

  return field;
}

async function searchIssues(jql, completionFieldId) {
  const issues = [];
  let nextPageToken;

  do {
    // These are the only Jira fields needed to calculate the chart, group the
    // remaining work, and render the issue table requested by the customer.
    const body = {
      jql,
      maxResults: 100,
      fields: ['summary', completionFieldId, 'assignee', 'parent', 'updated', 'created', 'issuetype', 'labels']
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

async function fetchCompletionHistories(issues, completionFieldId) {
  if (!issues.length) return new Map();

  const historiesByIssueId = new Map();
  let nextPageToken;

  do {
    // Bulk-fetching the one relevant field's history avoids making a separate
    // changelog request for every issue and keeps large dashboard filters fast.
    const body = {
      issueIdsOrKeys: issues.map((issue) => issue.id),
      fieldIds: [completionFieldId],
      maxResults: 1000
    };
    if (nextPageToken) body.nextPageToken = nextPageToken;

    const page = await jiraJson(route`/rest/api/3/changelog/bulkfetch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    for (const issueChangeLog of page.issueChangeLogs || []) {
      const current = historiesByIssueId.get(issueChangeLog.issueId) || [];
      historiesByIssueId.set(issueChangeLog.issueId, current.concat(issueChangeLog.changeHistories || []));
    }

    nextPageToken = page.nextPageToken;
  } while (nextPageToken);

  return historiesByIssueId;
}

function findCompletedDate(issue, histories, completionFieldId) {
  const hasRequestedTransition = histories.some((history) => (history.items || []).some((item) => (
    item.fieldId === completionFieldId &&
    normalize(item.fromString) === normalize(COMPLETION_FROM_VALUE) &&
    normalize(item.toString) === normalize(COMPLETION_TO_VALUE)
  )));

  // Per the customer's rule, Updated supplies the completion date after the
  // requested Business Tested & Approved transition has been confirmed.
  return hasRequestedTransition ? issue.fields?.updated || null : null;
}

function displayFieldValue(value) {
  if (Array.isArray(value)) return value.map(displayFieldValue).filter(Boolean).join(', ');
  if (value && typeof value === 'object') return value.value || value.name || value.displayName || '';
  return String(value || '');
}

function buildSeries(issues, config) {
  const groupDays = { daily: 1, weekly: 7, biweekly: 14, monthly: 30, quarterly: 91 }[config.groupBy] || 7;
  const rangeDays = { days: 1, weeks: 7, biweeks: 14, months: 30, quarters: 91 }[config.rangeUnit] || 14;
  const today = new Date();
  const parseDate = (value) => value ? new Date(`${value}T00:00:00`) : null;
  const selectedStart = config.rangeMode === 'since' ? parseDate(config.sinceDate) : parseDate(config.fixedFrom);
  const selectedEnd = config.rangeMode === 'fixed' ? parseDate(config.fixedTo) : today;
  const usesSelectedDates = ['since', 'fixed'].includes(config.rangeMode) && selectedStart && selectedEnd && selectedStart <= selectedEnd;
  const selectedDayCount = usesSelectedDates ? Math.floor((selectedEnd - selectedStart) / 86400000) + 1 : 0;
  const pointCount = usesSelectedDates
    ? Math.max(1, Math.min(18, Math.ceil(selectedDayCount / groupDays)))
    : Math.max(4, Math.min(18, Math.ceil((Number(config.rangeCount) * rangeDays) / groupDays)));
  const chartStart = usesSelectedDates ? selectedStart : addDays(startOfWeek(today), -(pointCount - 1) * groupDays);

  const series = Array.from({ length: pointCount }, (_, index) => {
    const start = addDays(chartStart, index * groupDays);
    const naturalEnd = addDays(start, groupDays - 1);
    const end = usesSelectedDates && naturalEnd > selectedEnd ? new Date(selectedEnd) : naturalEnd;
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
      // Active interval is the work completed during the latest reporting bucket,
      // not another name for all remaining work.
      activeInterval: Math.max(0, current.completed - (series[series.length - 2]?.completed || 0)),
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
  const config = { ...DEFAULT_CONFIG, ...(payload?.config || {}), jql: decodeHtmlEntities(payload?.jql || payload?.config?.jql || DEFAULT_CONFIG.jql) };
  const completionField = await findCompletionField();
  const rawIssues = await searchIssues(config.jql, completionField.id);
  const historiesByIssueId = await fetchCompletionHistories(rawIssues, completionField.id);

  const issues = rawIssues.map((issue) => ({
    key: issue.key,
    summary: issue.fields?.summary || '',
    businessTestedApproved: displayFieldValue(issue.fields?.[completionField.id]) || 'Not set',
    assignee: issue.fields?.assignee?.displayName || 'Unassigned',
    labels: issue.fields?.labels || [],
    issueType: issue.fields?.issuetype?.name || 'Other',
    parent: issue.fields?.parent?.key || 'No parent',
    updated: issue.fields?.updated,
    created: issue.fields?.created,
    completedDate: findCompletedDate(issue, historiesByIssueId.get(issue.id) || [], completionField.id)
  }));

  // Keep the complete assignee list available so the dashboard defaults to an
  // all-people view while still allowing a viewer to focus on one person.
  const assignees = [...new Set(issues.map((issue) => issue.assignee))].sort((a, b) => a.localeCompare(b));
  const labels = [...new Set(issues.flatMap((issue) => issue.labels))].sort((a, b) => a.localeCompare(b));
  const selectedAssignees = Array.isArray(config.assignees) && config.assignees.length
    ? config.assignees
    : config.assignee && config.assignee !== 'all' ? [config.assignee] : [];
  // Label groups share the people picker by using a namespaced selector value.
  // This avoids collisions when a Jira label happens to match a person's display name.
  const matchesSelector = (issue, selector) => selector.startsWith('label:')
    ? issue.labels.includes(selector.slice(6))
    : issue.assignee === selector;
  const filteredIssues = selectedAssignees.length
    ? issues.filter((issue) => selectedAssignees.some((selector) => matchesSelector(issue, selector)))
    : issues;
  const chart = buildSeries(filteredIssues, config);
  const personSeries = selectedAssignees.length > 1
    ? selectedAssignees.map((assignee) => {
      const series = buildSeries(issues.filter((issue) => matchesSelector(issue, assignee)), config).series;
      return { assignee: assignee.replace(/^label:/, ''), series, forecast: buildForecast(series) };
    })
    : [];
  const remainingIssues = filteredIssues.filter((issue) => !issue.completedDate).map((issue) => ({ ...issue, url: `/browse/${issue.key}` }));
  return {
    config,
    completionRule: {
      field: COMPLETION_FIELD_NAME,
      from: COMPLETION_FROM_VALUE,
      to: COMPLETION_TO_VALUE
    },
    issueCount: filteredIssues.length,
    assignees,
    labels,
    personSeries,
    ...chart,
    forecast: buildForecast(chart.series),
    breakdown: buildBreakdown(remainingIssues),
    remainingIssues
  };
});

export const handler = resolver.getDefinitions();
