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
  <div class="dashboard-page__tabs">
    <button type="button" class="dashboard-page__tab dashboard-page__tab--active" data-tab="overview">Overview</button>
    <button type="button" class="dashboard-page__tab" data-tab="stats">Stats</button>
  </div>
  <div class="dashboard-page__tab-panel" data-panel="overview">
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
  </div>
  <div class="dashboard-page__tab-panel dashboard-page__tab-panel--hidden" data-panel="stats">
    <div class="dashboard-page__stats-total">${DashboardPage.totalXpHtml(gains)}</div>
    <div class="dashboard-page__stats-columns">
      <div class="dashboard-page__stats-column">
        <h4>Skills</h4>
        ${DashboardPage.skillsGainedHtml(gains)}
      </div>
      <div class="dashboard-page__stats-column">
        <h4>Bosses</h4>
        ${DashboardPage.bossesGainedHtml(gains)}
      </div>
    </div>
  </div>
</div>`;
      })
      .join("");

    for (const tab of this.cardsContainer.querySelectorAll(".dashboard-page__tab")) {
      this.eventListener(tab, "click", this.handleTabClick.bind(this));
    }
  }

  handleTabClick(event) {
    const button = event.currentTarget;
    const card = button.closest(".dashboard-page__card");
    const tab = button.dataset.tab;

    for (const b of card.querySelectorAll(".dashboard-page__tab")) {
      b.classList.toggle("dashboard-page__tab--active", b === button);
    }
    for (const panel of card.querySelectorAll(".dashboard-page__tab-panel")) {
      panel.classList.toggle("dashboard-page__tab-panel--hidden", panel.dataset.panel !== tab);
    }
  }

  static totalXpHtml(gains) {
    if (!gains || !gains.xp_gained) return '<span class="dashboard-page__no-data">No XP gained</span>';
    return `+${gains.xp_gained.toLocaleString()} XP`;
  }

  static skillsGainedHtml(gains) {
    if (!gains || !gains.skills_gained || gains.skills_gained.length === 0) {
      return '<div class="dashboard-page__no-data">No data</div>';
    }
    return `<div class="dashboard-page__stats-list">${gains.skills_gained
      .map(
        (s) =>
          `<div class="dashboard-page__stats-row"><span>${s.name}</span><span class="dashboard-page__stats-value">+${s.xp.toLocaleString()} xp</span></div>`
      )
      .join("")}</div>`;
  }

  static bossesGainedHtml(gains) {
    if (!gains || !gains.bosses_gained || gains.bosses_gained.length === 0) {
      return '<div class="dashboard-page__no-data">No data</div>';
    }
    return `<div class="dashboard-page__stats-list">${gains.bosses_gained
      .map(
        (b) =>
          `<div class="dashboard-page__stats-row"><span>${b.name}</span><span class="dashboard-page__stats-value">${b.kills.toLocaleString()} kc</span></div>`
      )
      .join("")}</div>`;
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
