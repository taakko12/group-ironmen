import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";

export class StatsPage extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{stats-page.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
    this.period = "Week";

    this.cardsContainer = this.querySelector(".stats-page__cards");
    this.periodSelect = this.querySelector(".stats-page__period-select");
    this.eventListener(this.periodSelect, "change", this.handlePeriodChange.bind(this));

    this.subscribeOnce("get-group-data", this.load.bind(this));
  }

  handlePeriodChange() {
    this.period = this.periodSelect.value;
    if (this.currentGroupData) {
      this.loadAndRender();
    }
  }

  async load(groupData) {
    if (!this.isConnected) return;
    this.currentGroupData = groupData;
    await this.loadAndRender();
  }

  async loadAndRender() {
    this.cardsContainer.innerHTML = '<div class="loader"></div>';

    try {
      const womGains = await api.getWomGains(this.period);
      this.renderCards(womGains);
    } catch (err) {
      console.error(err);
      this.cardsContainer.innerHTML = `Failed to load ${err}`;
    }
  }

  renderCards(womGains) {
    const members = [...this.currentGroupData.members.values()].filter((member) => member.name !== "@SHARED");

    this.cardsContainer.innerHTML = members
      .map((member) => {
        const gains = womGains[member.name];
        return `
<div class="stats-page__card rsborder rsbackground">
  <h3>${member.name}</h3>
  <div class="stats-page__total-xp">${StatsPage.totalXpHtml(gains)}</div>
  <div class="stats-page__breakdown">
    <div class="stats-page__breakdown-column">
      <h4>Skills Gained</h4>
      ${StatsPage.skillsGainedHtml(gains)}
    </div>
    <div class="stats-page__breakdown-column">
      <h4>Bosses Gained</h4>
      ${StatsPage.bossesGainedHtml(gains)}
    </div>
  </div>
</div>`;
      })
      .join("");
  }

  static totalXpHtml(gains) {
    if (!gains || !gains.xp_gained) return '<span class="stats-page__no-data">No XP gained</span>';
    return `+${gains.xp_gained.toLocaleString()} XP`;
  }

  static skillsGainedHtml(gains) {
    if (!gains || !gains.skills_gained || gains.skills_gained.length === 0) {
      return '<div class="stats-page__no-data">No data</div>';
    }
    return `<div class="stats-page__breakdown-list">${gains.skills_gained
      .map(
        (s) =>
          `<div class="stats-page__breakdown-row"><span>${s.name}</span><span class="stats-page__breakdown-value">+${s.xp.toLocaleString()} xp</span></div>`
      )
      .join("")}</div>`;
  }

  static bossesGainedHtml(gains) {
    if (!gains || !gains.bosses_gained || gains.bosses_gained.length === 0) {
      return '<div class="stats-page__no-data">No data</div>';
    }
    return `<div class="stats-page__breakdown-list">${gains.bosses_gained
      .map(
        (b) =>
          `<div class="stats-page__breakdown-row"><span>${b.name}</span><span class="stats-page__breakdown-value">${b.kills.toLocaleString()} kc</span></div>`
      )
      .join("")}</div>`;
  }
}
customElements.define("stats-page", StatsPage);
