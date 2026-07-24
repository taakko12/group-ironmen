import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";
import { utility } from "../utility";

const LIVE_REFRESH_INTERVAL_MS = 30000;

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
    this.liveRefreshInterval = window.setInterval(this.handleLiveRefresh.bind(this), LIVE_REFRESH_INTERVAL_MS);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.liveRefreshInterval) {
      window.clearInterval(this.liveRefreshInterval);
    }
  }

  handleLiveRefresh() {
    if (this.currentGroupData) {
      this.loadWomAndRender();
    }
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
    // Only show the loader on a genuinely empty container -- live background
    // refreshes shouldn't blank out cards the user might be reading.
    if (!this.cardsContainer.children.length) {
      this.cardsContainer.innerHTML = '<div class="loader"></div>';
    }

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
    const activeTabs = this.captureActiveTabs();
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
<div class="dashboard-page__card rsborder rsbackground" data-member="${member.name}">
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
    <div class="dashboard-page__stats-subtabs">
      <button type="button" class="dashboard-page__stats-subtab dashboard-page__stats-subtab--active" data-subtab="skills">Skills</button>
      <button type="button" class="dashboard-page__stats-subtab" data-subtab="bosses">Bosses</button>
    </div>
    <div class="dashboard-page__stats-subpanel" data-subpanel="skills">
      ${DashboardPage.skillsGainedHtml(gains)}
    </div>
    <div class="dashboard-page__stats-subpanel dashboard-page__stats-subpanel--hidden" data-subpanel="bosses">
      ${DashboardPage.bossesGainedHtml(gains)}
    </div>
  </div>
</div>`;
      })
      .join("");

    for (const tab of this.cardsContainer.querySelectorAll(".dashboard-page__tab")) {
      this.eventListener(tab, "click", this.handleTabClick.bind(this));
    }
    for (const subtab of this.cardsContainer.querySelectorAll(".dashboard-page__stats-subtab")) {
      this.eventListener(subtab, "click", this.handleStatsSubtabClick.bind(this));
    }

    this.restoreActiveTabs(activeTabs);
  }

  // Live background refreshes rebuild every card's innerHTML, which would
  // otherwise silently reset anyone's open "Stats" tab back to "Overview"
  // every 30 seconds -- capture/restore keeps whatever each card was showing.
  captureActiveTabs() {
    const activeTabs = new Map();
    for (const card of this.cardsContainer.querySelectorAll(".dashboard-page__card")) {
      const member = card.dataset.member;
      if (!member) continue;
      activeTabs.set(member, {
        tab: card.querySelector(".dashboard-page__tab--active")?.dataset.tab,
        subtab: card.querySelector(".dashboard-page__stats-subtab--active")?.dataset.subtab,
      });
    }
    return activeTabs;
  }

  restoreActiveTabs(activeTabs) {
    for (const card of this.cardsContainer.querySelectorAll(".dashboard-page__card")) {
      const saved = activeTabs.get(card.dataset.member);
      if (!saved) continue;
      if (saved.tab) this.setActiveTab(card, saved.tab);
      if (saved.subtab) this.setActiveStatsSubtab(card, saved.subtab);
    }
  }

  handleTabClick(event) {
    const button = event.currentTarget;
    this.setActiveTab(button.closest(".dashboard-page__card"), button.dataset.tab);
  }

  setActiveTab(card, tab) {
    for (const b of card.querySelectorAll(".dashboard-page__tab")) {
      b.classList.toggle("dashboard-page__tab--active", b.dataset.tab === tab);
    }
    for (const panel of card.querySelectorAll(".dashboard-page__tab-panel")) {
      panel.classList.toggle("dashboard-page__tab-panel--hidden", panel.dataset.panel !== tab);
    }
  }

  handleStatsSubtabClick(event) {
    const button = event.currentTarget;
    this.setActiveStatsSubtab(button.closest(".dashboard-page__card"), button.dataset.subtab);
  }

  setActiveStatsSubtab(card, subtab) {
    for (const b of card.querySelectorAll(".dashboard-page__stats-subtab")) {
      b.classList.toggle("dashboard-page__stats-subtab--active", b.dataset.subtab === subtab);
    }
    for (const panel of card.querySelectorAll(".dashboard-page__stats-subpanel")) {
      panel.classList.toggle("dashboard-page__stats-subpanel--hidden", panel.dataset.subpanel !== subtab);
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
    const label = `${drop.item_name} (${drop.gp_value.toLocaleString()} gp)`;
    return DashboardPage.activityHtml(imageUrl, label, drop.message_link);
  }

  static recentDeathHtml(death) {
    if (!death) return '<div class="dashboard-page__no-data">None recorded</div>';
    const label = new Date(death.time).toLocaleString();
    return DashboardPage.activityHtml(death.image_url, label, death.message_link);
  }

  // Clicking the screenshot opens the raw image directly; a small corner
  // button opens the original Discord message instead, so both actions are
  // available without an oversized "View in Discord" label cluttering the
  // card. When there's no screenshot to anchor it to, the Discord link
  // falls back to a small text link instead of a floating overlay.
  static activityHtml(imageUrl, label, messageLink) {
    let media = "";
    if (imageUrl) {
      const discordOverlay = messageLink
        ? `<a class="dashboard-page__discord-link" href="${utility.discordAppLink(messageLink)}" target="_blank" rel="noopener" title="View in Discord">↗</a>`
        : "";
      media = `
<div class="dashboard-page__screenshot-wrap">
  <a class="dashboard-page__screenshot-link" href="${imageUrl}" target="_blank" rel="noopener">
    <img class="dashboard-page__screenshot" src="${imageUrl}" loading="lazy" onerror="this.closest('.dashboard-page__screenshot-wrap').style.display='none'" />
  </a>
  ${discordOverlay}
</div>`;
    }

    const standaloneDiscordLink =
      !imageUrl && messageLink
        ? `<a class="dashboard-page__discord-link dashboard-page__discord-link--standalone" href="${utility.discordAppLink(messageLink)}" target="_blank" rel="noopener">View in Discord ↗</a>`
        : "";

    return `
<div class="dashboard-page__activity-link">
  ${media}
  <span class="dashboard-page__activity-label">${label}</span>
  ${standaloneDiscordLink}
</div>`;
  }
}
customElements.define("dashboard-page", DashboardPage);
