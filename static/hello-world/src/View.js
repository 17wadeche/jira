import React, { useEffect, useMemo, useState } from 'react';
import { COMPLETION_STATUS_OPTIONS, DEFAULT_CONFIG, MOCK_DATA, PEOPLE_GROUP_LABEL } from './config';
import './App.css';
const isLocalPreview = () => ['localhost', '127.0.0.1'].includes(window.location.hostname);
const DASHBOARD_CONFIG_STORAGE_PREFIX = 'jira-dashboard:last-view-config';
function dashboardConfigStorageKey(context) {
  const extension = context?.extension || {};
  const dashboard = extension.dashboard || context?.dashboard || {};
  const location = typeof window !== 'undefined'
    ? `${window.location.pathname}${window.location.search}`
    : '';
  const contextKey = [
    context?.cloudId,
    dashboard.id || dashboard.dashboardId || extension.dashboardId || context?.dashboardId,
    extension.gadgetId,
    extension.localId || context?.localId,
    extension.id,
    context?.moduleKey || extension.moduleKey,
    location
  ]
    .filter(Boolean)
    .join(':');
  return `${DASHBOARD_CONFIG_STORAGE_PREFIX}:${contextKey || 'default'}`;
}
function readSavedDashboardConfig(storageKey) {
  try {
    const value = window.localStorage.getItem(storageKey);
    return value ? JSON.parse(value) : {};
  } catch (error) {
    console.warn('Could not read saved dashboard configuration.', error);
    return {};
  }
}
function saveDashboardConfig(storageKey, config) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(config));
    return true;
  } catch (error) {
    console.warn('Could not save dashboard configuration.', error);
    return false;
  }
}
const displayValue = (value) => String(value || '').replace(/(^|[-_])\w/g, (match) => match.replace(/[-_]/, ' ').toUpperCase());
const decodeJql = (value) => String(value || '').replace(/&(?:amp|#38|#x26);/gi, '&');
function forecastIntervalLimit(config) {
  const months = Math.min(24, Math.max(1, Number(config.forecastMonths) || 1));
  const groupBy = config.groupBy || 'weekly';
  if (groupBy === 'monthly') return Math.ceil(months);
  if (groupBy === 'quarterly') return Math.ceil(months / 3);
  const today = new Date();
  const horizon = new Date(today);
  horizon.setMonth(horizon.getMonth() + months);
  const days = Math.max(1, Math.ceil((horizon - today) / 86400000));
  const daysPerInterval = groupBy === 'daily' ? 1 : groupBy === 'biweekly' ? 14 : 7;
  return Math.ceil(days / daysPerInterval);
}
function groupDays(config) {
  return { daily: 1, weekly: 7, biweekly: 14, monthly: 30, quarterly: 91 }[config.groupBy || 'weekly'] || 7;
}
function isWorkingDay(date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}
function forecastUsesWorkingDays(config) {
  return config.forecastDayMode === 'working';
}
function forecastDaysInInterval(series, interval, config) {
  const days = groupDays(config);
  if (!forecastUsesWorkingDays(config)) return days;
  const start = new Date(series[series.length - 1]?.endDate || Date.now());
  let count = 0;
  for (let dayOffset = ((interval - 1) * days) + 1; dayOffset <= interval * days; dayOffset += 1) {
    const date = new Date(start);
    date.setDate(date.getDate() + dayOffset);
    if (isWorkingDay(date)) count += 1;
  }
  return count;
}
function makeForecast(series, scenario, intervalLimit, config) {
  const points = [];
  const startingRemaining = Number(series[series.length - 1]?.remaining) || 0;
  const dailyVelocity = Math.max(0, Number(scenario?.velocity ?? scenario) || 0);
  let remaining = startingRemaining;
  const intervalCount = Math.min(104, intervalLimit);
  for (let interval = 1; interval <= intervalCount; interval += 1) {
    const intervalVelocity = dailyVelocity * forecastDaysInInterval(series, interval, config);
    remaining = intervalVelocity > 0 ? Math.max(0, remaining - intervalVelocity) : remaining;
    points.push({ label:`Forecast ${interval}`, remaining, complete: dailyVelocity > 0 && remaining === 0 });
    if (remaining === 0) break;
  }
  return points;
}
function Chart({ series, config, forecast, personSeries = [] }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const width = 1180, height = 390, padding = { top:36, right:34, bottom:92, left:54 };
  const scenarios = forecast?.length ? forecast : [{key:'max',velocity:28},{key:'average',velocity:8},{key:'min',velocity:12}];
  const activeScenarios = scenarios.filter((scenario) => config[`scenario${displayValue(scenario.key).replace(/\s/g, '')}`] !== false);
  const forecastLimit = forecastIntervalLimit(config);
  const separatePeople = config.peopleDisplay === 'separate' && personSeries.length > 1;
  const personScenarios = (person) => activeScenarios.map((scenario) =>
    (person.forecast || []).find((personScenario) => personScenario.key === scenario.key) || scenario
  );
  const longestForecast = config.showForecast !== false && activeScenarios.length ? forecastLimit : 0;
  const personValues = personSeries.flatMap((person) => person.series.flatMap((point) => [point.total, point.completed, point.remaining]));
  const scaleValues = separatePeople ? personValues : series.flatMap((point) => [point.total, point.completed, point.remaining]);
  const maxY = Math.max(10, ...scaleValues);
  const personColors = ['#0c66e4', '#bf63f3', '#e56910', '#22a06b', '#f15b50', '#6e5dc6'];
  const count = series.length + longestForecast;
  const xStep = (width - padding.left - padding.right) / Math.max(count - 1, 1);
  const x = (index) => padding.left + index * xStep;
  const y = (value) => padding.top + (height - padding.top - padding.bottom) * (1 - value / maxY);
  const path = (points, field, offset = 0) => points.map((point,index) => `${index ? 'L':'M'} ${x(index + offset)} ${y(point[field] || 0)}`).join(' ');
  const visible = (field) => config[`show${field[0].toUpperCase()}${field.slice(1)}`] !== false;
  const last = series[series.length - 1];
  const hovered = hoveredIndex === null ? null : series[hoveredIndex];
  const tooltipX = hoveredIndex !== null && x(hoveredIndex) > width - 300 ? x(hoveredIndex) - 250 : (hoveredIndex !== null ? x(hoveredIndex) + 12 : 0);
  const tooltipY = hovered ? Math.max(46, y(hovered.total) - 28) : 0;
  const completionLabel = (scenario, points, offset, lane = 0, prefix = '') => {
    const endpointIndex = offset + points.length - 1;
    if (!points.length || !points[points.length - 1].complete) return null;
    const endpointX = x(endpointIndex);
    const textAnchor = endpointX > width - 120 ? 'end' : endpointX < padding.left + 120 ? 'start' : 'middle';
    const labelX = endpointX + (textAnchor === 'end' ? -4 : textAnchor === 'start' ? 4 : 0);
    return <g className={`completionMarker ${scenario.key}Completion`}>
      <circle cx={endpointX} cy={y(0)} r="5"/>
      <line x1={endpointX} x2={endpointX} y1={y(0)+7} y2={y(0)+14+lane*16}/>
      <text x={labelX} y={y(0)+26+lane*16} textAnchor={textAnchor}>{prefix}{displayValue(scenario.key)} · {scenario.completeDate || `+${points.length} intervals`}</text>
    </g>;
  };
  return <svg viewBox={`0 0 ${width} ${height}`} className="chart" role="img" aria-label="Burndown chart with projected completion dates">
    {[0,.2,.4,.6,.8,1].map((tick) => <g key={tick}><line x1={padding.left} x2={width-padding.right} y1={y(maxY*tick)} y2={y(maxY*tick)} className="grid"/><text x="8" y={y(maxY*tick)+4} className="axisText">{Math.round(maxY*tick)}</text></g>)}
    {Array.from({length:count}).map((_,index) => <line key={index} x1={x(index)} x2={x(index)} y1={padding.top} y2={height-padding.bottom} className="grid"/>)}
    {config.showForecast !== false && longestForecast > 0 && <g className="forecastArea"><rect x={x(series.length-1)+xStep/2} y={padding.top} width={Math.max(0,width-padding.right-(x(series.length-1)+xStep/2))} height={height-padding.top-padding.bottom}/><text x={x(series.length-1)+xStep/2+10} y={padding.top+16}>Forecast → completion</text></g>}
    {series.map((point,index) => <rect key={`${point.label}-hover`} x={x(index)-xStep/2} y={padding.top} width={xStep} height={height-padding.top-padding.bottom} className={`intervalHitArea ${hoveredIndex===index?'active':''}`} onMouseEnter={()=>setHoveredIndex(index)} onMouseLeave={()=>setHoveredIndex(null)}/>)}
    {series.map((point,index) => <text key={point.label} x={x(index)} y={height-54} className="xLabel" transform={`rotate(-43 ${x(index)} ${height-54})`}>{point.label}</text>)}
    {!separatePeople && visible('total') && <path d={path(series,'total')} className="line totalLine"/>}
    {!separatePeople && visible('completed') && <path d={path(series,'completed')} className="line completedLine"/>}
    {!separatePeople && visible('remaining') && <path d={path(series,'remaining')} className="line remainingLine"/>}
    {separatePeople && personSeries.map((person, personIndex) => <g key={person.assignee} style={{color:personColors[personIndex % personColors.length]}}>
      {visible('remaining') && <path d={path(person.series, 'remaining')} className="line personLine personRemainingLine" style={{stroke:'currentColor'}}/>}
      {visible('completed') && <path d={path(person.series, 'completed')} className="line personLine personCompletedLine" style={{stroke:'currentColor'}}/>}
      {config.showForecast !== false && personScenarios(person).map((scenario) => {
        const points = makeForecast(person.series, scenario, forecastLimit, config);
        const preferredLabelIndex = { max:0, average:1, min:2 }[scenario.key] || 0;
        const labelIndex = Math.min(preferredLabelIndex, Math.max(points.length - 1, 0));
        const labelPoint = points[labelIndex];
        const labelOffset = { max:-9, average:3, min:15 }[scenario.key] || 0;
        return <g key={scenario.key}>
          <path d={`M ${x(person.series.length-1)} ${y(person.series[person.series.length-1]?.remaining || 0)} ${path(points,'remaining',person.series.length).replace('M','L')}`} className={`line personForecastLine ${scenario.key}Line`} style={{stroke:'currentColor'}}/>
          {labelPoint && <text x={x(person.series.length+labelIndex)+5} y={y(labelPoint.remaining)+labelOffset} className="personForecastLabel" style={{fill:'currentColor'}}>{person.assignee} · {displayValue(scenario.key)}</text>}
          {scenario.key === 'average' && completionLabel(scenario, points, person.series.length, personIndex, `${person.assignee}: `)}
        </g>;
      })}
    </g>)}
    {!separatePeople && config.showForecast !== false && activeScenarios.map((scenario, scenarioIndex) => { const points=makeForecast(series,scenario,forecastLimit,config); const labelIndex=Math.min(1,points.length-1); const labelPoint=points[labelIndex]; return <g key={scenario.key}><path d={`M ${x(series.length-1)} ${y(last.remaining)} ${path(points,'remaining',series.length).replace('M','L')}`} className={`line scenarioLine ${scenario.key}Line`}/>{labelPoint && <g transform={`translate(${x(series.length+labelIndex)-18} ${y(labelPoint.remaining)-10})`}><rect width={scenario.key==='average'?58:34} height="20" rx="10" className={`scenarioLabelBackground ${scenario.key}`}/><text x="7" y="14" className={`scenarioText ${scenario.key}`}>{displayValue(scenario.key)}</text></g>}{completionLabel(scenario, points, series.length, scenarioIndex)}</g>; })}
    {!separatePeople && series.map((point,index) => <g key={`${point.label}-dots`}>
      {['total','completed','remaining'].map((field) => visible(field) && <g key={field}><circle cx={x(index)} cy={y(point[field])} r="4" className={`dot ${field}Dot`}/>{config.showValueLabels !== false && <text x={x(index)+5} y={y(point[field])-7} className={`${field}Value valueLabel`}>{point[field]}</text>}</g>)}
    </g>)}
    {separatePeople && personSeries.flatMap((person, personIndex) => person.series.flatMap((point, index) => [
      visible('remaining') && <circle key={`${person.assignee}-${point.label}-remaining`} cx={x(index)} cy={y(point.remaining)} r="4" className="dot personDot personRemainingDot" style={{stroke:personColors[personIndex % personColors.length]}}/>,
      visible('completed') && <circle key={`${person.assignee}-${point.label}-completed`} cx={x(index)} cy={y(point.completed)} r="3" className="dot personDot personCompletedDot" style={{stroke:personColors[personIndex % personColors.length],fill:personColors[personIndex % personColors.length]}}/>
    ]))}
    {hovered && <g className="chartTooltip" pointerEvents="none"><rect x={tooltipX} y={tooltipY} width="238" height="146" rx="4"/><text x={tooltipX+12} y={tooltipY+22} className="tooltipTitle">{hovered.label}</text><text x={tooltipX+12} y={tooltipY+48}>Total work<tspan x={tooltipX+218} textAnchor="end">{hovered.total}</tspan></text><text x={tooltipX+12} y={tooltipY+70}>Remaining work<tspan x={tooltipX+218} textAnchor="end">{hovered.remaining}</tspan></text><text x={tooltipX+12} y={tooltipY+92}>Completed work<tspan x={tooltipX+218} textAnchor="end">{hovered.completed}</tspan></text><text x={tooltipX+12} y={tooltipY+114}>Velocity<tspan x={tooltipX+218} textAnchor="end">{hoveredIndex ? Math.max(0, hovered.completed-series[hoveredIndex-1].completed) : 0}</tspan></text><text x={tooltipX+12} y={tooltipY+136} className="tooltipHint">Current interval details</text></g>}
  </svg>;
}
function Menu({ name, openMenu, setOpenMenu, children }) {
  return <div className="menuWrap"><button className={`toolButton ${openMenu===name?'selected':''}`} onClick={() => setOpenMenu(openMenu===name?'':name)}>{displayValue(name)}⌄</button>{openMenu===name && <div className={`popover ${name}Popover`}>{children}</div>}</div>;
}
function rangeButtonLabel(config) {
  if (config.rangeMode === 'since') return config.sinceDate ? `Since → ${config.sinceDate}` : 'Since';
  if (config.rangeMode === 'fixed') return config.fixedFrom && config.fixedTo ? `Fixed → ${config.fixedFrom} – ${config.fixedTo}` : 'Fixed';
  return `Last → ${config.rangeCount} ${config.rangeUnit === 'biweeks' ? 'Bi-weeks' : displayValue(config.rangeUnit)}`;
}
function RangeDateInput({ label, value, min, max, onChange }) {
  return <label className="rangeDateField">
    <span className="srOnly">{label}</span>
    {!value && <span className="rangeDatePrompt" aria-hidden="true">{label}</span>}
    <input className={value ? 'hasValue' : ''} type="date" aria-label={label} value={value} min={min} max={max} onChange={onChange}/>
  </label>;
}
function RangeMenu({ config, openMenu, setOpenMenu, onApply }) {
  const [draft, setDraft] = useState(config);
  const isOpen = openMenu === 'range';
  useEffect(() => {
    if (isOpen) setDraft(config);
  }, [isOpen, config]);
  const update = (name, value) => setDraft((current) => ({ ...current, [name]: value }));
  const valid = draft.rangeMode === 'since'
    ? Boolean(draft.sinceDate)
    : draft.rangeMode === 'fixed'
      ? Boolean(draft.fixedFrom && draft.fixedTo && draft.fixedFrom <= draft.fixedTo)
      : Number(draft.rangeCount) > 0;
  return <div className="menuWrap">
    <button type="button" className={`toolButton ${isOpen ? 'selected' : ''}`} onClick={() => setOpenMenu(isOpen ? '' : 'range')}>{rangeButtonLabel(config)}⌄</button>
    {isOpen && <div className="popover rangePopover">
      <div className="rangeTabs" role="tablist" aria-label="Date range type">
        {['last', 'since', 'fixed'].map((mode) => <button type="button" role="tab" aria-selected={draft.rangeMode === mode} className={draft.rangeMode === mode ? 'active' : ''} key={mode} onClick={(event) => { event.stopPropagation(); update('rangeMode', mode); }}>{displayValue(mode)}</button>)}
      </div>
      {draft.rangeMode === 'last' && <div className="rangeForm lastRangeForm">
        <label><span className="srOnly">Number of intervals</span><input type="number" min="1" value={draft.rangeCount} onChange={(event) => update('rangeCount', event.target.value)}/></label>
        <label><span className="srOnly">Range unit</span><select value={String(draft.rangeUnit).toLowerCase()} onChange={(event) => update('rangeUnit', event.target.value)}><option value="days">Days</option><option value="weeks">Weeks</option><option value="biweeks">Bi-weeks</option><option value="months">Months</option><option value="quarters">Quarters</option></select></label>
      </div>}
      {draft.rangeMode === 'since' && <div className="rangeForm"><RangeDateInput label="Since" value={draft.sinceDate} onChange={(event) => update('sinceDate', event.target.value)}/></div>}
      {draft.rangeMode === 'fixed' && <div className="rangeForm fixedRangeForm">
        <RangeDateInput label="From" value={draft.fixedFrom} max={draft.fixedTo || undefined} onChange={(event) => update('fixedFrom', event.target.value)}/>
        <RangeDateInput label="To" value={draft.fixedTo} min={draft.fixedFrom || undefined} onChange={(event) => update('fixedTo', event.target.value)}/>
      </div>}
      <div className="popoverActions"><button type="button" onClick={() => setOpenMenu('')}>Cancel</button><button type="button" className="primaryButton" disabled={!valid} onClick={() => { setOpenMenu(''); onApply(draft); }}>Apply</button></div>
    </div>}
  </div>;
}
function Caret({ expanded }) {
  return <span className="caret" aria-hidden="true">{expanded ? '⌄' : '›'}</span>;
}
function CollapsiblePanel({ title, children, actions }) {
  const [expanded, setExpanded] = useState(true);
  return <section className="bottomPanel">
    <div className="panelTitle">
      <button className="collapseButton" type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        <Caret expanded={expanded}/>{title}
      </button>
      {actions}
    </div>
    {expanded && children}
  </section>;
}
function ForecastPanel({ rows, personSeries = [], config }) {
  const dayModeLabel = config.forecastDayMode === 'working' ? 'working-day' : 'all-day';
  const summary = `Based on ${dayModeLabel} daily forecast velocity, ${config.groupBy || 'weekly'} chart grouping, ${config.forecastMonths || 1}-month horizon, and ${config.capacityCoefficient || 100}% capacity allocation.`;
  const individualRows = personSeries.flatMap((person) => (person.forecast || []).map((row) => ({ ...row, assignee: person.assignee })));
  const displayedRows = individualRows.length ? individualRows : rows;
  return <CollapsiblePanel title="Forecast"><p className="forecastSummary">{summary}</p><table className="dataTable"><thead><tr>{individualRows.length > 0 && <th>Person</th>}<th>Label</th><th>Type</th><th>Velocity / day</th><th>Complete date</th><th>Intervals</th></tr></thead><tbody>{displayedRows.map((row)=><tr key={`${row.assignee || 'team'}-${row.key}`}>{individualRows.length > 0 && <td>{row.assignee}</td>}<td><i className={`scenarioBox ${row.key}`}/> {row.label}</td><td>{row.type}</td><td>{row.velocity}</td><td>{row.completeDate}</td><td>{row.intervals} {row.intervalUnit || 'weeks'}</td></tr>)}</tbody></table></CollapsiblePanel>;
}
function BreakdownPanel({ breakdown }) {
  const groups = breakdown?.groups || [];
  const [expandedGroups, setExpandedGroups] = useState(() => new Set(groups.map((group) => group.label)));
  const setAllGroups = (expanded) => setExpandedGroups(new Set(expanded ? groups.map((group) => group.label) : []));
  const toggleGroup = (label) => setExpandedGroups((current) => {
    const next = new Set(current);
    next.has(label) ? next.delete(label) : next.add(label);
    return next;
  });
  const actions = <span className="panelActions"><button type="button" onClick={() => setAllGroups(false)}>Collapse all</button><button type="button" onClick={() => setAllGroups(true)}>Expand all</button></span>;
  return <CollapsiblePanel title="Breakdown" actions={actions}><table className="dataTable"><thead><tr><th>Metrics</th><th>Total</th></tr></thead><tbody><tr className="highlightRow"><td><span className="caretPlaceholder">⌄</span><i className="legendDot remaining"/> Remaining work</td><td>{breakdown?.total || 0}</td></tr>{groups.map((group)=>{const expanded=expandedGroups.has(group.label);return <React.Fragment key={group.label}><tr className="groupRow"><td><button type="button" className="rowCollapseButton" aria-expanded={expanded} onClick={()=>toggleGroup(group.label)}><Caret expanded={expanded}/>{group.label}</button></td><td><i className="bar"><i style={{width:`${group.percent}%`}}/></i>{group.total} ({group.percent}%)</td></tr>{expanded&&group.children.map((child)=><tr className="childRow" key={`${group.label}-${child.label}`}><td>{child.label}</td><td><i className="dotBar">{Array.from({length:Math.min(child.total,16)}).map((_,i)=><i key={i}/>)}</i>{child.total} ({child.percent}%)</td></tr>)}</React.Fragment>;})}</tbody></table></CollapsiblePanel>;
}
function IssuesPanel({ issues }) {
  const [sortBy, setSortBy] = useState('updated');
  const [filter, setFilter] = useState('');
  const formatUpdated = (value) => value ? new Date(value).toLocaleString() : 'Not available';
  const openIssue = async (event, issueUrl) => {
    if (isLocalPreview()) return;
    event.preventDefault();
    const { router } = await import('@forge/bridge');
    await router.navigate(issueUrl);
  };
  const isStale = (value) => value && Date.now() - new Date(value).getTime() > 7 * 86400000;
  const filtered = issues.filter((issue) => [issue.key, issue.summary, issue.businessTestedApproved, issue.assignee, issue.parent].join(' ').toLowerCase().includes(filter.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => sortBy === 'updated' ? new Date(b.updated || 0) - new Date(a.updated || 0) : String(a[sortBy] || '').localeCompare(String(b[sortBy] || '')));
  return <CollapsiblePanel title={<>Remaining work ({issues.length}): <i className="legendDot remaining"/> Remaining work</>}><div className="tableToolbar"><label>Filter<input value={filter} onChange={(event)=>setFilter(event.target.value)} placeholder="Key, summary, status, person…"/></label><label>Sort by<select value={sortBy} onChange={(event)=>setSortBy(event.target.value)}><option value="updated">Last updated</option><option value="assignee">Assignee</option><option value="businessTestedApproved">Approval status</option><option value="parent">Parent</option></select></label><span>{sorted.length} shown</span></div><table className="dataTable"><thead><tr><th>Key</th><th>Summary</th><th>Business Tested &amp; Approved</th><th>Assignee</th><th>Parent</th><th>Updated</th></tr></thead><tbody>{sorted.map((issue)=><tr key={issue.key} className={isStale(issue.updated)?'staleIssue':''}><td><a href={issue.url} onClick={(event)=>openIssue(event,issue.url)}>{issue.key}</a></td><td>{issue.summary}{isStale(issue.updated)&&<span className="riskPill">Stale</span>}</td><td><span className="statusPill">{issue.businessTestedApproved}</span></td><td>◉ {issue.assignee}</td><td>{issue.parent}</td><td>{formatUpdated(issue.updated)}</td></tr>)}</tbody></table></CollapsiblePanel>;
}
function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}
function PeopleFilter({ assignees, labels, selectedAssignees, displayMode, teamLabel, onChange, onDisplayModeChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const allPeopleSelected = selectedAssignees.length === 0;
  const groupSelector = `label:${teamLabel || PEOPLE_GROUP_LABEL}`;
  const canSeparateSelectedPeople = selectedAssignees.length > 1 || selectedAssignees.includes(groupSelector);
  const groupLabels = labels.includes(teamLabel || PEOPLE_GROUP_LABEL) ? [teamLabel || PEOPLE_GROUP_LABEL] : [];
  const options = [...groupLabels.map((label) => ({ value: `label:${label}`, label, isGroup: true })), ...assignees.map((assignee) => ({ value: assignee, label: assignee, isGroup: false }))];
  const filteredOptions = options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()));
  const displaySelector = (selector) => selector.replace(/^label:/, '');
  const label = allPeopleSelected ? 'All people' : selectedAssignees.length === 1 ? displaySelector(selectedAssignees[0]) : `${selectedAssignees.length} selections`;
  const toggleAssignee = (assignee) => {
    const next = selectedAssignees.includes(assignee) ? selectedAssignees.filter((selected) => selected !== assignee) : [...selectedAssignees, assignee];
    onChange(next);
  };
  return <div className="peopleFilter"><span>People:</span><div className="menuWrap">
    <button type="button" className="peopleFilterButton" aria-haspopup="true" aria-expanded={open} onClick={()=>setOpen(!open)}><span className="peopleButtonContent"><span className="peopleStack" aria-hidden="true"><i>JS</i><i>CR</i></span><span><b>{label}</b><small>{allPeopleSelected ? `${assignees.length} available` : 'Selected for this chart'}</small></span></span><span className="peopleChevron" aria-hidden="true">⌄</span></button>
    {open&&<div className="popover peoplePopover">
      <div className="peoplePopoverHeader"><b>Select people</b><small>Filter the work shown on the chart</small></div>
      <label className="peopleSearch"><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search people" aria-label="Search people" autoFocus/></label>
      <div className="peopleOptions"><label className="checkOption allPeopleOption"><input type="checkbox" checked={allPeopleSelected} onChange={()=>onChange([])}/><span className="personAvatar allAvatar">All</span><span><b>All people</b><small>Show the whole team's work</small></span></label>{filteredOptions.map((option)=><label className="checkOption" key={option.value}><input type="checkbox" checked={selectedAssignees.includes(option.value)} onChange={()=>toggleAssignee(option.value)}/><span className={`personAvatar ${option.isGroup ? 'groupAvatar' : ''}`}>{option.isGroup ? 'Grp' : initials(option.label)}</span><span className="personName">{option.label}{option.isGroup && <small>Label group</small>}</span></label>)}{!filteredOptions.length&&<p className="peopleEmpty">No people match “{query}”.</p>}</div>
      {canSeparateSelectedPeople&&<div className="peopleDisplay"><span><b>People display</b><small>Choose whether selected work is graphed together or by individual</small></span><div className="peopleDisplayButtons"><button type="button" className={displayMode !== 'separate' ? 'selected' : ''} onClick={()=>onDisplayModeChange('combined')}>Combined</button><button type="button" className={displayMode === 'separate' ? 'selected' : ''} onClick={()=>onDisplayModeChange('separate')}>Individuals</button></div></div>}
      <div className="peoplePopoverFooter"><span>{allPeopleSelected ? 'Everyone selected' : `${selectedAssignees.length} selected`}</span><button type="button" onClick={()=>setOpen(false)}>Done</button></div>
    </div>}
  </div></div>;
}
function SettingsSection({ title, initiallyExpanded = true, children }) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  return <section className="settingsSection"><button type="button" className="accordion" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><Caret expanded={expanded}/>{title}</button>{expanded && <div className="settingsSectionContent">{children}</div>}</section>;
}
function Settings({ config, setConfig, onApply }) {
  const update = (name,value) => setConfig((current)=>({...current,[name]:value}));
  const selectedCompletionTargets = Array.isArray(config.completionToValues) && config.completionToValues.length ? config.completionToValues : ['Ready for Review (Demoed)'];
  const toggleCompletionTarget = (target) => {
    const nextTargets = selectedCompletionTargets.includes(target)
      ? selectedCompletionTargets.filter((value) => value !== target)
      : [...selectedCompletionTargets, target];
    update('completionToValues', nextTargets.length ? nextTargets : [target]);
  };
  const targetDescriptions = {
    Approved: '',
    'Ready for Review (Demoed)': ''
  };
  const applySettings = () => onApply({...config, completionToValues: selectedCompletionTargets});
  return <aside className="settings"><div className="selectedChartType"><span className="chartTypeIcon">↘</span><span><b>Burndown chart</b><small>Track completed and remaining work over time</small></span></div>
    <SettingsSection title="Data source"><label>Custom JQL<textarea value={config.jql} onChange={(e)=>update('jql',e.target.value)}/></label></SettingsSection>
    <SettingsSection title="People defaults"><label>Team label<input value={config.targetLabel || PEOPLE_GROUP_LABEL} onChange={(e)=>update('targetLabel',e.target.value)}/></label><label>Default people display<select value={config.peopleDisplay || 'combined'} onChange={(e)=>update('peopleDisplay',e.target.value)}><option value="combined">Combined</option><option value="separate">Individuals</option></select></label></SettingsSection>
    <SettingsSection title="Completion targets"><div className="completionIntro"><span className="completionIcon" aria-hidden="true">✓</span><span><b>Define done for this chart</b><small>Choose which Business Tested &amp; Approved values count as completed work.</small></span></div><div className="completionTargetGrid">{COMPLETION_STATUS_OPTIONS.map((target)=><label className="completionTargetCard" key={target}><input type="checkbox" checked={selectedCompletionTargets.includes(target)} onChange={()=>toggleCompletionTarget(target)}/><span className="completionCardBody"><span className="completionCardTitle"><b>{target}</b>{target === 'Ready for Review (Demoed)'}</span><small>{targetDescriptions[target]}</small></span></label>)}</div><div className="completionSummary"><span>{selectedCompletionTargets.length} selected</span><strong>{selectedCompletionTargets.join(' + ')}</strong></div></SettingsSection>
    <div className="settingsApplyBar"><button type="button" className="primaryButton" onClick={applySettings}>Apply settings</button><small>Updates the chart using your selected completion targets.</small></div></aside>;
}
function View() {
  const initialStorageKey = useMemo(() => dashboardConfigStorageKey(), []);
  const initialConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...readSavedDashboardConfig(initialStorageKey) }), [initialStorageKey]);
  const [data,setData]=useState(MOCK_DATA), [config,setConfig]=useState(initialConfig), [loading,setLoading]=useState(!isLocalPreview()), [error,setError]=useState(''), [openMenu,setOpenMenu]=useState(''), [settings,setSettings]=useState(false), [lastUpdated,setLastUpdated]=useState(isLocalPreview()?new Date():null), [storageKey,setStorageKey]=useState(initialStorageKey), [saveStatus,setSaveStatus]=useState('');
  async function loadData(nextConfig=config) {
    const normalizedConfig = {...nextConfig, jql: decodeJql(nextConfig.jql)};
    setConfig(normalizedConfig);
    setLoading(true);
    setError('');
    try {
      if(isLocalPreview()){setData({...MOCK_DATA,config:normalizedConfig});setLastUpdated(new Date());return;}
      const {invoke}=await import('@forge/bridge');
      const result=await invoke('getBurndownData',{config:normalizedConfig});
      if(!result || !Array.isArray(result.series)) throw new Error('Jira returned an invalid burndown response.');
      setData(result);setLastUpdated(new Date());
    } catch(err){setError(err.message||String(err));} finally{setLoading(false);}
  }
  useEffect(()=>{ if(isLocalPreview())return; import('@forge/bridge').then(({view})=>view.getContext()).then((context)=>{const nextStorageKey=dashboardConfigStorageKey(context);const saved=context?.extension?.gadgetConfiguration||{};const locallySaved=readSavedDashboardConfig(nextStorageKey);const next={...DEFAULT_CONFIG,...saved,...locallySaved,jql:decodeJql(locallySaved.jql||saved.jql||DEFAULT_CONFIG.jql)};setStorageKey(nextStorageKey);setConfig(next);loadData(next);}).catch(()=>{const next={...DEFAULT_CONFIG,...readSavedDashboardConfig(storageKey)};loadData(next);}); },[]);
  const saveCurrentView = () => {
    const saved = saveDashboardConfig(storageKey, config);
    setSaveStatus(saved ? 'Saved view' : 'Could not save view');
    if (saved) window.setTimeout(() => setSaveStatus(''), 2500);
  };
  const metrics=data.metrics||MOCK_DATA.metrics, legend=useMemo(()=>[['Completed work',metrics.completedWork,'completed'],['Completed this interval',metrics.activeInterval,'active'],['Remaining work',metrics.remainingWork,'remaining'],['Total work',metrics.totalWork,'total']], [metrics]);
  const kpis = [['Completed', `${metrics.completedPercent}%`, ''], ['Remaining', metrics.remainingWork, 'Work open'], ['This interval', metrics.activeInterval, 'Completed recently'], ['Total work', metrics.totalWork]];
  const healthTone = metrics.completedPercent >= 75 ? 'success' : metrics.completedPercent >= 45 ? 'warning' : 'critical';
  const scopeTone = metrics.scopeChange > 0 ? 'Scope expanding' : metrics.scopeChange < 0 ? 'Scope shrinking' : 'Scope stable';
  const assignees = data.assignees || ['Joe Alpha', 'Unassigned'];
  const teamLabel = config.targetLabel || PEOPLE_GROUP_LABEL;
  const groupLabels = (data.labels || []).filter((label) => label === teamLabel);
  const selectedAssignees = Array.isArray(config.assignees) && config.assignees.length
    ? config.assignees
    : config.assignee && config.assignee !== 'all' ? [config.assignee] : [];
  const personSeries = data.personSeries?.length ? data.personSeries : selectedAssignees.map((assignee, index) => ({ assignee, series: (data.series || []).map((point) => ({ ...point, remaining: Math.round(point.remaining * (index === 0 ? 0.6 : 0.4)) })) }));
  const chartTitle = selectedAssignees.length === 0
    ? 'Burndown Chart For All People'
    : selectedAssignees.length === 1
      ? `Burndown Chart For ${selectedAssignees[0].replace(/^label:/, '')}`
      : `Burndown Chart For ${selectedAssignees.length} People`;
  if(error) return <main className="page errorState"><h2>Could not load burndown data</h2><p>{error}</p><button onClick={()=>loadData()}>Retry</button></main>;
  return <main className="page"><header className="topBar"><div><h1>{chartTitle}</h1><span className="subtitle">TWD complaint handling burndown{lastUpdated && ` · Last refreshed ${lastUpdated.toLocaleString()}`}</span></div><div className="headerActions"><PeopleFilter assignees={assignees} labels={groupLabels} selectedAssignees={selectedAssignees} displayMode={config.peopleDisplay} teamLabel={teamLabel} onChange={(nextAssignees)=>loadData({...config,assignee:'all',assignees:nextAssignees})} onDisplayModeChange={(peopleDisplay)=>setConfig({...config,peopleDisplay})}/><button className="secondaryButton" onClick={saveCurrentView}>Save view</button><button className="secondaryButton" onClick={()=>setSettings(!settings)}>⚙ Settings</button><button className="primaryButton" onClick={()=>loadData()}>↻ Refresh</button>{saveStatus&&<span className="saveStatus" role="status">{saveStatus}</span>}</div></header>
    <div className={`workspace ${settings?'withSettings':''}`}><div className="content">{settings&&<div className="toolbar settingsToolbar"><div className="rangeControls"><RangeMenu config={config} openMenu={openMenu} setOpenMenu={setOpenMenu} onApply={loadData}/><Menu name={`Group: ${config.groupBy}`} openMenu={openMenu} setOpenMenu={setOpenMenu}>{['Daily','Weekly','Bi-weekly','Monthly','Quarterly'].map((item)=><button key={item} onClick={()=>{setConfig({...config,groupBy:item.toLowerCase().replace('-','')});setOpenMenu('');}}>{item}</button>)}</Menu></div><div className="toolMenus"><Menu name="Metrics" openMenu={openMenu} setOpenMenu={setOpenMenu}>{['Completed','Remaining','Total'].map((item)=><label className="checkOption" key={item}><input type="checkbox" checked={config[`show${item}`]!==false} onChange={(e)=>setConfig({...config,[`show${item}`]:e.target.checked})}/>{item} work</label>)}</Menu><Menu name="Forecast" openMenu={openMenu} setOpenMenu={setOpenMenu}><p className="popoverHelp">Choose a calendar-month horizon. Lines that complete later stop at the edge of that window.</p><label>Forecast days<select value={config.forecastDayMode || 'all'} onChange={(e)=>setConfig({...config,forecastDayMode:e.target.value})}><option value="all">All days</option><option value="working">Working days</option></select></label><label>Forecast months<input type="number" min="1" max="24" value={config.forecastMonths} onChange={(e)=>setConfig({...config,forecastMonths:e.target.value})}/></label><label>Capacity allocation coefficient (%)<input type="number" min="1" value={config.capacityCoefficient} onChange={(e)=>setConfig({...config,capacityCoefficient:e.target.value})}/></label></Menu><Menu name="Scenarios" openMenu={openMenu} setOpenMenu={setOpenMenu}>{MOCK_DATA.forecast.map((row)=><label className="checkOption" key={row.key}><input type="checkbox" checked={config[`scenario${displayValue(row.key).replace(/\s/g, '')}`] !== false} onChange={(e)=>setConfig({...config,[`scenario${displayValue(row.key).replace(/\s/g, '')}`]:e.target.checked})}/><i className={`scenarioBox ${row.key}`}/>{row.label}</label>)}</Menu></div></div>}
    <section className="insightHero" aria-label="Burndown summary"><div className="progressOrb" style={{'--progress': `${Math.min(100, Math.max(0, metrics.completedPercent || 0))}%`}}><span>{metrics.completedPercent}%</span><small>complete</small></div><div><h2>{metrics.remainingWork} items remain across {metrics.totalWork} total work items</h2></div></section>
    <div className="chartHeader"><div><b>Burndown chart</b>{config.peopleDisplay === 'separate' && personSeries.length > 1 && <div className="personLegend">{personSeries.map((person,index)=><span key={person.assignee}><i style={{background:['#0c66e4','#bf63f3','#e56910','#22a06b','#f15b50','#6e5dc6'][index%6]}}/>{person.assignee}</span>)}<span className="personMetricKey"><i className="remainingSample"/>Solid = remaining</span><span className="personMetricKey"><i className="completedSample"/>Dotted = completed</span></div>}</div><div className="legend">{legend.map(([label,value,type])=><span key={label} title={type==='active'?'Work completed during the latest reporting interval. Hover over a chart interval for its details.':undefined}><i className={`legendDot ${type}`}/> {label} <b>{value}</b></span>)}</div></div>{loading&&<div className="loadingBanner">Refreshing Jira data…</div>}{!loading&&data.issueCount===0?<div className="emptyData">No Jira issues matched the configured JQL.</div>:<Chart series={data.series||[]} config={config} forecast={data.forecast||MOCK_DATA.forecast} personSeries={personSeries}/>}
    {config.showForecast!==false&&<ForecastPanel config={config} rows={(data.forecast||[]).filter((row)=>config[`scenario${displayValue(row.key).replace(/\s/g, '')}`]!==false)} personSeries={config.peopleDisplay === 'separate' ? personSeries.map((person)=>({...person,forecast:(person.forecast||[]).filter((row)=>config[`scenario${displayValue(row.key).replace(/\s/g, '')}`]!==false)})) : []}/>} {config.showBreakdown!==false&&<BreakdownPanel breakdown={data.breakdown||{total:0,groups:[]}}/>} {config.showRemainingIssues!==false&&<IssuesPanel issues={data.remainingIssues||[]}/>}</div>{settings&&<Settings config={config} setConfig={setConfig} onApply={loadData}/>}</div></main>;
}
export default View;