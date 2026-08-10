/* global Chart */
import { BaseElement } from "../base-element/base-element";
import { utility } from "../utility";
import { bossDisplayName } from "../data/boss";

// Same fixed bucket grid as skill-graph -- lets multiple members' irregular
// WOM snapshot timestamps line up on one shared x-axis.
export class BossGraph extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{boss-graph.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.period = this.getAttribute("data-period");
    this.bossMetric = this.getAttribute("boss-metric");
    this.render();
    this.tableContainer = this.querySelector(".boss-graph__table-container");
    this.memberFiltersContainer = this.querySelector(".boss-graph__member-filters");
    this.ctx = this.querySelector("canvas").getContext("2d");

    this.subscribeOnce("get-group-data", this.create.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.chart) {
      this.chart.destroy();
    }
  }

  create(groupData) {
    if (!this.isConnected) return;
    this.currentGroupData = groupData;
    this.dates = BossGraph.datesForPeriod(this.period);
    const dataSets = this.dataSets();

    this.createChart(dataSets);
    this.createTable(dataSets);
    this.createMemberFilters(dataSets);
  }

  createTable(dataSets) {
    const formatKc = (kc) => (kc === null || kc === undefined ? "—" : kc.toLocaleString());

    const row = (name, dataSet, rank) => {
      const kcGain = dataSet.data[dataSet.data.length - 1] || 0;
      const kcNow = dataSet.kcData[dataSet.kcData.length - 1];
      const colorDot = `<span class="boss-graph__player-dot" style="background: ${dataSet.borderColor}"></span>`;
      return `
<tr>
  <td class="boss-graph__rank">${rank}</td>
  <td class="boss-graph__player-cell">${colorDot}${name}</td>
  <td class="boss-graph__kc-data">${formatKc(kcNow)}</td>
  <td class="boss-graph__kc-change-data">${kcGain > 0 ? "+" : ""}${kcGain.toLocaleString()}</td>
</tr>
`;
    };

    const sorted = [...dataSets].sort((a, b) => {
      const aGain = a.data[a.data.length - 1] || 0;
      const bGain = b.data[b.data.length - 1] || 0;
      return bGain - aGain;
    });

    let groupTotalGain = 0;
    let activeCount = 0;
    let topContributor = null;
    let topGain = 0;
    const rows = sorted.map((dataSet, i) => {
      const gain = dataSet.data[dataSet.data.length - 1] || 0;
      groupTotalGain += gain;
      if (gain > 0) activeCount++;
      if (gain > topGain) {
        topGain = gain;
        topContributor = dataSet.label;
      }
      return row(dataSet.label, dataSet, i + 1);
    });

    const summaryParts = [
      `<span>Combined KC gained: +${groupTotalGain.toLocaleString()}</span>`,
      `<span>Active: ${activeCount}/${dataSets.length}</span>`,
    ];
    if (topContributor) {
      summaryParts.push(`<span>Top: ${topContributor} (+${topGain.toLocaleString()})</span>`);
    }

    this.tableContainer.innerHTML = `
<div class="boss-graph__summary">${summaryParts.join("")}</div>
<div class="boss-graph__table-scroll">
<table>
  <thead>
    <tr>
      <th class="boss-graph__rank-header">#</th>
      <th>Player</th>
      <th>KC</th>
      <th>KC Gained</th>
    </tr>
  </thead>
  <tbody>${rows.join("")}</tbody>
</table>
</div>
`;
  }

  // A per-member checkbox to show/hide that member's line on the chart,
  // mirroring skill-graph's member filters.
  createMemberFilters(dataSets) {
    const filters = dataSets
      .map((dataSet, index) => {
        const id = `boss-graph-member-filter-${this.bossMetric}-${index}`;
        return `
<span class="boss-graph__member-filter">
  <input type="checkbox" id="${id}" data-dataset-index="${index}" checked />
  <label for="${id}">
    <span class="boss-graph__member-filter-swatch" style="background: ${dataSet.borderColor}"></span>
    ${dataSet.label}
  </label>
</span>
`;
      })
      .join("");

    this.memberFiltersContainer.innerHTML = `
${filters}
<button type="button" class="boss-graph__member-filter-all men-button small">Show all</button>
<button type="button" class="boss-graph__member-filter-none men-button small">Hide all</button>
`;

    for (const checkbox of this.memberFiltersContainer.querySelectorAll("input[type=checkbox]")) {
      this.eventListener(checkbox, "change", this.handleMemberFilterChange.bind(this));
    }
    this.eventListener(this.memberFiltersContainer.querySelector(".boss-graph__member-filter-all"), "click", () =>
      this.setAllMembersVisible(true)
    );
    this.eventListener(this.memberFiltersContainer.querySelector(".boss-graph__member-filter-none"), "click", () =>
      this.setAllMembersVisible(false)
    );
  }

  handleMemberFilterChange(event) {
    const index = Number(event.currentTarget.dataset.datasetIndex);
    this.chart.setDatasetVisibility(index, event.currentTarget.checked);
    this.chart.update();
  }

  setAllMembersVisible(visible) {
    const checkboxes = this.memberFiltersContainer.querySelectorAll("input[type=checkbox]");
    checkboxes.forEach((checkbox, index) => {
      checkbox.checked = visible;
      this.chart.setDatasetVisibility(index, visible);
    });
    this.chart.update();
  }

  createChart(dataSets) {
    if (this.chart) this.chart.destroy();

    let max = 0;
    for (const dataSet of dataSets) {
      max = Math.max(max, dataSet.data[dataSet.data.length - 1] || 0);
    }

    const scales = {
      x: {
        grid: {
          drawTicks: false,
          borderDash: [4, 4],
        },
      },
      y: {
        type: "linear",
        min: 0,
        max: max + 1,
        title: {
          display: true,
          text: "KC Gain",
        },
        grid: {
          borderDash: [4, 4],
        },
      },
    };

    this.chart = new Chart(this.ctx, {
      type: "line",
      options: {
        maintainAspectRatio: false,
        animation: false,
        normalized: true,
        layout: {
          padding: 0,
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: (tooltip) => {
                const kcChange = tooltip.dataset.changeData[tooltip.dataIndex];
                const kcChangeString = `${kcChange > 0 ? "+" : ""}${kcChange.toLocaleString()}`;
                const kcNow = tooltip.dataset.kcData[tooltip.dataIndex];
                const kcNowString = kcNow === undefined ? "—" : kcNow.toLocaleString();
                return `${tooltip.dataset.label}: ${kcNowString} (${kcChangeString})`;
              },
            },
          },
          title: {
            display: true,
            text: `${bossDisplayName(this.bossMetric)} - ${this.period}`,
            font: {
              size: 18,
              family: "rsbold, ui-sans-serif, Arial, sans-serif",
            },
          },
          legend: {
            display: false,
          },
        },
        interaction: {
          intersect: false,
          mode: "index",
        },
        scales,
      },
      data: {
        labels: this.labelsForPeriod(this.period, this.dates),
        datasets: dataSets,
      },
    });
  }

  dataSets() {
    let result = [];
    for (let i = 0; i < this.groupBossData.length; ++i) {
      const memberBossData = this.groupBossData[i];
      const [kcData, changeData, cumulativeChangeData] = this.dataForPlayer(memberBossData);
      const member = this.currentGroupData.members.get(memberBossData.name);
      const color = member ? member.color : "#888";

      result.push({
        type: "line",
        label: memberBossData.name,
        data: cumulativeChangeData,
        borderColor: color,
        backgroundColor: utility.colorWithAlpha(color, 0.12),
        fill: true,
        tension: 0.3,
        pointBorderWidth: 0,
        pointHoverBorderWidth: 2,
        pointHoverBorderColor: "white",
        pointHoverRadius: 5,
        pointRadius: 0,
        borderWidth: 2,
        changeData,
        kcData,
      });
    }

    return result;
  }

  dataForPlayer(memberBossData) {
    const completeTimeSeries = this.generateCompleteTimeSeries(memberBossData.boss_kc_data);
    const changeData = [0];
    const cumulativeChangeData = [0];

    let s = 0;
    for (let i = 1; i < completeTimeSeries.length; ++i) {
      const previous = completeTimeSeries[i - 1];
      const current = completeTimeSeries[i];
      if (previous === undefined || current === undefined) {
        changeData.push(0);
        cumulativeChangeData.push(s);
      } else {
        changeData.push(current - previous);
        s += current - previous;
        cumulativeChangeData.push(s);
      }
    }

    return [completeTimeSeries, changeData, cumulativeChangeData];
  }

  // Buckets WOM's irregularly-timed snapshots onto the fixed `this.dates`
  // grid, forward-filling each bucket with the most recent known KC so gaps
  // between snapshots don't read as drops back to undefined.
  generateCompleteTimeSeries(bossKcData) {
    const bucketedData = new Map();
    const earliestDateInPeriod = BossGraph.truncatedDateForPeriod(this.dates[0], this.period);
    const datesOutsideOfPeriod = [];
    for (const point of bossKcData) {
      const time = new Date(point.time);
      const date = BossGraph.truncatedDateForPeriod(time, this.period);
      if (!bucketedData.has(date.getTime())) {
        bucketedData.set(date.getTime(), point.kills);
      }

      if (date < earliestDateInPeriod) {
        datesOutsideOfPeriod.push({ time, kills: point.kills });
      }
    }

    let lastKc = datesOutsideOfPeriod.length ? datesOutsideOfPeriod[0].kills : undefined;
    const result = [];

    for (let i = 0; i < this.dates.length; ++i) {
      const time = this.dates[i].getTime();
      if (bucketedData.has(time)) {
        const kc = bucketedData.get(time);
        result.push(kc);
        lastKc = kc;
      } else {
        result.push(lastKc);
      }
    }

    return result;
  }

  labelsForPeriod(period, dates) {
    const normalizedPeriod = BossGraph.normalizedPeriod(period);
    if (normalizedPeriod === "Day") {
      return dates.map((date) => date.toLocaleTimeString([], { hour: "numeric" }));
    } else if (normalizedPeriod === "Week") {
      return dates.map((date) =>
        date.toLocaleString([], { timeZone: "UTC", day: "numeric", month: "short", hour: "numeric" })
      );
    } else if (normalizedPeriod === "Month") {
      return dates.map((date) => date.toLocaleDateString([], { timeZone: "UTC", day: "numeric", month: "short" }));
    } else if (normalizedPeriod === "Year") {
      return dates.map((date) => date.toLocaleDateString([], { timeZone: "UTC", year: "numeric", month: "short" }));
    }
  }

  static datesForPeriod(period) {
    const normalizedPeriod = BossGraph.normalizedPeriod(period);
    const stepCountsForPeriods = {
      Day: 96,
      Week: 168,
      Month: 30,
      Year: 12,
    };
    const count = stepCountsForPeriods[normalizedPeriod];
    const now = BossGraph.truncatedDateForPeriod(new Date(), normalizedPeriod);
    const result = [];

    for (let i = count - 1; i >= 0; --i) {
      const t = new Date(now);

      if (normalizedPeriod === "Day") {
        t.setTime(now.getTime() - i * 900000);
        result.push(t);
        continue;
      }

      if (normalizedPeriod === "Week") {
        t.setTime(now.getTime() - i * 3600000);
        result.push(t);
        continue;
      }

      if (normalizedPeriod === "Month") {
        t.setDate(now.getDate() - i);
      } else if (normalizedPeriod === "Year") {
        t.setMonth(now.getMonth() - i, 1);
      }

      result.push(BossGraph.truncatedDateForPeriod(t, normalizedPeriod));
    }

    return result;
  }

  static truncatedDateForPeriod(date, period) {
    const normalizedPeriod = BossGraph.normalizedPeriod(period);
    const t = new Date(date);

    if (normalizedPeriod === "Day") {
      t.setMinutes(Math.floor(t.getMinutes() / 15) * 15, 0, 0);
      return t;
    }

    if (normalizedPeriod === "Week") {
      t.setMinutes(0, 0, 0);
      return t;
    }

    t.setMinutes(0, 0, 0);
    t.setHours(0);

    if (normalizedPeriod === "Year") {
      t.setMonth(t.getMonth(), 1);
    }

    return t;
  }

  static normalizedPeriod(period) {
    const periods = new Set(["Day", "Week", "Month", "Year"]);
    return periods.has(period) ? period : "Day";
  }
}

customElements.define("boss-graph", BossGraph);
