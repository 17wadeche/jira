import React, { useEffect, useMemo, useState } from 'react';
import './App.css';

const DEFAULT_CONFIG = {
  jql: 'filter = "Replan - Business Testing & Approval"', rangeCount: 6, rangeUnit: 'Bi-weeks', groupBy: 'Weekly',
  showCompleted: true, showRemaining: true, showTotal: true, showValueLabels: true, showForecast: true,
  showBreakdown: true, showRemainingIssues: true
};

const MOCK_DATA = {
  config: DEFAULT_CONFIG,
  metrics: { completedPercent: 72, scopeChange: 47, completedWork: 92, activeInterval: 29, remainingWork: 47, totalWork: 168 },
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
    {key:'TWD-47',summary:'Validate complaint outcome and customer response',assignee:'Joe Alpha',status:'IN PROGRESS',url:'#'},
    {key:'TWD-51',summary:'Complete business approval evidence',assignee:'Joe Alpha',status:'TO DO',url:'#'},
    {key:'TWD-58',summary:'Prepare final complaint resolution',assignee:'Unassigned',status:'TO DO',url:'#'}
  ]
};

const isLocalPreview = () => ['localhost', '127.0.0.1'].includes(window.location.hostname);
const displayValue = (value) => String(value || '').replace(/(^|[-_])\w/g, (match) => match.replace(/[-_]/, ' ').toUpperCase());

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

  return <svg viewBox={`0 0 ${width} ${height}`} className="chart" role="img" aria-label="Burndown chart">
    {[0,.2,.4,.6,.8,1].map((tick) => <g key={tick}><line x1={padding.left} x2={width-padding.right} y1={y(maxY*tick)} y2={y(maxY*tick)} className="grid"/><text x="8" y={y(maxY*tick)+4} className="axisText">{Math.round(maxY*tick)}</text></g>)}
    {Array.from({length:count}).map((_,index) => <line key={index} x1={x(index)} x2={x(index)} y1={padding.top} y2={height-padding.bottom} className="grid"/>)}
    {series.map((point,index) => <text key={point.label} x={x(index)} y={height-54} className="xLabel" transform={`rotate(-43 ${x(index)} ${height-54})`}>{point.label}</text>)}
    {visible('total') && <path d={path(series,'total')} className="line totalLine"/>}
    {visible('completed') && <path d={path(series,'completed')} className="line completedLine"/>}
    {visible('remaining') && <path d={path(series,'remaining')} className="line remainingLine"/>}
    {scenarios.map((scenario) => { const points=makeForecast(series,scenario.velocity); return <path key={scenario.key} d={`M ${x(series.length-1)} ${y(last.remaining)} ${path(points,'remaining',series.length).replace('M','L')}`} className={`line scenarioLine ${scenario.key}Line`}/>; })}
    {series.map((point,index) => <g key={`${point.label}-dots`}>
      {['total','completed','remaining'].map((field) => visible(field) && <g key={field}><circle cx={x(index)} cy={y(point[field])} r="4" className={`dot ${field}Dot`}/>{config.showValueLabels !== false && <text x={x(index)+5} y={y(point[field])-7} className={`${field}Value valueLabel`}>{point[field]}</text>}</g>)}
    </g>)}
  </svg>;
}

function Menu({ name, openMenu, setOpenMenu, children }) {
  return <div className="menuWrap"><button className={`toolButton ${openMenu===name?'selected':''}`} onClick={() => setOpenMenu(openMenu===name?'':name)}>{displayValue(name)}⌄</button>{openMenu===name && <div className={`popover ${name}Popover`}>{children}</div>}</div>;
}

function ForecastPanel({ rows }) {
  return <section className="bottomPanel"><div className="panelTitle">⌄&nbsp; Forecast</div><table className="dataTable"><thead><tr><th>Label</th><th>Type</th><th>Velocity</th><th>Complete date</th><th>Intervals</th></tr></thead><tbody>{rows.map((row)=><tr key={row.label}><td><i className={`scenarioBox ${row.key}`}/> {row.label}</td><td>{row.type}</td><td>{row.velocity}</td><td>{row.completeDate}</td><td>{row.intervals} weeks</td></tr>)}</tbody></table></section>;
}

function BreakdownPanel({ breakdown }) {
  return <section className="bottomPanel"><div className="panelTitle">⌄&nbsp; Breakdown <span className="panelActions">Collapse all&nbsp;&nbsp; Expand all</span></div><table className="dataTable"><thead><tr><th>Metrics</th><th>Total</th><th>Trend</th></tr></thead><tbody><tr className="highlightRow"><td>⌄ <i className="legendDot remaining"/> Remaining work</td><td>{breakdown.total}</td><td>-</td></tr>{breakdown.groups.map((group)=><React.Fragment key={group.label}><tr className="groupRow"><td>⌄&nbsp; {group.label}</td><td><i className="bar"><i style={{width:`${group.percent}%`}}/></i>{group.total} ({group.percent}%)</td><td>-</td></tr>{group.children.map((child)=><tr className="childRow" key={`${group.label}-${child.label}`}><td>{child.label}</td><td><i className="dotBar">{Array.from({length:Math.min(child.total,16)}).map((_,i)=><i key={i}/>)}</i>{child.total} ({child.percent}%)</td><td>-</td></tr>)}</React.Fragment>)}</tbody></table></section>;
}

function IssuesPanel({ issues }) {
  return <section className="bottomPanel"><div className="panelTitle">⌄&nbsp; Remaining work ({issues.length}): <i className="legendDot remaining"/> Remaining work</div><div className="subTitle">Issues ↗</div><table className="dataTable"><thead><tr><th>Key</th><th>Summary</th><th>Issue count</th><th>Assignee</th><th>Status</th></tr></thead><tbody>{issues.map((issue)=><tr key={issue.key}><td><a href={issue.url}>{issue.key}</a></td><td>{issue.summary}</td><td><span className="countPill">1</span></td><td>◉ {issue.assignee}</td><td><span className="statusPill">{issue.status}</span></td></tr>)}</tbody></table></section>;
}

function Settings({ config, setConfig, onApply }) {
  const update = (name,value) => setConfig((current)=>({...current,[name]:value}));
  return <aside className="settings"><div className="chartTypes"><button>⌁<small>Burnup chart</small></button><button className="selected">⌁<small>Burndown chart</small></button><button>⌁<small>Daily burndown</small></button></div>
    <div className="accordion">›&nbsp; Data source</div><label>Custom JQL<textarea value={config.jql} onChange={(e)=>update('jql',e.target.value)}/></label>
    <div className="accordion">⌄&nbsp; Calculation</div><label>Estimation field<select><option>Issue count</option></select></label><label>Done statuses<select><option>Select...</option></select></label>
    <div className="accordion">⌄&nbsp; Remaining work</div><label>Remaining work value<div className="segmented"><button className="selected">Auto</button><button>What-if</button></div></label>
    <div className="accordion">⌄&nbsp; Issue filter</div><label>Issue type<select><option>All standard</option></select></label><button className="primaryButton" onClick={()=>onApply(config)}>Apply settings</button></aside>;
}

function View() {
  const [data,setData]=useState(MOCK_DATA), [config,setConfig]=useState(DEFAULT_CONFIG), [loading,setLoading]=useState(!isLocalPreview()), [error,setError]=useState(''), [openMenu,setOpenMenu]=useState(''), [settings,setSettings]=useState(false);
  async function loadData(nextConfig=config) { setLoading(true); setError(''); try { if(isLocalPreview()){setData({...MOCK_DATA,config:nextConfig});return;} const {invoke}=await import('@forge/bridge'); setData(await invoke('getBurndownData',{config:nextConfig})); } catch(err){setError(err.message||String(err));} finally{setLoading(false);} }
  useEffect(()=>{ if(isLocalPreview())return; import('@forge/bridge').then(({view})=>view.getContext()).then((context)=>{const saved=context?.extension?.gadgetConfiguration||{};const next={...DEFAULT_CONFIG,...saved};setConfig(next);loadData(next);}).catch(()=>loadData(DEFAULT_CONFIG)); },[]);
  const metrics=data.metrics, legend=useMemo(()=>[['Completed work',metrics.completedWork,'completed'],['Active interval',metrics.activeInterval,'active'],['Remaining work',metrics.remainingWork,'remaining'],['Total work',metrics.totalWork,'total']], [metrics]);
  if(error) return <main className="page errorState"><h2>Could not load burndown data</h2><p>{error}</p><button onClick={()=>loadData()}>Retry</button></main>;
  return <main className="page"><header className="topBar"><div><h1>Individual burndown chart for TWD Complaint Handling</h1><span className="subtitle">TWD complaint handling burndown</span></div><div className="headerActions"><button className="iconButton">?</button><button className="iconButton">•••</button><button className="secondaryButton" onClick={()=>setSettings(!settings)}>⚙ Settings</button><button className="primaryButton" onClick={()=>loadData()}>↻ Refresh</button></div></header>
    <div className={`workspace ${settings?'withSettings':''}`}><div className="content"><div className="toolbar"><div className="rangeControls"><Menu name={`Last → ${config.rangeCount} ${config.rangeUnit}`} openMenu={openMenu} setOpenMenu={setOpenMenu}><b>Last</b><label>Intervals<input value={config.rangeCount} onChange={(e)=>setConfig({...config,rangeCount:e.target.value})}/></label><button className="primaryButton" onClick={()=>{setOpenMenu('');loadData();}}>Apply</button></Menu><Menu name={`Group: ${config.groupBy}`} openMenu={openMenu} setOpenMenu={setOpenMenu}>{['Daily','Weekly','Bi-weekly','Monthly','Quarterly'].map((item)=><button key={item} onClick={()=>{setConfig({...config,groupBy:item.toLowerCase().replace('-','')});setOpenMenu('');}}>{item}</button>)}</Menu></div><div className="toolMenus"><Menu name="Metrics" openMenu={openMenu} setOpenMenu={setOpenMenu}>{['Completed','Remaining','Total'].map((item)=><label className="checkOption" key={item}><input type="checkbox" checked={config[`show${item}`]!==false} onChange={(e)=>setConfig({...config,[`show${item}`]:e.target.checked})}/>{item} work</label>)}</Menu><Menu name="Forecast" openMenu={openMenu} setOpenMenu={setOpenMenu}><label>Interval count<input defaultValue="5"/></label><label>Capacity allocation coefficient<input defaultValue="100%"/></label></Menu><Menu name="Scenarios" openMenu={openMenu} setOpenMenu={setOpenMenu}>{MOCK_DATA.forecast.map((row)=><label className="checkOption" key={row.key}><input type="checkbox" defaultChecked/><i className={`scenarioBox ${row.key}`}/>{row.label}</label>)}</Menu></div></div>
    <div className="metricGrid"><div className="metricCard"><span>Completed ⓘ</span><b>{metrics.completedPercent}%</b></div><div className="metricCard"><span>Scope change ⓘ</span><b>{metrics.scopeChange}<small> total&nbsp; {Math.max(1,Math.round(metrics.scopeChange/12))} avg/bi-week</small></b></div></div>
    <div className="chartHeader"><div><b>Burndown chart</b><span className="axisLabel">↑ Issue count</span></div><div className="legend">{legend.map(([label,value,type])=><span key={label}><i className={`legendDot ${type}`}/> {label} <b>{value}</b></span>)}</div><span className="weeks">Weeks →</span></div>{loading&&<div className="loadingBanner">Refreshing Jira data…</div>}<Chart series={data.series} config={config}/>
    {config.showForecast!==false&&<ForecastPanel rows={data.forecast||[]}/>} {config.showBreakdown!==false&&<BreakdownPanel breakdown={data.breakdown}/>} {config.showRemainingIssues!==false&&<IssuesPanel issues={data.remainingIssues||[]}/>}</div>{settings&&<Settings config={config} setConfig={setConfig} onApply={loadData}/>}</div></main>;
}
export default View;
