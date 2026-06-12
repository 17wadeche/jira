import React, { useEffect, useMemo, useState } from 'react';
import './App.css';

const DEFAULT_CONFIG = {
  jql: 'filter = "Replan - Business Testing & Approval"', rangeCount: 6, rangeUnit: 'Bi-weeks', groupBy: 'Weekly',
  showCompleted: true, showRemaining: true, showTotal: true, showValueLabels: true, showForecast: true,
  showBreakdown: true, showRemainingIssues: true, assignee: 'all'
};

const MOCK_DATA = {
  config: DEFAULT_CONFIG,
  metrics: { completedPercent: 72, scopeChange: 47, completedWork: 92, activeInterval: 0, remainingWork: 47, totalWork: 168 },
  series: [
    ['Feb 1 - Feb 7',121,0,121],['Feb 8 - Feb 14',121,10,111],['Feb 15 - Feb 21',121,10,111],['Feb 22 - Feb 28',121,16,105],
    ['Feb 29 - Mar 6',121,34,87],['Mar 7 - Mar 13',121,34,87],['Mar 14 - Mar 20',121,52,69],['Mar 21 - Mar 27',121,52,69],
    ['Mar 28 - Apr 3',121,64,57],['Apr 4 - Apr 10',168,64,104],['Apr 11 - Apr 17',168,92,76],['Apr 18 - Apr 24',168,92,47]
  ].map(([label,total,completed,remaining]) => ({ label,total,completed,remaining })),
  forecast: [
    { label:'Max',key:'max',type:'Auto',velocity:28,completeDate:'05/08/2024',intervals:2 },
    { label:'Average',key:'average',type:'Auto',velocity:8,completeDate:'06/05/2024',intervals:6 },
    { label:'Min',key:'min',type:'Auto',velocity:12,completeDate:'05/22/2024',intervals:4 }
  ],
  breakdown: { total:47, groups:[
    { label:'TWD Complaints',total:22,percent:47,children:[{label:'Bug',total:8,percent:36},{label:'Story',total:9,percent:41},{label:'Task',total:5,percent:23}] },
    { label:'Business Approval',total:15,percent:32,children:[{label:'Story',total:9,percent:60},{label:'Task',total:6,percent:40}] },
    { label:'No parent',total:10,percent:21,children:[{label:'Task',total:10,percent:100}] }
  ]},
  remainingIssues: [
    {key:'TWD-47',summary:'Validate complaint outcome and customer response',businessTestedApproved:'Reviewing',assignee:'Joe Alpha',parent:'TWD-12',updated:'2024-04-23T15:30:00.000Z',url:'#'},
    {key:'TWD-51',summary:'Complete business approval evidence',businessTestedApproved:'Not set',assignee:'Joe Alpha',parent:'TWD-12',updated:'2024-04-22T12:15:00.000Z',url:'#'},
    {key:'TWD-58',summary:'Prepare final complaint resolution',businessTestedApproved:'Reviewing',assignee:'Unassigned',parent:'No parent',updated:'2024-04-19T09:45:00.000Z',url:'#'}
  ]
};

const isLocalPreview = () => ['localhost', '127.0.0.1'].includes(window.location.hostname);
const displayValue = (value) => String(value || '').replace(/(^|[-_])\w/g, (match) => match.replace(/[-_]/, ' ').toUpperCase());
const decodeJql = (value) => String(value || '').replace(/&(?:amp|#38|#x26);/gi, '&');

function makeForecast(series, velocity) {
  const points = [];
  let remaining = series[series.length - 1]?.remaining || 0;
  let week = 1;
  while (remaining > 0 && week <= 8) {
    remaining = Math.max(0, remaining - velocity);
    points.push({ label:`Forecast ${week}`, remaining });
    week += 1;
  }
  return points;
}

function Chart({ series, config }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const width = 1180, height = 390, padding = { top:36, right:34, bottom:92, left:54 };
  const scenarios = [{key:'max',velocity:28},{key:'average',velocity:8},{key:'min',velocity:12}];
  const longest = makeForecast(series, 8);
  const maxY = Math.max(10, ...series.flatMap((point) => [point.total, point.completed, point.remaining]));
  const count = series.length + longest.length;
  const xStep = (width - padding.left - padding.right) / Math.max(count - 1, 1);
  const x = (index) => padding.left + index * xStep;
  const y = (value) => padding.top + (height - padding.top - padding.bottom) * (1 - value / maxY);
  const path = (points, field, offset = 0) => points.map((point,index) => `${index ? 'L':'M'} ${x(index + offset)} ${y(point[field] || 0)}`).join(' ');
  const visible = (field) => config[`show${field[0].toUpperCase()}${field.slice(1)}`] !== false;
  const last = series[series.length - 1];
  const hovered = hoveredIndex === null ? null : series[hoveredIndex];
  const tooltipX = hoveredIndex !== null && x(hoveredIndex) > width - 300 ? x(hoveredIndex) - 250 : (hoveredIndex !== null ? x(hoveredIndex) + 12 : 0);
  const tooltipY = hovered ? Math.max(46, y(hovered.total) - 28) : 0;

  return <svg viewBox={`0 0 ${width} ${height}`} className="chart" role="img" aria-label="Burndown chart">
    {[0,.2,.4,.6,.8,1].map((tick) => <g key={tick}><line x1={padding.left} x2={width-padding.right} y1={y(maxY*tick)} y2={y(maxY*tick)} className="grid"/><text x="8" y={y(maxY*tick)+4} className="axisText">{Math.round(maxY*tick)}</text></g>)}
    {Array.from({length:count}).map((_,index) => <line key={index} x1={x(index)} x2={x(index)} y1={padding.top} y2={height-padding.bottom} className="grid"/>)}
    {series.map((point,index) => <rect key={`${point.label}-hover`} x={x(index)-xStep/2} y={padding.top} width={xStep} height={height-padding.top-padding.bottom} className={`intervalHitArea ${hoveredIndex===index?'active':''}`} onMouseEnter={()=>setHoveredIndex(index)} onMouseLeave={()=>setHoveredIndex(null)}/>)}
    {series.map((point,index) => <text key={point.label} x={x(index)} y={height-54} className="xLabel" transform={`rotate(-43 ${x(index)} ${height-54})`}>{point.label}</text>)}
    {visible('total') && <path d={path(series,'total')} className="line totalLine"/>}
    {visible('completed') && <path d={path(series,'completed')} className="line completedLine"/>}
    {visible('remaining') && <path d={path(series,'remaining')} className="line remainingLine"/>}
    {config.showForecast !== false && scenarios.map((scenario) => { const points=makeForecast(series,scenario.velocity); const labelIndex=Math.min(1,points.length-1); const labelPoint=points[labelIndex]; return <g key={scenario.key}><path d={`M ${x(series.length-1)} ${y(last.remaining)} ${path(points,'remaining',series.length).replace('M','L')}`} className={`line scenarioLine ${scenario.key}Line`}/>{labelPoint && <g transform={`translate(${x(series.length+labelIndex)-18} ${y(labelPoint.remaining)-10})`}><rect width={scenario.key==='average'?58:34} height="20" rx="10" className={`scenarioLabelBackground ${scenario.key}`}/><text x="7" y="14" className={`scenarioText ${scenario.key}`}>{displayValue(scenario.key)}</text></g>}</g>; })}
    {series.map((point,index) => <g key={`${point.label}-dots`}>
      {['total','completed','remaining'].map((field) => visible(field) && <g key={field}><circle cx={x(index)} cy={y(point[field])} r="4" className={`dot ${field}Dot`}/>{config.showValueLabels !== false && <text x={x(index)+5} y={y(point[field])-7} className={`${field}Value valueLabel`}>{point[field]}</text>}</g>)}
    </g>)}
    {hovered && <g className="chartTooltip" pointerEvents="none"><rect x={tooltipX} y={tooltipY} width="238" height="146" rx="4"/><text x={tooltipX+12} y={tooltipY+22} className="tooltipTitle">{hovered.label}</text><text x={tooltipX+12} y={tooltipY+48}>Total work<tspan x={tooltipX+218} textAnchor="end">{hovered.total}</tspan></text><text x={tooltipX+12} y={tooltipY+70}>Remaining work<tspan x={tooltipX+218} textAnchor="end">{hovered.remaining}</tspan></text><text x={tooltipX+12} y={tooltipY+92}>Completed work<tspan x={tooltipX+218} textAnchor="end">{hovered.completed}</tspan></text><text x={tooltipX+12} y={tooltipY+114}>Velocity<tspan x={tooltipX+218} textAnchor="end">{hoveredIndex ? Math.max(0, hovered.completed-series[hoveredIndex-1].completed) : 0}</tspan></text><text x={tooltipX+12} y={tooltipY+136} className="tooltipHint">Current interval details</text></g>}
  </svg>;
}

function Menu({ name, openMenu, setOpenMenu, children }) {
  return <div className="menuWrap"><button className={`toolButton ${openMenu===name?'selected':''}`} onClick={() => setOpenMenu(openMenu===name?'':name)}>{displayValue(name)}⌄</button>{openMenu===name && <div className={`popover ${name}Popover`}>{children}</div>}</div>;
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

function ForecastPanel({ rows }) {
  return <CollapsiblePanel title="Forecast"><table className="dataTable"><thead><tr><th>Label</th><th>Type</th><th>Velocity</th><th>Complete date</th><th>Intervals</th></tr></thead><tbody>{rows.map((row)=><tr key={row.label}><td><i className={`scenarioBox ${row.key}`}/> {row.label}</td><td>{row.type}</td><td>{row.velocity}</td><td>{row.completeDate}</td><td>{row.intervals} weeks</td></tr>)}</tbody></table></CollapsiblePanel>;
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

  return <CollapsiblePanel title="Breakdown" actions={actions}><table className="dataTable"><thead><tr><th>Metrics</th><th>Total</th><th>Trend</th></tr></thead><tbody><tr className="highlightRow"><td><span className="caretPlaceholder">⌄</span><i className="legendDot remaining"/> Remaining work</td><td>{breakdown?.total || 0}</td><td>-</td></tr>{groups.map((group)=>{const expanded=expandedGroups.has(group.label);return <React.Fragment key={group.label}><tr className="groupRow"><td><button type="button" className="rowCollapseButton" aria-expanded={expanded} onClick={()=>toggleGroup(group.label)}><Caret expanded={expanded}/>{group.label}</button></td><td><i className="bar"><i style={{width:`${group.percent}%`}}/></i>{group.total} ({group.percent}%)</td><td>-</td></tr>{expanded&&group.children.map((child)=><tr className="childRow" key={`${group.label}-${child.label}`}><td>{child.label}</td><td><i className="dotBar">{Array.from({length:Math.min(child.total,16)}).map((_,i)=><i key={i}/>)}</i>{child.total} ({child.percent}%)</td><td>-</td></tr>)}</React.Fragment>;})}</tbody></table></CollapsiblePanel>;
}

function IssuesPanel({ issues }) {
  const formatUpdated = (value) => value ? new Date(value).toLocaleString() : 'Not available';
  return <CollapsiblePanel title={<>Remaining work ({issues.length}): <i className="legendDot remaining"/> Remaining work</>}><table className="dataTable"><thead><tr><th>Key</th><th>Summary</th><th>Business Tested &amp; Approved</th><th>Assignee</th><th>Parent</th><th>Updated</th></tr></thead><tbody>{issues.map((issue)=><tr key={issue.key}><td><a href={issue.url}>{issue.key}</a></td><td>{issue.summary}</td><td><span className="statusPill">{issue.businessTestedApproved}</span></td><td>◉ {issue.assignee}</td><td>{issue.parent}</td><td>{formatUpdated(issue.updated)}</td></tr>)}</tbody></table></CollapsiblePanel>;
}

function SettingsSection({ title, initiallyExpanded = true, children }) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  return <section className="settingsSection"><button type="button" className="accordion" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><Caret expanded={expanded}/>{title}</button>{expanded && <div className="settingsSectionContent">{children}</div>}</section>;
}

function Settings({ config, setConfig, onApply }) {
  const update = (name,value) => setConfig((current)=>({...current,[name]:value}));
  return <aside className="settings"><div className="selectedChartType"><span className="chartTypeIcon">↘</span><span><b>Burndown chart</b><small>Track completed and remaining work over time</small></span></div>
    <SettingsSection title="Data source"><label>Custom JQL<textarea value={config.jql} onChange={(e)=>update('jql',e.target.value)}/></label></SettingsSection>
    <button type="button" className="primaryButton" onClick={()=>onApply(config)}>Apply settings</button></aside>;
}

function View() {
  const [data,setData]=useState(MOCK_DATA), [config,setConfig]=useState(DEFAULT_CONFIG), [loading,setLoading]=useState(!isLocalPreview()), [error,setError]=useState(''), [openMenu,setOpenMenu]=useState(''), [settings,setSettings]=useState(false);
  async function loadData(nextConfig=config) {
    const normalizedConfig = {...nextConfig, jql: decodeJql(nextConfig.jql)};
    setConfig(normalizedConfig);
    setLoading(true);
    setError('');
    try {
      if(isLocalPreview()){setData({...MOCK_DATA,config:normalizedConfig});return;}
      const {invoke}=await import('@forge/bridge');
      const result=await invoke('getBurndownData',{config:normalizedConfig});
      if(!result || !Array.isArray(result.series)) throw new Error('Jira returned an invalid burndown response.');
      setData(result);
    } catch(err){setError(err.message||String(err));} finally{setLoading(false);}
  }
  useEffect(()=>{ if(isLocalPreview())return; import('@forge/bridge').then(({view})=>view.getContext()).then((context)=>{const saved=context?.extension?.gadgetConfiguration||{};const next={...DEFAULT_CONFIG,...saved,jql:decodeJql(saved.jql||DEFAULT_CONFIG.jql)};setConfig(next);loadData(next);}).catch(()=>loadData(DEFAULT_CONFIG)); },[]);
  const metrics=data.metrics||MOCK_DATA.metrics, legend=useMemo(()=>[['Completed work',metrics.completedWork,'completed'],['Completed this interval',metrics.activeInterval,'active'],['Remaining work',metrics.remainingWork,'remaining'],['Total work',metrics.totalWork,'total']], [metrics]);
  const assignees = data.assignees || ['Joe Alpha', 'Unassigned'];
  const selectedPerson = config.assignee && config.assignee !== 'all' ? config.assignee : '';
  const chartTitle = selectedPerson ? `Individual burndown chart for ${selectedPerson}` : 'Burndown chart for all people';
  if(error) return <main className="page errorState"><h2>Could not load burndown data</h2><p>{error}</p><button onClick={()=>loadData()}>Retry</button></main>;
  return <main className="page"><header className="topBar"><div><h1>{chartTitle}</h1><span className="subtitle">TWD complaint handling burndown</span></div><div className="headerActions"><label className="peopleFilter"><span>People</span><select value={config.assignee||'all'} onChange={(event)=>loadData({...config,assignee:event.target.value})}><option value="all">All people</option>{assignees.map((assignee)=><option value={assignee} key={assignee}>{assignee}</option>)}</select></label><button className="secondaryButton" onClick={()=>setSettings(!settings)}>⚙ Settings</button><button className="primaryButton" onClick={()=>loadData()}>↻ Refresh</button></div></header>
    <div className={`workspace ${settings?'withSettings':''}`}><div className="content">{settings&&<div className="toolbar settingsToolbar"><div className="rangeControls"><Menu name={`Last → ${config.rangeCount} ${config.rangeUnit}`} openMenu={openMenu} setOpenMenu={setOpenMenu}><b>Last</b><label>Intervals<input value={config.rangeCount} onChange={(e)=>setConfig({...config,rangeCount:e.target.value})}/></label><button className="primaryButton" onClick={()=>{setOpenMenu('');loadData();}}>Apply</button></Menu><Menu name={`Group: ${config.groupBy}`} openMenu={openMenu} setOpenMenu={setOpenMenu}>{['Daily','Weekly','Bi-weekly','Monthly','Quarterly'].map((item)=><button key={item} onClick={()=>{setConfig({...config,groupBy:item.toLowerCase().replace('-','')});setOpenMenu('');}}>{item}</button>)}</Menu></div><div className="toolMenus"><Menu name="Metrics" openMenu={openMenu} setOpenMenu={setOpenMenu}>{['Completed','Remaining','Total'].map((item)=><label className="checkOption" key={item}><input type="checkbox" checked={config[`show${item}`]!==false} onChange={(e)=>setConfig({...config,[`show${item}`]:e.target.checked})}/>{item} work</label>)}</Menu><Menu name="Forecast" openMenu={openMenu} setOpenMenu={setOpenMenu}><label>Interval count<input defaultValue="5"/></label><label>Capacity allocation coefficient<input defaultValue="100%"/></label></Menu><Menu name="Scenarios" openMenu={openMenu} setOpenMenu={setOpenMenu}>{MOCK_DATA.forecast.map((row)=><label className="checkOption" key={row.key}><input type="checkbox" defaultChecked/><i className={`scenarioBox ${row.key}`}/>{row.label}</label>)}</Menu></div></div>}
    <div className="metricGrid"><div className="metricCard"><span>Completed</span><b>{metrics.completedPercent}%</b></div><div className="metricCard"><span>Scope change</span><b>{metrics.scopeChange}<small> total&nbsp; {Math.max(1,Math.round(metrics.scopeChange/12))} avg/bi-week</small></b></div></div>
    <div className="chartHeader"><div><b>Burndown chart</b><span className="axisLabel">↑ Issue count</span></div><div className="legend">{legend.map(([label,value,type])=><span key={label} title={type==='active'?'Work completed during the latest reporting interval. Hover over a chart interval for its details.':undefined}><i className={`legendDot ${type}`}/> {label} <b>{value}</b></span>)}</div></div>{loading&&<div className="loadingBanner">Refreshing Jira data…</div>}{!loading&&data.issueCount===0?<div className="emptyData">No Jira issues matched the configured JQL.</div>:<Chart series={data.series||[]} config={config}/>}
    {config.showForecast!==false&&<ForecastPanel rows={data.forecast||[]}/>} {config.showBreakdown!==false&&<BreakdownPanel breakdown={data.breakdown||{total:0,groups:[]}}/>} {config.showRemainingIssues!==false&&<IssuesPanel issues={data.remainingIssues||[]}/>}</div>{settings&&<Settings config={config} setConfig={setConfig} onApply={loadData}/>}</div></main>;
}
export default View;
