import React, { useEffect, useMemo, useState } from 'react';
import './App.css';

const JQL = 'filter = "Replan - Business Testing & Approval"';

const MOCK_DATA = {
  metrics: {
    completedPercent: 72,
    scopeChange: 47,
    completedWork: 92,
    activeInterval: 29,
    remainingWork: 47,
    totalWork: 168
  },
  series: [
    { label: 'Feb 1 - Feb 7', total: 121, completed: 0, remaining: 121 },
    { label: 'Feb 8 - Feb 14', total: 121, completed: 10, remaining: 111 },
    { label: 'Feb 15 - Feb 21', total: 121, completed: 10, remaining: 111 },
    { label: 'Feb 22 - Feb 28', total: 121, completed: 16, remaining: 105 },
    { label: 'Feb 29 - Mar 6', total: 121, completed: 34, remaining: 87 },
    { label: 'Mar 7 - Mar 13', total: 121, completed: 34, remaining: 87 },
    { label: 'Mar 14 - Mar 20', total: 121, completed: 52, remaining: 69 },
    { label: 'Mar 21 - Mar 27', total: 121, completed: 52, remaining: 69 },
    { label: 'Mar 28 - Apr 3', total: 121, completed: 64, remaining: 57 },
    { label: 'Apr 4 - Apr 10', total: 168, completed: 64, remaining: 104 },
    { label: 'Apr 11 - Apr 17', total: 168, completed: 92, remaining: 76 },
    { label: 'Apr 18 - Apr 24', total: 168, completed: 92, remaining: 47 }
  ]
};

function isLocalPreview() {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

function makeForecast(series) {
  if (!series || series.length < 3) return [];

  const recent = series.slice(-4);
  const completedDiffs = [];

  for (let i = 1; i < recent.length; i++) {
    completedDiffs.push(Math.max(recent[i].completed - recent[i - 1].completed, 0));
  }

  const avg = completedDiffs.reduce((sum, value) => sum + value, 0) / completedDiffs.length;

  if (!avg || avg <= 0) return [];

  const forecast = [];
  let remaining = series[series.length - 1].remaining;
  let week = 1;

  while (remaining > 0 && week <= 8) {
    remaining = Math.max(0, remaining - avg);
    forecast.push({
      label: `Forecast ${week}`,
      remaining: Math.round(remaining),
      total: series[series.length - 1].total,
      completed: series[series.length - 1].completed
    });
    week++;
  }

  return forecast;
}

function Chart({ series }) {
  const width = 1100;
  const height = 350;
  const padding = { top: 30, right: 30, bottom: 80, left: 55 };

  const forecast = makeForecast(series);
  const allPoints = [...series, ...forecast];

  const maxY = Math.max(
    10,
    ...allPoints.map((p) => p.total || 0),
    ...allPoints.map((p) => p.completed || 0),
    ...allPoints.map((p) => p.remaining || 0)
  );

  const xStep =
    allPoints.length > 1
      ? (width - padding.left - padding.right) / (allPoints.length - 1)
      : 0;

  const x = (i) => padding.left + i * xStep;
  const y = (value) =>
    padding.top +
    (height - padding.top - padding.bottom) * (1 - value / maxY);

  const makePath = (points, field, offset = 0) =>
    points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i + offset)} ${y(p[field] || 0)}`)
      .join(' ');

  const currentOffset = series.length - 1;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="chart">
      {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
        const value = Math.round(maxY * tick);
        return (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(value)}
              y2={y(value)}
              className="grid"
            />
            <text x={12} y={y(value) + 4} className="axisText">
              {value}
            </text>
          </g>
        );
      })}

      {series.map((point, i) => (
        <g key={point.label}>
          <line
            x1={x(i)}
            x2={x(i)}
            y1={padding.top}
            y2={height - padding.bottom}
            className="grid"
          />
          <text
            x={x(i)}
            y={height - 35}
            className="xLabel"
            transform={`rotate(-45 ${x(i)} ${height - 35})`}
          >
            {point.label}
          </text>
        </g>
      ))}

      <path d={makePath(series, 'total')} className="line totalLine" />
      <path d={makePath(series, 'completed')} className="line completedLine" />
      <path d={makePath(series, 'remaining')} className="line remainingLine" />

      {forecast.length > 0 && (
        <path
          d={`M ${x(currentOffset)} ${y(series[series.length - 1].remaining)} ${makePath(
            forecast,
            'remaining',
            currentOffset + 1
          ).replace('M', 'L')}`}
          className="line forecastLine"
        />
      )}

      {series.map((point, i) => (
        <g key={`${point.label}-dots`}>
          <circle cx={x(i)} cy={y(point.total)} r="4" className="dot totalDot" />
          <circle cx={x(i)} cy={y(point.completed)} r="4" className="dot completedDot" />
          <circle cx={x(i)} cy={y(point.remaining)} r="4" className="dot remainingDot" />
        </g>
      ))}
    </svg>
  );
}

function View() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);
    setError('');

    try {
      if (isLocalPreview()) {
        setData(MOCK_DATA);
        return;
      }

      const { invoke } = await import('@forge/bridge');

      const result = await invoke('getBurndownData', {
        jql: JQL
      });

      setData(result);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const metrics = data?.metrics;

  const legend = useMemo(() => {
    if (!metrics) return [];
    return [
      ['Completed work', metrics.completedWork, 'completed'],
      ['Active interval', metrics.activeInterval, 'active'],
      ['Remaining work', metrics.remainingWork, 'remaining'],
      ['Total work', metrics.totalWork, 'total']
    ];
  }, [metrics]);

  if (loading) {
    return <div className="page">Loading TWD burndown chart...</div>;
  }

  if (error) {
    return (
      <div className="page">
        <h3>Could not load burndown data</h3>
        <p className="error">{error}</p>
        <button onClick={loadData}>Retry</button>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="topBar">
        <div>
          <h2>Individual burndown chart for TWD Complaint Handling</h2>
          <div className="subtitle">Data source: Replan - Business Testing & Approval</div>
        </div>
        <button onClick={loadData}>Refresh</button>
      </div>

      <div className="controls">
        <span>Last → 6 Bi-weeks</span>
        <span>Group: Weekly</span>
        <span>Estimation field: Issue count</span>
      </div>

      <div className="metricGrid">
        <div className="metricCard">
          <div className="metricLabel">Completed</div>
          <div className="metricValue">{metrics.completedPercent}%</div>
        </div>
        <div className="metricCard">
          <div className="metricLabel">Scope change</div>
          <div className="metricValue">
            {metrics.scopeChange}
            <span className="metricSmall"> total</span>
          </div>
        </div>
      </div>

      <div className="chartHeader">
        <div>
          <strong>Burndown chart</strong>
          <div className="axisLabel">↑ Issue count</div>
        </div>

        <div className="legend">
          {legend.map(([label, value, type]) => (
            <span key={label}>
              <i className={`legendDot ${type}`} /> {label} {value}
            </span>
          ))}
        </div>
      </div>

      <Chart series={data.series} />

      <div className="footerPanel">
        <strong>Forecast</strong>
        <span>Projected using recent weekly completion rate.</span>
      </div>
    </div>
  );
}

export default View;