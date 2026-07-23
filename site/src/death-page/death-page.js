import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";

export class DeathPage extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{death-page.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
    this.period = "Day";

    this.leaderboardContainer = this.querySelector(".death-page__leaderboard");
    this.refreshButton = this.querySelector(".death-page__refresh");
    this.periodSelect = this.querySelector(".death-page__period-select");
    this.eventListener(this.refreshButton, "click", this.handleRefreshClicked.bind(this));
    this.eventListener(this.periodSelect, "change", this.handlePeriodChange.bind(this));

    this.subscribeOnce("get-group-data", this.load.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  handlePeriodChange() {
    this.period = this.periodSelect.value;
    if (this.deathData) {
      this.renderAll();
    }
  }

  handleRefreshClicked() {
    this.subscribeOnce("get-group-data", this.load.bind(this));
  }

  async load() {
    if (!this.isConnected) return;

    try {
      this.deathData = await api.getDeathData();
      this.renderAll();
    } catch (err) {
      console.error(err);
      this.leaderboardContainer.innerHTML = `Failed to load ${err}`;
    }
  }

  renderAll() {
    const cutoff = DeathPage.cutoffForPeriod(this.period);
    const filteredDeaths = this.deathData.map((member) => ({
      name: member.name,
      deaths: member.deaths.filter((death) => new Date(death.time) >= cutoff),
    }));

    this.renderLeaderboard(filteredDeaths);
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

  renderLeaderboard(deathData) {
    const rows = deathData
      .map((member) => {
        const sorted = [...member.deaths].sort((a, b) => new Date(b.time) - new Date(a.time));
        return { name: member.name, count: member.deaths.length, mostRecent: sorted[0] };
      })
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count);

    this.leaderboardContainer.innerHTML = `
<table>
  <thead><tr><th>Name</th><th>Deaths</th><th>Most Recent</th></tr></thead>
  <tbody>
    ${rows
      .map(
        (row) => `
    <tr>
      <td>${row.name}</td>
      <td>${row.count}</td>
      <td>${DeathPage.mostRecentDeathHtml(row.mostRecent)}</td>
    </tr>`
      )
      .join("")}
  </tbody>
</table>`;
  }

  static mostRecentDeathHtml(death) {
    if (!death) return "";
    const img = death.image_url
      ? `<img class="death-page__screenshot" src="${death.image_url}" loading="lazy" onerror="this.style.display='none'" />`
      : "";
    const label = new Date(death.time).toLocaleString();
    const content = `${img}<span>${label}</span>`;
    return death.message_link
      ? `<a class="death-page__recent-link" href="${death.message_link}" target="_blank" rel="noopener">${content}</a>`
      : `<span class="death-page__recent-link">${content}</span>`;
  }
}

customElements.define("death-page", DeathPage);
