import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";
import { Item } from "../data/item";

const MIN_SEARCH_LENGTH = 2;
// No monster data says whether you can physically reach a target: Olm's head
// has real melee defence numbers and a halberd scores against them, but you
// cannot walk up to it. So it is a per-boss input.
const STYLES = ["melee", "ranged", "magic"];

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

export class DpsPage extends BaseElement {
  constructor() {
    super();
    this.targets = [];
    this.locked = new Set();
    this.results = [];
  }

  html() {
    return `{{dps-page.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();

    this.memberSelect = this.querySelector(".dps-page__member");
    this.monsterInput = this.querySelector(".dps-page__monster-input");
    this.resultsEl = this.querySelector(".dps-page__results");
    this.budgetInput = this.querySelector(".dps-page__budget-input");
    this.targetsEl = this.querySelector(".dps-page__targets");
    this.error = this.querySelector(".dps-page__error");
    this.output = this.querySelector(".dps-page__output");

    this.eventListener(this.monsterInput, "input", this.handleSearch.bind(this));
    // mousedown, not click: blur would tear the list down first.
    this.eventListener(this.resultsEl, "mousedown", this.handleResultClick.bind(this), { passive: false });
    this.eventListener(document, "mousedown", this.handleDocumentClick.bind(this));
    this.eventListener(this.targetsEl, "click", this.handleTargetClick.bind(this));
    this.eventListener(this.output, "click", this.handleOutputClick.bind(this));
    this.eventListener(this.querySelector(".dps-page__run"), "click", () => this.run(false));
    this.eventListener(this.querySelector(".dps-page__curve"), "click", () => this.run(true));

    this.subscribe("members-updated", this.handleMembers.bind(this));
    this.renderTargets();
    this.output.innerHTML = `<div class="dps-page__empty">Pick a member and some bosses, then Plan.</div>`;
  }

  handleMembers(members) {
    const selected = this.memberSelect.value;
    this.memberSelect.innerHTML = members
      .filter((member) => member.name !== "@SHARED")
      .map((member) => `<option ${member.name === selected ? "selected" : ""}>${escapeHtml(member.name)}</option>`)
      .join("");
  }

  async handleSearch() {
    const query = this.monsterInput.value.trim();
    if (query.length < MIN_SEARCH_LENGTH) {
      this.resultsEl.classList.remove("dps-page__results--open");
      return;
    }

    try {
      this.results = await api.dpsMonsters(query);
    } catch (err) {
      this.error.innerHTML = escapeHtml(err.message);
      return;
    }

    this.resultsEl.classList.add("dps-page__results--open");
    this.resultsEl.innerHTML = this.results.length
      ? this.results
          .map(
            (match, index) =>
              `<div class="dps-page__result" data-index="${index}">${escapeHtml(match.name)}${
                match.version ? ` <span class="dps-page__result-version">[${escapeHtml(match.version)}]</span>` : ""
              }</div>`
          )
          .join("")
      : `<div class="dps-page__result">Nothing matches that.</div>`;
  }

  handleDocumentClick(event) {
    if (!this.contains(event.target)) this.resultsEl.classList.remove("dps-page__results--open");
  }

  handleResultClick(event) {
    const row = event.target.closest(".dps-page__result");
    if (!row || row.dataset.index === undefined) return;
    event.preventDefault();

    const match = this.results[parseInt(row.dataset.index, 10)];
    const already = this.targets.some((t) => t.name === match.name && t.version === match.version);
    // All three styles on by default; you narrow them when a phase cannot be
    // reached the obvious way.
    if (!already) this.targets.push({ name: match.name, version: match.version, styles: [...STYLES] });

    this.monsterInput.value = "";
    this.resultsEl.classList.remove("dps-page__results--open");
    this.renderTargets();
  }

  handleTargetClick(event) {
    const index = parseInt(event.target.dataset.index, 10);
    if (event.target.classList.contains("dps-page__chip-remove")) {
      this.targets.splice(index, 1);
      this.renderTargets();
      return;
    }

    if (!event.target.classList.contains("dps-page__style")) return;
    const target = this.targets[index];
    const style = event.target.dataset.style;
    target.styles = target.styles.includes(style)
      ? target.styles.filter((s) => s !== style)
      : [...target.styles, style];
    this.renderTargets();
  }

  // Locks are toggled on the result itself: you see what it picked, then tell
  // it which of those slots you have already decided and re-plan.
  handleOutputClick(event) {
    if (!event.target.classList.contains("dps-page__lock")) return;
    const name = event.target.dataset.name;
    if (this.locked.has(name)) this.locked.delete(name);
    else this.locked.add(name);
    event.target.classList.toggle("dps-page__lock--on");
    event.target.textContent = this.locked.has(name) ? "🔒" : "🔓";
  }

  renderTargets() {
    this.targetsEl.innerHTML = this.targets
      .map((target, index) => {
        const styles = STYLES.map(
          (style) =>
            `<span class="dps-page__style ${
              target.styles.includes(style) ? "dps-page__style--on" : ""
            }" data-index="${index}" data-style="${style}"
             title="Can this be attacked with ${style}?">${style[0].toUpperCase()}</span>`
        ).join("");
        return `<span class="dps-page__chip">${escapeHtml(target.name)}${
          target.version ? ` <span class="dps-page__result-version">[${escapeHtml(target.version)}]</span>` : ""
        }${styles}<span class="dps-page__chip-remove" data-index="${index}" title="Remove">&times;</span></span>`;
      })
      .join("");
  }

  async run(curve) {
    this.error.innerHTML = "";
    if (this.targets.length === 0) {
      this.error.innerHTML = "Add at least one boss first";
      return;
    }

    this.output.innerHTML = `<div class="dps-page__empty">Planning... this takes a few seconds per boss.</div>`;

    try {
      const result = await api.dpsPlan({
        member: this.memberSelect.value,
        targets: this.targets,
        budget: parseInt(this.budgetInput.value, 10),
        lock: [...this.locked],
        curve,
      });
      this.output.innerHTML = DpsPage.resultHtml(result, this.locked);
    } catch (err) {
      this.output.innerHTML = "";
      this.error.innerHTML = escapeHtml(err.message);
    }
  }

  static itemHtml(itemId, name, locked, extraClass = "") {
    const known = Item.itemDetails[itemId];
    return `
<span class="dps-page__item ${extraClass}">
  ${known ? `<item-box item-id="${itemId}" item-quantity="1" no-tooltip></item-box>` : ""}
  <span>${escapeHtml(name)}</span>
  <span class="dps-page__lock ${locked ? "dps-page__lock--on" : ""}" data-name="${escapeHtml(name)}"
        title="Lock this slot: never searched, never swapped, never costs a switch">${locked ? "🔒" : "🔓"}</span>
</span>`;
  }

  static resultHtml(result, locked) {
    const plan = result.plan;
    const worn = Object.entries(plan.worn)
      .map(([slot, name]) => DpsPage.itemHtml(plan.wornIds[slot], name, locked.has(name)))
      .join("");
    const carried = plan.carried
      .map((item) => DpsPage.itemHtml(item.itemId, item.name, locked.has(item.name), "dps-page__item--carry"))
      .join("");

    const best = Math.max(...plan.perMonster.map((m) => m.dps));
    const fights = plan.perMonster
      .map(
        (fight) => `
<tr>
  <td>${escapeHtml(fight.monster)}</td>
  <td>${fight.dps.toFixed(2)} <span class="dps-page__bar" style="width:${(fight.dps / best) * 70}px"></span></td>
  <td>${escapeHtml(fight.weapon)}</td>
  <td>${fight.swapsFromWorn.length ? escapeHtml(fight.swapsFromWorn.join(", ")) : "&mdash;"}</td>
  <td>${fight.inBag}</td>
</tr>`
      )
      .join("");

    const curve = result.curve
      ? `
<div class="dps-page__panel rsborder-tiny rsbackground">
  <h3>What each switch buys &mdash; fewest worth taking: ${result.recommendedBudget}</h3>
  <table class="dps-page__table">
    <tr><th>Switches</th><th>Avg DPS</th><th>This slot buys</th></tr>
    ${result.curve
      .map(
        (step) =>
          `<tr><td>${step.budget}</td><td>${step.score.toFixed(3)}</td><td>${
            step.marginal > 0 ? "+" : ""
          }${step.marginal.toFixed(3)}</td></tr>`
      )
      .join("")}
  </table>
</div>`
      : "";

    return `
<div class="dps-page__summary">
  ${plan.score.toFixed(3)} avg DPS &middot; gear takes ${plan.switches} inventory slot${plan.switches === 1 ? "" : "s"}
  &middot; ${escapeHtml(result.member)}'s ${result.poolSize} items
</div>
${curve}
<div class="dps-page__panel rsborder-tiny rsbackground">
  <h3>Wear</h3>
  <div class="dps-page__items">${worn}</div>
</div>
<div class="dps-page__panel rsborder-tiny rsbackground">
  <h3>Carry</h3>
  <div class="dps-page__items">${carried || `<span class="dps-page__empty">nothing</span>`}</div>
</div>
<div class="dps-page__panel rsborder-tiny rsbackground">
  <h3>Per fight</h3>
  <table class="dps-page__table">
    <tr><th>Boss</th><th>DPS</th><th>Weapon</th><th>Swap to</th><th>In bag</th></tr>
    ${fights}
  </table>
</div>
<div class="dps-page__caveats">${result.caveats.map(escapeHtml).join(" ")}</div>`;
  }
}

customElements.define("dps-page", DpsPage);
