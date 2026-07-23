/* global Chart */
import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";

export class LootPage extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{loot-page.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
    this.period = "Day";

    this.leaderboardContainer = this.querySelector(".loot-page__leaderboard");
    this.logContainer = this.querySelector(".loot-page__log");
    this.chartContainer = this.querySelector(".loot-page__chart-container");
    this.refreshButton = this.querySelector(".loot-page__refresh");
    this.periodSelect = this.querySelector(".loot-page__period-select");
    this.playerFilter = this.querySelector(".loot-page__player-filter");
    this.eventListener(this.refreshButton, "click", this.handleRefreshClicked.bind(this));
    this.eventListener(this.periodSelect, "change", this.handlePeriodChange.bind(this));
    this.eventListener(this.playerFilter, "change", this.handlePlayerFilterChange.bind(this));
    this.subscribe("members-updated", this.handleUpdatedMembers.bind(this));

    this.subscribeOnce("get-group-data", this.load.bind(this));
  }

  handleUpdatedMembers(members) {
    const selected = this.playerFilter.value;

    let playerOptions = `<option value="@ALL">All Players</option>`;
    for (const member of members) {
      playerOptions += `<option value="${member.name}" ${member.name === selected ? "selected" : ""}>${
        member.name
      }</option>`;
    }

    this.playerFilter.innerHTML = playerOptions;
  }

  handlePlayerFilterChange() {
    if (this.lootData) {
      this.renderAll();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.chart) {
      this.chart.destroy();
    }
  }

  handlePeriodChange() {
    this.period = this.periodSelect.value;
    if (this.lootData) {
      this.renderAll();
    }
  }

  handleRefreshClicked() {
    this.subscribeOnce("get-group-data", this.load.bind(this));
  }

  async load(groupData) {
    if (!this.isConnected) return;
    this.currentGroupData = groupData;

    const loader = document.createElement("div");
    loader.classList.add("loot-page__loader");
    loader.classList.add("loader");
    this.chartContainer.appendChild(loader);

    try {
      const [lootData] = await Promise.all([api.getLootData(), this.waitForChartjs()]);
      this.lootData = lootData;
      this.renderAll();
    } catch (err) {
      console.error(err);
      this.chartContainer.innerHTML = `Failed to load ${err}`;
    }
  }

  renderAll() {
    const cutoff = LootPage.cutoffForPeriod(this.period);
    const selectedPlayer = this.playerFilter.value;
    const filteredLoot = this.lootData
      .filter((member) => selectedPlayer === "@ALL" || !selectedPlayer || member.name === selectedPlayer)
      .map((member) => ({
        name: member.name,
        drops: member.drops.filter((drop) => new Date(drop.time) >= cutoff),
      }));

    this.renderLeaderboard(filteredLoot);
    this.renderChart(filteredLoot);
    this.renderLog(filteredLoot);
  }

  renderLog(lootData) {
    const entries = lootData
      .flatMap((member) => member.drops.map((drop) => ({ ...drop, memberName: member.name })))
      .sort((a, b) => new Date(b.time) - new Date(a.time));

    if (entries.length === 0) {
      this.logContainer.innerHTML = '<div class="loot-page__no-data">No drops recorded</div>';
      return;
    }

    this.logContainer.innerHTML = `
<table>
  <thead><tr><th>Time</th><th>Player</th><th>Item</th><th>Value</th></tr></thead>
  <tbody>
    ${entries.map((entry) => LootPage.logRowHtml(entry)).join("")}
  </tbody>
</table>`;
  }

  static logRowHtml(entry) {
    const time = new Date(entry.time).toLocaleString();
    const itemCell = entry.message_link
      ? `<a href="${entry.message_link}" target="_blank" rel="noopener">${entry.item_name}</a>`
      : entry.item_name;

    return `
<tr>
  <td>${time}</td>
  <td>${entry.memberName}</td>
  <td>${itemCell}</td>
  <td>${entry.gp_value.toLocaleString()} gp</td>
</tr>`;
  }

  static periodLabel(period) {
    return period === "AllTime" ? "All Time" : period;
  }

  static cutoffForPeriod(period) {
    const now = Date.now();
    const day = 24 * 3600 * 1000;
    switch (period) {
      case "AllTime":
        return new Date(0);
      case "Week":
        return new Date(now - 7 * day);
      case "Month":
        return new Date(now - 30 * day);
      case "Year":
        return new Date(now - 365 * day);
      case "Day":
      default:
        return new Date(now - day);
    }
  }

  renderLeaderboard(lootData) {
    const rows = lootData
      .map((member) => {
        const sorted = [...member.drops].sort((a, b) => new Date(b.time) - new Date(a.time));
        return {
          name: member.name,
          total: member.drops.reduce((sum, drop) => sum + drop.gp_value, 0),
          count: member.drops.length,
          mostRecent: sorted[0],
        };
      })
      .filter((row) => row.count > 0)
      .sort((a, b) => b.total - a.total);

    this.leaderboardContainer.innerHTML = `
<table>
  <thead><tr><th>Name</th><th>Total Loot</th><th>Drops</th><th>Most Recent</th></tr></thead>
  <tbody>
    ${rows
      .map(
        (row) => `
    <tr>
      <td>${row.name}</td>
      <td>${row.total.toLocaleString()} gp</td>
      <td>${row.count}</td>
      <td>${LootPage.mostRecentDropHtml(row.mostRecent)}</td>
    </tr>`
      )
      .join("")}
  </tbody>
</table>`;
  }

  static mostRecentDropHtml(drop) {
    if (!drop) return "";
    const imageUrl = drop.screenshot_url || drop.image_url;
    const img = imageUrl
      ? `<img class="loot-page__screenshot" src="${imageUrl}" loading="lazy" onerror="this.style.display='none'" />`
      : "";
    const label = `${drop.item_name} (${drop.gp_value.toLocaleString()} gp)`;
    const content = `${img}<span>${label}</span>`;
    return drop.message_link
      ? `<a class="loot-page__recent-link" href="${drop.message_link}" target="_blank" rel="noopener">${content}</a>`
      : `<span class="loot-page__recent-link">${content}</span>`;
  }

  renderChart(lootData) {
    this.chartContainer.innerHTML = '<canvas class="loot-page__canvas"></canvas>';
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
          title: { display: true, text: `Total Loot Over Time - ${LootPage.periodLabel(this.period)}` },
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
    if (!LootPage.chartJsScriptTag) {
      LootPage.chartJsScriptTag = document.createElement("script");
      LootPage.chartJsScriptTag.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js";
      document.body.appendChild(LootPage.chartJsScriptTag);
    }

    while (typeof Chart === "undefined") {
      await new Promise((resolve) => setTimeout(() => resolve(true), 100));
    }
  }
}

customElements.define("loot-page", LootPage);
