/* global Chart */
import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";

export class LootDeaths extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{loot-deaths.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();

    this.leaderboardContainer = this.querySelector(".loot-deaths__leaderboard");
    this.deathsContainer = this.querySelector(".loot-deaths__deaths-list");
    this.chartContainer = this.querySelector(".loot-deaths__chart-container");
    this.refreshButton = this.querySelector(".loot-deaths__refresh");
    this.eventListener(this.refreshButton, "click", this.handleRefreshClicked.bind(this));

    this.subscribeOnce("get-group-data", this.load.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.chart) {
      this.chart.destroy();
    }
  }

  handleRefreshClicked() {
    this.subscribeOnce("get-group-data", this.load.bind(this));
  }

  async load(groupData) {
    if (!this.isConnected) return;
    this.currentGroupData = groupData;

    const loader = document.createElement("div");
    loader.classList.add("loot-deaths__loader");
    loader.classList.add("loader");
    this.chartContainer.appendChild(loader);

    try {
      const [lootData, deathData] = await Promise.all([api.getLootData(), api.getDeathData(), this.waitForChartjs()]);
      this.renderLeaderboard(lootData);
      this.renderDeaths(deathData);
      this.renderChart(lootData);
    } catch (err) {
      console.error(err);
      this.chartContainer.innerHTML = `Failed to load ${err}`;
    }
  }

  renderLeaderboard(lootData) {
    const rows = lootData
      .map((member) => ({
        name: member.name,
        total: member.drops.reduce((sum, drop) => sum + drop.gp_value, 0),
        count: member.drops.length,
      }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.total - a.total);

    this.leaderboardContainer.innerHTML = `
<table>
  <thead><tr><th>Name</th><th>Total Loot</th><th>Drops</th></tr></thead>
  <tbody>
    ${rows
      .map(
        (row) => `
    <tr>
      <td>${row.name}</td>
      <td>${row.total.toLocaleString()} gp</td>
      <td>${row.count}</td>
    </tr>`
      )
      .join("")}
  </tbody>
</table>`;
  }

  renderDeaths(deathData) {
    const entries = [];
    for (const member of deathData) {
      for (const death of member.deaths) {
        entries.push({ name: member.name, time: new Date(death.time) });
      }
    }
    entries.sort((a, b) => b.time - a.time);

    this.deathsContainer.innerHTML = `
<ul>
  ${entries
    .map(
      (entry) => `
  <li><span>${entry.name}</span><span>${entry.time.toLocaleString()}</span></li>`
    )
    .join("")}
</ul>`;
  }

  renderChart(lootData) {
    this.chartContainer.innerHTML = '<canvas class="loot-deaths__canvas"></canvas>';
    const ctx = this.chartContainer.querySelector("canvas").getContext("2d");

    const allTimes = new Set();
    const perMember = lootData.map((member) => {
      const sorted = [...member.drops].sort((a, b) => new Date(a.time) - new Date(b.time));
      let running = 0;
      const points = sorted.map((drop) => {
        running += drop.gp_value;
        const t = new Date(drop.time).getTime();
        allTimes.add(t);
        return { t, total: running };
      });
      return { name: member.name, points };
    });

    const times = [...allTimes].sort((a, b) => a - b);
    const labels = times.map((t) => new Date(t).toLocaleDateString([], { month: "short", day: "numeric" }));

    const datasets = perMember
      .filter((member) => member.points.length > 0)
      .map((member) => {
        let idx = 0;
        let last = 0;
        const data = times.map((t) => {
          while (idx < member.points.length && member.points[idx].t <= t) {
            last = member.points[idx].total;
            idx++;
          }
          return last;
        });
        const color = this.currentGroupData?.members?.get(member.name)?.color;
        return {
          type: "line",
          label: member.name,
          data,
          borderColor: color,
          backgroundColor: color,
          borderWidth: 2,
          pointRadius: 0,
          stepped: true,
        };
      });

    if (this.chart) this.chart.destroy();
    Chart.defaults.scale.grid.borderColor = "rgba(255, 255, 255, 0)";
    const style = getComputedStyle(document.body);
    Chart.defaults.color = style.getPropertyValue("--primary-text");
    Chart.defaults.scale.grid.color = style.getPropertyValue("--graph-grid-border");

    this.chart = new Chart(ctx, {
      type: "line",
      options: {
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          title: { display: true, text: "Total Loot Over Time" },
          tooltip: {
            callbacks: {
              label: (tooltip) => `${tooltip.dataset.label}: ${tooltip.parsed.y.toLocaleString()} gp`,
            },
          },
        },
        interaction: { intersect: false, mode: "index" },
        scales: {
          y: { title: { display: true, text: "Total GP" } },
        },
      },
      data: { labels, datasets },
    });
  }

  async waitForChartjs() {
    if (!LootDeaths.chartJsScriptTag) {
      LootDeaths.chartJsScriptTag = document.createElement("script");
      LootDeaths.chartJsScriptTag.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js";
      document.body.appendChild(LootDeaths.chartJsScriptTag);
    }

    while (typeof Chart === "undefined") {
      await new Promise((resolve) => setTimeout(() => resolve(true), 100));
    }
  }
}

customElements.define("loot-deaths", LootDeaths);
