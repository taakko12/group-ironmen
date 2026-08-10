/* global Chart */
import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";
import { BOSSES, metricsForBoss, labelForBoss } from "../data/boss";

const bossNameToMetric = new Map(BOSSES.map((boss) => [boss.name, boss.metric]));

export class BossTrackingPage extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{boss-tracking-page.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
    this.period = "Day";
    this.selectedBossMetric = BOSSES[0].metric;

    this.chartContainer = this.querySelector(".boss-tracking-page__chart-container");
    this.periodButtons = this.querySelectorAll(".boss-tracking-page__period-btn");
    this.refreshButton = this.querySelector(".boss-tracking-page__refresh");
    this.bossInput = this.querySelector(".boss-tracking-page__boss-input");
    this.bossInput.value = BOSSES[0].name;

    this.periodButtons.forEach((btn) => {
      this.eventListener(btn, "click", this.handlePeriodChange.bind(this));
    });
    this.eventListener(this.refreshButton, "click", this.handleRefreshClicked.bind(this));
    this.eventListener(this.bossInput, "change", this.handleBossInputChange.bind(this));

    this.subscribeOnce("get-group-data", this.createChart.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  handleBossInputChange() {
    const metric = bossNameToMetric.get(this.bossInput.value);
    if (!metric) {
      // Not a recognized boss name (still typing, or a typo) -- leave the
      // last valid chart up rather than erroring.
      return;
    }
    this.selectedBossMetric = metric;
    this.subscribeOnce("get-group-data", this.createChart.bind(this));
  }

  handlePeriodChange(event) {
    this.period = event.currentTarget.dataset.period;
    this.periodButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.period === this.period);
    });
    this.subscribeOnce("get-group-data", this.createChart.bind(this));
  }

  handleRefreshClicked() {
    this.subscribeOnce("get-group-data", this.createChart.bind(this));
  }

  async createChart() {
    const loader = document.createElement("div");
    loader.classList.add("boss-tracking-page__loader");
    loader.classList.add("loader");
    this.chartContainer.appendChild(loader);

    try {
      const metrics = metricsForBoss(this.selectedBossMetric);
      const [groupBossDataSets] = await Promise.all([
        Promise.all(metrics.map((metric) => api.getWomBossKcTimeline(metric, this.period))),
        this.waitForChartjs(),
      ]);

      this.chartContainer.innerHTML = "";
      Chart.defaults.scale.grid.borderColor = "rgba(255, 255, 255, 0)";
      const style = getComputedStyle(document.body);
      Chart.defaults.color = style.getPropertyValue("--primary-text");
      Chart.defaults.scale.grid.color = style.getPropertyValue("--graph-grid-border");

      const bossGraph = document.createElement("boss-graph");
      bossGraph.groupBossDataSets = groupBossDataSets;
      bossGraph.setAttribute("data-period", this.period);
      bossGraph.setAttribute("boss-label", labelForBoss(this.selectedBossMetric));
      this.chartContainer.appendChild(bossGraph);
    } catch (err) {
      console.error(err);
      this.chartContainer.innerHTML = `Failed to load ${err}`;
    }
  }

  async waitForChartjs() {
    if (!BossTrackingPage.chartJsScriptTag) {
      BossTrackingPage.chartJsScriptTag = document.createElement("script");
      BossTrackingPage.chartJsScriptTag.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js";
      document.body.appendChild(BossTrackingPage.chartJsScriptTag);
    }

    while (typeof Chart === "undefined") {
      await new Promise((resolve) => setTimeout(() => resolve(true), 100));
    }
  }
}

customElements.define("boss-tracking-page", BossTrackingPage);
