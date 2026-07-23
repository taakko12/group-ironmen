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
    this.period = "Week";

    this.cardsContainer = this.querySelector(".dashboard-page__cards");
    this.refreshButton = this.querySelector(".dashboard-page__refresh");
    this.periodSelect = this.querySelector(".dashboard-page__period-select");
    this.eventListener(this.refreshButton, "click", this.handleRefreshClicked.bind(this));
    this.eventListener(this.periodSelect, "change", this.handlePeriodChange.bind(this));

    this.subscribeOnce("get-group-data", this.load.bind(this));
  }

  handlePeriodChange() {
    this.period = this.periodSelect.value;
    if (this.currentGroupData) {
      this.loadWomAndRender();
    }
  }

  handleRefreshClicked() {
    this.subscribeOnce("get-group-data", this.load.bind(this));
  }

  async load(groupData) {
    if (!this.isConnected) return;
    this.currentGroupData = groupData;
    await this.loadWomAndRender();
  }

  async loadWomAndRender() {
    this.cardsContainer.innerHTML = '<div class="loader"></div>';

    try {
      const [womGains, lootData, deathData] = await Promise.all([
        api.getWomGains(this.period),
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
    <div class="dashboard-page__wom-stat">
      <span class="dashboard-page__wom-label">Top Skill</span>
      <span class="dashboard-page__wom-value">${DashboardPage.topSkillHtml(gains)}</span>
    </div>
    <div class="dashboard-page__wom-stat">
      <span class="dashboard-page__wom-label">Top Boss</span>
      <span class="dashboard-page__wom-value">${DashboardPage.topBossHtml(gains)}</span>
    </div>
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

  static topSkillHtml(gains) {
    if (!gains || !gains.top_skill_name) return '<span class="dashboard-page__no-data">No data</span>';
    return `${gains.top_skill_name} (+${gains.top_skill_xp.toLocaleString()} xp)`;
  }

  static topBossHtml(gains) {
    if (!gains || !gains.top_boss_name) return '<span class="dashboard-page__no-data">No data</span>';
    return `${gains.top_boss_name} (${gains.top_boss_kills.toLocaleString()} kc)`;
  }

  static recentDropHtml(drop) {
    if (!drop) return '<div class="dashboard-page__no-data">None recorded</div>';
    const imageUrl = drop.screenshot_url || drop.image_url;
    const img = imageUrl
      ? `<img class="dashboard-page__screenshot" src="${imageUrl}" loading="lazy" onerror="this.style.display='none'" />`
      : "";
    const label = `${drop.item_name} (${drop.gp_value.toLocaleString()} gp)`;
    const content = `${img}<span class="dashboard-page__activity-label">${label}</span>`;
    return drop.message_link
      ? `<a class="dashboard-page__activity-link" href="${drop.message_link}" target="_blank" rel="noopener">${content}</a>`
      : `<div class="dashboard-page__activity-link">${content}</div>`;
  }

  static recentDeathHtml(death) {
    if (!death) return '<div class="dashboard-page__no-data">None recorded</div>';
    const img = death.image_url
      ? `<img class="dashboard-page__screenshot" src="${death.image_url}" loading="lazy" onerror="this.style.display='none'" />`
      : "";
    const label = new Date(death.time).toLocaleString();
    const content = `${img}<span class="dashboard-page__activity-label">${label}</span>`;
    return death.message_link
      ? `<a class="dashboard-page__activity-link" href="${death.message_link}" target="_blank" rel="noopener">${content}</a>`
      : `<div class="dashboard-page__activity-link">${content}</div>`;
  }
}
customElements.define("dashboard-page", DashboardPage);
