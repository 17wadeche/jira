import React, { useEffect, useState } from 'react';
import { view } from '@forge/bridge';
import './App.css';

const DEFAULT_CONFIG = {
  jql: 'filter = "Replan - Business Testing & Approval"',
  rangeCount: 6,
  rangeUnit: 'biweeks',
  groupBy: 'weekly',
  showCompleted: true,
  showRemaining: true,
  showTotal: true,
  showValueLabels: true,
  showForecast: true,
  forecastIntervals: 5,
  capacityCoefficient: 100,
  scenarioMax: true,
  scenarioAverage: true,
  scenarioMin: true,
  showBreakdown: true,
  showRemainingIssues: true,
  targetLabel: ''
};

function readConfigFromContext(context) {
  return (
    context?.extension?.gadgetConfiguration ||
    context?.extension?.config ||
    context?.extension?.configuration ||
    {}
  );
}

function Edit() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    view.getContext()
      .then((context) => {
        setConfig({
          ...DEFAULT_CONFIG,
          ...readConfigFromContext(context)
        });
      })
      .finally(() => setLoading(false));
  }, []);

  function update(name, value) {
    setConfig((current) => ({
      ...current,
      [name]: value
    }));
  }

  function updateCheckbox(name, event) {
    update(name, event.target.checked);
  }

  function submit(event) {
    event.preventDefault();

    view.submit({
      ...config,
      rangeCount: Number(config.rangeCount || 6),
      forecastIntervals: Number(config.forecastIntervals || 5),
      capacityCoefficient: Number(config.capacityCoefficient || 100)
    });
  }

  if (loading) {
    return <div className="editPage">Loading configuration...</div>;
  }

  return (
    <form className="editPage" onSubmit={submit}>
      <h2>TWD Burndown Configuration</h2>

      <section className="editSection">
        <h3>Data source</h3>

        <label>
          Saved filter / JQL
          <textarea
            value={config.jql}
            onChange={(event) => update('jql', event.target.value)}
            rows={3}
          />
        </label>
      </section>

      <section className="editSection">
        <h3>Calculation</h3>

        <label>
          Complete when
          <div className="selectedSetting">
            Business Tested &amp; Approved changes from Reviewing to Ready for Review (Demoed)
          </div>
        </label>

        <label>
          Completion date
          <div className="selectedSetting">Updated</div>
        </label>

        <div className="editGrid">
          <label>
            Last
            <input
              type="number"
              min="1"
              value={config.rangeCount}
              onChange={(event) => update('rangeCount', event.target.value)}
            />
          </label>

          <label>
            Range unit
            <select
              value={config.rangeUnit}
              onChange={(event) => update('rangeUnit', event.target.value)}
            >
              <option value="days">Days</option>
              <option value="weeks">Weeks</option>
              <option value="biweeks">Bi-weeks</option>
              <option value="months">Months</option>
              <option value="quarters">Quarters</option>
            </select>
          </label>

          <label>
            Group
            <select
              value={config.groupBy}
              onChange={(event) => update('groupBy', event.target.value)}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </select>
          </label>
        </div>
      </section>

      <section className="editSection">
        <h3>Metrics</h3>

        <label className="checkRow">
          <input
            type="checkbox"
            checked={config.showCompleted}
            onChange={(event) => updateCheckbox('showCompleted', event)}
          />
          Completed work
        </label>

        <label className="checkRow">
          <input
            type="checkbox"
            checked={config.showRemaining}
            onChange={(event) => updateCheckbox('showRemaining', event)}
          />
          Remaining work
        </label>

        <label className="checkRow">
          <input
            type="checkbox"
            checked={config.showTotal}
            onChange={(event) => updateCheckbox('showTotal', event)}
          />
          Total work
        </label>

        <label className="checkRow">
          <input
            type="checkbox"
            checked={config.showValueLabels}
            onChange={(event) => updateCheckbox('showValueLabels', event)}
          />
          Show value labels
        </label>
      </section>

      <section className="editSection">
        <h3>Forecast</h3>

        <label className="checkRow">
          <input
            type="checkbox"
            checked={config.showForecast}
            onChange={(event) => updateCheckbox('showForecast', event)}
          />
          Display forecast
        </label>

        <div className="editGrid">
          <label>
            Interval count
            <input
              type="number"
              min="1"
              value={config.forecastIntervals}
              onChange={(event) => update('forecastIntervals', event.target.value)}
            />
          </label>

          <label>
            Capacity allocation coefficient %
            <input
              type="number"
              min="1"
              value={config.capacityCoefficient}
              onChange={(event) => update('capacityCoefficient', event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="editSection">
        <h3>Scenarios</h3>

        <label className="checkRow">
          <input
            type="checkbox"
            checked={config.scenarioMax}
            onChange={(event) => updateCheckbox('scenarioMax', event)}
          />
          Max
        </label>

        <label className="checkRow">
          <input
            type="checkbox"
            checked={config.scenarioAverage}
            onChange={(event) => updateCheckbox('scenarioAverage', event)}
          />
          Average
        </label>

        <label className="checkRow">
          <input
            type="checkbox"
            checked={config.scenarioMin}
            onChange={(event) => updateCheckbox('scenarioMin', event)}
          />
          Min
        </label>
      </section>

      <section className="editSection">
        <h3>Bottom panels</h3>

        <label className="checkRow">
          <input
            type="checkbox"
            checked={config.showBreakdown}
            onChange={(event) => updateCheckbox('showBreakdown', event)}
          />
          Show breakdown
        </label>

        <label className="checkRow">
          <input
            type="checkbox"
            checked={config.showRemainingIssues}
            onChange={(event) => updateCheckbox('showRemainingIssues', event)}
          />
          Show remaining issues
        </label>

        <label>
          Target label
          <input
            value={config.targetLabel}
            onChange={(event) => update('targetLabel', event.target.value)}
            placeholder="Optional"
          />
        </label>
      </section>

      <div className="editActions">
        <button type="button" className="secondaryButton" onClick={view.close}>
          Cancel
        </button>
        <button type="submit">Save</button>
      </div>
    </form>
  );
}

export default Edit;