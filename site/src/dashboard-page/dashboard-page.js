import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";

export class DashboardPage extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{dashboard-page.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();

    this.cardsContainer = this.querySelector(".dashboard-page__cards");
    this.refreshButton = this.querySelector(".dashboard-page__refresh");
    this.eventListener(this.refreshButton, "click", this.handleRefreshClicked.bind(this));

    this.subscribeOnce("get-group-data", this.load.bind(this));
  }

  handleRefreshClicked() {
    this.subscribeOnce("get-group-data", this.load.bind(this));
  }

  async load(groupData) {
    if (!this.isConnected) return;
    this.currentGroupData = groupData;

    this.cardsContainer.innerHTML = '<div class="loader"></div>';

    try {
      const [womGains, lootData, deathData] = await Promise.all([
        api.getWomGains(),
        api.getLootData(),
        api.getDeathData(),
      ]);
      this.renderCards(womGains, lootData, deathData);
    } catch (err) {
      console.error(err);
      this.cardsContainer.innerHTML = `Failed to load ${err}`;
    }
  }

  renderCards(womGains, lootData, deathData) {
    const members = [...this.currentGroupData.members.values()].filter((member) => member.name !== "@SHARED");
    const lootByName = new Map(lootData.map((member) => [member.name, member.drops]));
    const deathByName = new Map(deathData.map((member) => [member.name, member.deaths]));

    this.cardsContainer.innerHTML = members
      .map((member) => {
        const gains = womGains[member.name];
        const drops = lootByName.get(member.name) ?? [];
        const deaths = deathByName.get(member.name) ?? [];
        const mostRecentDrop = [...drops].sort((a, b) => new Date(b.time) - new Date(a.time))[0];
        const mostRecentDeath = [...deaths].sort((a, b) => new Date(b.time) - new Date(a.time))[0];

        return `
<div class="dashboard-page__card rsborder rsbackground">
  <h3>${member.name}</h3>
  <div class="dashboard-page__wom">
    ${
      gains
        ? `<span>XP gained (7d): ${gains.xp_gained.toLocaleString()}</span><span>Kills gained (7d): ${gains.kills_gained.toLocaleString()}</span>`
        : `<span class="dashboard-page__no-data">No WOM data yet</span>`
    }
  </div>
  <div class="dashboard-page__activity">
    <div class="dashboard-page__activity-item">
      <h4>Most Recent Drop</h4>
      ${DashboardPage.recentDropHtml(mostRecentDrop)}
    </div>
    <div class="dashboard-page__activity-item">
      <h4>Most Recent Death</h4>
      ${DashboardPage.recentDeathHtml(mostRecentDeath)}
    </div>
  </div>
</div>`;
      })
      .join("");
  }

  static recentDropHtml(drop) {
    if (!drop) return '<span class="dashboard-page__no-data">None recorded</span>';
    const imageUrl = drop.screenshot_url || drop.image_url;
    const img = imageUrl
      ? `<img class="dashboard-page__screenshot" src="${imageUrl}" loading="lazy" onerror="this.style.display='none'" />`
      : "";
    const label = `${drop.item_name} (${drop.gp_value.toLocaleString()} gp)`;
    const content = `${img}<span>${label}</span>`;
    return drop.message_link
      ? `<a href="${drop.message_link}" target="_blank" rel="noopener">${content}</a>`
      : content;
  }

  static recentDeathHtml(death) {
    if (!death) return '<span class="dashboard-page__no-data">None recorded</span>';
    const img = death.image_url
      ? `<img class="dashboard-page__screenshot" src="${death.image_url}" loading="lazy" onerror="this.style.display='none'" />`
      : "";
    const label = new Date(death.time).toLocaleString();
    const content = `${img}<span>${label}</span>`;
    return death.message_link
      ? `<a href="${death.message_link}" target="_blank" rel="noopener">${content}</a>`
      : content;
  }
}
customElements.define("dashboard-page", DashboardPage);
