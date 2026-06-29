import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';
import { DEFAULT_CONFIG, PEOPLE_GROUP_LABEL } from './config';
const resolver = new Resolver();
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
  const namedEntities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
  return String(value || '').replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (entity, code) => {
    if (code[0] !== '#') return namedEntities[code.toLowerCase()];
    const radix = code[1].toLowerCase() === 'x' ? 16 : 10;
    const digits = radix === 16 ? code.slice(2) : code.slice(1);
    return String.fromCodePoint(Number.parseInt(digits, radix));
  });
}
async function jiraJson(path, options = {}) {
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
const DEFAULT_COMPLETION_TO_VALUES = ['Ready for Review (Demoed)'];
async function findCompletionField() {
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
function findCompletedDate(issue, histories, completionFieldId, completionToValues) {
  const targetValues = (Array.isArray(completionToValues) && completionToValues.length ? completionToValues : DEFAULT_COMPLETION_TO_VALUES).map(normalize);
  const currentValue = normalize(displayFieldValue(issue.fields?.[completionFieldId]));
  const currentlyMatchesTarget = targetValues.includes(currentValue);
  const hasRequestedTransition = histories.some((history) => (history.items || []).some((item) => (
    item.fieldId === completionFieldId &&
    targetValues.includes(normalize(item.toString))
  )));
  if (!currentlyMatchesTarget) return null;
  return hasRequestedTransition || currentlyMatchesTarget ? issue.fields?.updated || null : null;
}
function displayFieldValue(value) {
  if (Array.isArray(value)) return value.map(displayFieldValue).filter(Boolean).join(', ');
  if (value && typeof value === 'object') return value.value || value.name || value.displayName || '';
  return String(value || '');
}
function buildSeries(issues, config, options = {}) {
  const groupDays = { daily: 1, weekly: 7, biweekly: 14, monthly: 30, quarterly: 91 }[config.groupBy] || 7;
  const maxPointCount = Number(options.maxPointCount) || 18;
  const rangeDays = { days: 1, weeks: 7, biweeks: 14, months: 30, quarters: 91 }[config.rangeUnit] || 14;
  const today = new Date();
  const parseDate = (value) => value ? new Date(`${value}T00:00:00`) : null;
  const selectedStart = config.rangeMode === 'since' ? parseDate(config.sinceDate) : parseDate(config.fixedFrom);
  const selectedEnd = config.rangeMode === 'fixed' ? parseDate(config.fixedTo) : today;
  const usesSelectedDates = ['since', 'fixed'].includes(config.rangeMode) && selectedStart && selectedEnd && selectedStart <= selectedEnd;
  const selectedDayCount = usesSelectedDates ? Math.floor((selectedEnd - selectedStart) / 86400000) + 1 : 0;
  const pointCount = usesSelectedDates
    ? Math.max(1, Math.min(maxPointCount, Math.ceil(selectedDayCount / groupDays)))
    : Math.max(4, Math.min(maxPointCount, Math.ceil((Number(config.rangeCount) * rangeDays) / groupDays)));
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
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      groupDays,
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
      activeInterval: Math.max(0, current.completed - (series[series.length - 2]?.completed || 0)),
      completedPercent: current.total ? Math.round((current.completed / current.total) * 100) : 0,
      scopeChange: current.total - first.total
    }
  };
}
function dailyVelocities(series) {
  return series.slice(1).map((point, index) => Math.max(0, point.completed - series[index].completed)).filter(Boolean);
}
function buildForecast(series) {
  const current = series[series.length - 1] || { remaining: 0 };
  const velocities = dailyVelocities(series);
  const average = velocities.length ? Math.max(1, Math.round(velocities.reduce((sum, value) => sum + value, 0) / velocities.length)) : 1;
  const max = Math.max(average, ...velocities, 1);
  const min = Math.max(1, Math.min(...(velocities.length ? velocities : [average])));
  const row = (label, key, velocity) => {
    const intervals = Math.ceil(current.remaining / velocity);
    return {
      label,
      key,
      type: 'Auto',
      velocity,
      intervals,
      intervalUnit: 'days',
      completeDate: addDays(new Date(), intervals).toLocaleDateString('en-US')
    };
  };
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
    completedDate: findCompletedDate(issue, historiesByIssueId.get(issue.id) || [], completionField.id, config.completionToValues)
  }));
  const assignees = [...new Set(issues.map((issue) => issue.assignee))].sort((a, b) => a.localeCompare(b));
  const teamLabel = config.targetLabel || PEOPLE_GROUP_LABEL;
  const labels = issues.some((issue) => issue.labels.includes(teamLabel)) ? [teamLabel] : [];
  const selectedAssignees = Array.isArray(config.assignees) && config.assignees.length
    ? config.assignees
    : config.assignee && config.assignee !== 'all' ? [config.assignee] : [];
  const matchesSelector = (issue, selector) => selector.startsWith('label:')
    ? issue.labels.includes(selector.slice(6))
    : issue.assignee === selector;
  const filteredIssues = selectedAssignees.length
    ? issues.filter((issue) => selectedAssignees.some((selector) => matchesSelector(issue, selector)))
    : issues;
  const chart = buildSeries(filteredIssues, config);
  const forecastSeries = buildSeries(filteredIssues, { ...config, groupBy: 'daily' }, { maxPointCount: 366 }).series;
  const selectedLabelGroups = selectedAssignees.filter((selector) => selector.startsWith('label:'));
  const groupMemberAssignees = selectedLabelGroups.flatMap((selector) => (
    [...new Set(issues.filter((issue) => matchesSelector(issue, selector)).map((issue) => issue.assignee))]
      .sort((a, b) => a.localeCompare(b))
  ));
  const individualSelectors = selectedAssignees.filter((selector) => !selector.startsWith('label:'));
  const personSeriesSelectors = [...new Set([...groupMemberAssignees, ...individualSelectors])];
  const personSeries = personSeriesSelectors.length > 1
    ? personSeriesSelectors.map((assignee) => {
      const assigneeIssues = issues.filter((issue) => matchesSelector(issue, assignee));
      const series = buildSeries(assigneeIssues, config).series;
      const forecastSeries = buildSeries(assigneeIssues, { ...config, groupBy: 'daily' }, { maxPointCount: 366 }).series;
      return { assignee: assignee.replace(/^label:/, ''), series, forecast: buildForecast(forecastSeries) };
    })
    : [];
  const remainingIssues = filteredIssues.filter((issue) => !issue.completedDate).map((issue) => ({ ...issue, url: `/browse/${issue.key}` }));
  return {
    config,
    completionRule: {
      field: COMPLETION_FIELD_NAME,
      from: 'any previous value',
      to: Array.isArray(config.completionToValues) && config.completionToValues.length ? config.completionToValues : DEFAULT_COMPLETION_TO_VALUES
    },
    issueCount: filteredIssues.length,
    assignees,
    labels,
    personSeries,
    ...chart,
    forecast: buildForecast(forecastSeries),
    breakdown: buildBreakdown(remainingIssues),
    remainingIssues
  };
});
export const handler = resolver.getDefinitions();