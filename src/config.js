export const PEOPLE_GROUP_LABEL = 'BizTestTeam';
export const PEOPLE_GROUP_SELECTOR = `label:${PEOPLE_GROUP_LABEL}`;
export const COMPLETION_STATUS_OPTIONS = ['Approved', 'Ready for Review (Demoed)'];
export const DEFAULT_CONFIG = {
  jql: 'filter = "Replan - Business Testing & Approval - dash"',
  rangeMode: 'since',
  rangeCount: 6,
  rangeUnit: 'biweeks',
  sinceDate: '2026-06-01',
  fixedFrom: '',
  fixedTo: '',
  groupBy: 'weekly',
  showCompleted: true,
  showRemaining: true,
  showTotal: true,
  showValueLabels: true,
  showForecast: true,
  forecastMonths: 1,
  capacityCoefficient: 100,
  scenarioMax: true,
  scenarioAverage: true,
  scenarioMin: true,
  showBreakdown: true,
  showRemainingIssues: true,
  assignees: [],
  peopleDisplay: 'combined',
  targetLabel: PEOPLE_GROUP_LABEL,
  completionToValues: ['Ready for Review (Demoed)']
};
export const MOCK_DATA = {
  config: DEFAULT_CONFIG,
  metrics: { completedPercent: 72, scopeChange: 47, completedWork: 92, activeInterval: 0, remainingWork: 47, totalWork: 168 },
  series: [
    ['Feb 1 - Feb 7', 121, 0, 121], ['Feb 8 - Feb 14', 121, 10, 111], ['Feb 15 - Feb 21', 121, 10, 111], ['Feb 22 - Feb 28', 121, 16, 105],
    ['Feb 29 - Mar 6', 121, 34, 87], ['Mar 7 - Mar 13', 121, 34, 87], ['Mar 14 - Mar 20', 121, 52, 69], ['Mar 21 - Mar 27', 121, 52, 69],
    ['Mar 28 - Apr 3', 121, 64, 57], ['Apr 4 - Apr 10', 168, 64, 104], ['Apr 11 - Apr 17', 168, 92, 76], ['Apr 18 - Apr 24', 168, 92, 47]
  ].map(([label, total, completed, remaining]) => ({ label, total, completed, remaining })),
  forecast: [
    { label: 'Max', key: 'max', type: 'Auto', velocity: 28, completeDate: '05/08/2024', intervals: 2 },
    { label: 'Average', key: 'average', type: 'Auto', velocity: 8, completeDate: '06/05/2024', intervals: 6 },
    { label: 'Min', key: 'min', type: 'Auto', velocity: 12, completeDate: '05/22/2024', intervals: 4 }
  ],
  breakdown: { total: 47, groups: [
    { label: 'TWD Complaints', total: 22, percent: 47, children: [{ label: 'Bug', total: 8, percent: 36 }, { label: 'Story', total: 9, percent: 41 }, { label: 'Task', total: 5, percent: 23 }] },
    { label: 'Business Approval', total: 15, percent: 32, children: [{ label: 'Story', total: 9, percent: 60 }, { label: 'Task', total: 6, percent: 40 }] },
    { label: 'No parent', total: 10, percent: 21, children: [{ label: 'Task', total: 10, percent: 100 }] }
  ]},
  remainingIssues: [
    { key: 'TWD-47', summary: 'Validate complaint outcome and customer response', businessTestedApproved: 'Reviewing', assignee: 'Joe Alpha', parent: 'TWD-12', updated: '2024-04-23T15:30:00.000Z', url: '/browse/TWD-47' },
    { key: 'TWD-51', summary: 'Complete business approval evidence', businessTestedApproved: 'Not set', assignee: 'Joe Alpha', parent: 'TWD-12', updated: '2024-04-22T12:15:00.000Z', url: '/browse/TWD-51' },
    { key: 'TWD-58', summary: 'Prepare final complaint resolution', businessTestedApproved: 'Reviewing', assignee: 'Unassigned', parent: 'No parent', updated: '2024-04-19T09:45:00.000Z', url: '/browse/TWD-58' }
  ]
};
