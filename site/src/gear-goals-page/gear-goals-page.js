import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";
import { Item } from "../data/item";
import { utility } from "../utility";

// Same reasoning as the goals page: the list only changes when someone adds
// an item, but the quantities behind it move whenever anyone plays, so a
// slow refresh keeps it honest without another poll loop worth caring about.
const REFRESH_INTERVAL_MS = 60000;
// Low enough that every result still gets an icon and a glance is enough to
// pick from -- a long list of near-identical names is what made the old
// datalist useless.
const MAX_RESULTS = 12;
const MIN_SEARCH_LENGTH = 2;
const SHARED_MEMBER = "@SHARED";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

export class GearGoalsPage extends BaseElement {
  constructor() {
    super();
    this.goals = [];
    this.results = [];
    this.activeResult = -1;
  }

  html() {
    return `{{gear-goals-page.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();

    this.searchInput = this.querySelector(".gear-goals-page__search-input");
    this.resultsEl = this.querySelector(".gear-goals-page__results");
    this.error = this.querySelector(".gear-goals-page__error");
    this.board = this.querySelector(".gear-goals-page__board");

    this.eventListener(this.searchInput, "input", this.handleSearch.bind(this));
    this.eventListener(this.searchInput, "keydown", this.handleSearchKey.bind(this), { passive: false });
    this.eventListener(this.searchInput, "focus", this.handleSearch.bind(this));
    // mousedown, not click: the input's blur would otherwise tear the list
    // down before a click on it ever lands.
    this.eventListener(this.resultsEl, "mousedown", this.handleResultClick.bind(this), { passive: false });
    this.eventListener(document, "mousedown", this.handleDocumentClick.bind(this));
    this.eventListener(this.board, "click", this.handleBoardClick.bind(this));
    this.eventListener(this.board, "change", this.handleTargetChange.bind(this));

    this.renderBoard();

    // Waits for the first group data push the same way the loot page does:
    // on a cold load straight to this URL the api has no credentials and the
    // item catalog is still downloading, so loading any sooner fetches
    // /group/undefined/gear-goals and renders names for an empty catalog.
    this.subscribeOnce("get-group-data", () => {
      this.refreshTimer = utility.callOnInterval(this.load.bind(this), REFRESH_INTERVAL_MS);
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this.refreshTimer);
  }

  async load() {
    try {
      this.goals = await api.getGearGoals();
      this.error.innerHTML = "";
    } catch (err) {
      // A backend without the /gear-goals endpoint answers with something
      // that isn't JSON, so this is the normal failure when the site is
      // newer than the server -- say so instead of silently rendering an
      // empty list, which looks identical to "nothing is tracked yet".
      console.error("Failed to load gear goals", err);
      this.error.innerHTML = `Could not load tracked gear (${escapeHtml(err.message)})`;
      return;
    }
    this.renderBoard();
  }

  // Item names are not unique in the catalog (placeholders, ornament kits,
  // etc. repeat them), so the lowest id for a name wins -- that is the real
  // item for everything you would track gear-wise.
  static itemIdsByName() {
    if (!GearGoalsPage._itemIdsByName) {
      const byName = new Map();
      for (const [id, details] of Object.entries(Item.itemDetails)) {
        const key = details.name.toLowerCase();
        const itemId = parseInt(id, 10);
        if (!byName.has(key) || itemId < byName.get(key)) byName.set(key, itemId);
      }
      GearGoalsPage._itemIdsByName = byName;
    }
    return GearGoalsPage._itemIdsByName;
  }

  // Names that start with what was typed come first: searching "bow" wants
  // Bow before Dark bow before Twisted bow, and the old datalist's raw
  // catalog order buried the obvious answer under incidental matches.
  static search(query, limit = MAX_RESULTS) {
    const search = query.trim().toLowerCase();
    if (search.length < MIN_SEARCH_LENGTH) return [];

    const prefix = [];
    const contains = [];
    for (const [name, itemId] of GearGoalsPage.itemIdsByName()) {
      const at = name.indexOf(search);
      if (at === 0) prefix.push(itemId);
      else if (at > 0 && contains.length < limit) contains.push(itemId);
      if (prefix.length >= limit) break;
    }
    return [...prefix, ...contains].slice(0, limit);
  }

  handleSearch() {
    this.results = GearGoalsPage.search(this.searchInput.value);
    this.activeResult = this.results.length > 0 ? 0 : -1;
    this.renderResults();
  }

  renderResults() {
    const open = this.searchInput.value.trim().length >= MIN_SEARCH_LENGTH;
    this.resultsEl.classList.toggle("gear-goals-page__results--open", open);
    if (!open) return;

    if (this.results.length === 0) {
      this.resultsEl.innerHTML = `<div class="gear-goals-page__results-empty">No items match that.</div>`;
      return;
    }

    const tracked = new Set(this.goals.map((goal) => goal.item_id));
    this.resultsEl.innerHTML = this.results
      .map((itemId, index) => {
        const isTracked = tracked.has(itemId);
        return `
<div class="gear-goals-page__result ${index === this.activeResult ? "gear-goals-page__result--active" : ""} ${
          isTracked ? "gear-goals-page__result--tracked" : ""
        }" data-item-id="${itemId}">
  <item-box item-id="${itemId}" item-quantity="1" no-tooltip></item-box>
  <span>${escapeHtml(Item.itemName(itemId))}</span>
  ${isTracked ? `<span class="gear-goals-page__result-tag">tracked</span>` : ""}
</div>`;
      })
      .join("");
  }

  closeResults() {
    this.resultsEl.classList.remove("gear-goals-page__results--open");
    this.activeResult = -1;
  }

  handleDocumentClick(event) {
    if (!this.contains(event.target)) this.closeResults();
  }

  handleSearchKey(event) {
    if (event.key === "Escape") {
      this.closeResults();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (this.activeResult >= 0) this.track(this.results[this.activeResult]);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

    event.preventDefault();
    if (this.results.length === 0) return;
    const step = event.key === "ArrowDown" ? 1 : -1;
    this.activeResult = (this.activeResult + step + this.results.length) % this.results.length;
    this.renderResults();
  }

  handleResultClick(event) {
    const result = event.target.closest(".gear-goals-page__result");
    if (!result) return;
    event.preventDefault();
    this.track(parseInt(result.dataset.itemId, 10));
  }

  // Everything starts as one-per-member; the only way to get a stockpile is to
  // raise that goal's own target, which reads unambiguously because the input
  // sits beside the count it drives.
  async track(itemId, target = 1) {
    this.error.innerHTML = "";
    if (isNaN(target) || target < 1) {
      this.error.innerHTML = "Target must be at least 1";
      return;
    }

    const response = await api.addGearGoal(itemId, target);
    if (!response.ok) {
      this.error.innerHTML = `Could not track that item (server returned ${response.status})`;
      return;
    }

    this.searchInput.value = "";
    this.closeResults();
    await this.load();
  }

  // Re-posting an item upserts its target, so editing one in place needs no
  // endpoint of its own.
  async handleTargetChange(event) {
    if (!event.target.classList.contains("gear-goals-page__card-target")) return;
    const card = event.target.closest("[data-item-id]");
    await this.track(parseInt(card.dataset.itemId, 10), parseInt(event.target.value, 10));
  }

  async handleBoardClick(event) {
    if (!event.target.classList.contains("gear-goals-page__remove")) return;
    const id = parseInt(event.target.closest("[data-id]").dataset.id, 10);
    this.goals = this.goals.filter((goal) => goal.id !== id);
    this.renderBoard();
    await api.deleteGearGoal(id);
    await this.load();
  }

  // @SHARED is group storage rather than a person, so it sits on the end of
  // the member columns instead of sorting to the front on its '@'.
  memberNames() {
    const names = new Set();
    for (const goal of this.goals) {
      for (const name of Object.keys(goal.quantities)) names.add(name);
    }
    return [...names].sort((a, b) => {
      if (a === SHARED_MEMBER) return 1;
      if (b === SHARED_MEMBER) return -1;
      return a.localeCompare(b);
    });
  }

  renderBoard() {
    if (this.goals.length === 0) {
      this.board.innerHTML = `<div class="gear-goals-page__empty">Nothing tracked yet -- search for an item above.</div>`;
      return;
    }

    const members = this.memberNames();
    // Unfinished work first so the page opens on what still needs doing,
    // then alphabetical so a refresh never reshuffles equals.
    const ordered = [...this.goals].sort((a, b) => {
      const done = Number(GearGoalsPage.progress(a, members).done) - Number(GearGoalsPage.progress(b, members).done);
      return done !== 0 ? done : GearGoalsPage.nameOf(a).localeCompare(GearGoalsPage.nameOf(b));
    });

    this.board.innerHTML = ordered.map((goal) => GearGoalsPage.cardHtml(goal, members)).join("");
  }

  static nameOf(goal) {
    const details = Item.itemDetails[goal.item_id];
    return details ? details.name : `Item ${goal.item_id}`;
  }

  // A target of 1 is a "who still needs this piece" row and counts members.
  // Anything higher is a stockpile (shards, plates, components), where what
  // matters is the group total against the target.
  static progress(goal, members) {
    let total = 0;
    let haveCount = 0;
    for (const name of members) {
      const quantity = goal.quantities[name] || 0;
      total += quantity;
      if (quantity > 0) haveCount += 1;
    }

    const stockpile = goal.target_quantity > 1;
    const current = stockpile ? total : haveCount;
    const goalTotal = stockpile ? goal.target_quantity : members.length;
    return {
      current,
      goalTotal,
      stockpile,
      done: goalTotal > 0 && current >= goalTotal,
      ratio: goalTotal > 0 ? Math.min(current / goalTotal, 1) : 0,
    };
  }

  static cardHtml(goal, members) {
    const { current, goalTotal, stockpile, done, ratio } = GearGoalsPage.progress(goal, members);
    // An id the catalog no longer knows about (tracked before an item data
    // update) still gets a card with its quantities -- item-box would throw
    // looking up the image for it.
    const details = Item.itemDetails[goal.item_id];
    const name = escapeHtml(GearGoalsPage.nameOf(goal));

    const chips = members
      .map((memberName) => {
        const quantity = goal.quantities[memberName] || 0;
        const label = memberName === SHARED_MEMBER ? "Shared" : memberName;
        return `
<span class="gear-goals-page__chip ${quantity > 0 ? "gear-goals-page__chip--have" : ""} ${
          memberName === SHARED_MEMBER ? "gear-goals-page__chip--shared" : ""
        }">
  <span>${escapeHtml(label)}</span>
  ${quantity > 0 && stockpile ? `<span class="gear-goals-page__chip-count">${quantity.toLocaleString()}</span>` : ""}
  ${quantity > 0 && !stockpile ? `<span class="gear-goals-page__chip-count">&check;</span>` : ""}
</span>`;
      })
      .join("");

    return `
<div class="gear-goals-page__card rsborder-tiny rsbackground ${done ? "gear-goals-page__card--done" : ""}"
     data-id="${goal.id}" data-item-id="${goal.item_id}">
  ${
    details
      ? `<item-box class="gear-goals-page__card-icon" item-id="${goal.item_id}" item-quantity="1" no-tooltip></item-box>`
      : `<span class="gear-goals-page__card-icon"></span>`
  }
  <div class="gear-goals-page__card-head">
    <span class="gear-goals-page__card-name">${name}</span>
    <span class="gear-goals-page__card-count">${current.toLocaleString()} / ${goalTotal.toLocaleString()}</span>
  </div>
  <div class="gear-goals-page__members">${chips}</div>
  <div class="gear-goals-page__actions">
    <div class="gear-goals-page__bar"><div class="gear-goals-page__bar-fill" style="width: ${ratio * 100}%"></div></div>
    <label class="gear-goals-page__target">
      <span class="gear-goals-page__target-label">target</span>
      <input type="number" class="gear-goals-page__card-target" min="1" value="${goal.target_quantity}"
             title="1 means every member needs one of these; higher pools the group's total instead" />
    </label>
    <button type="button" class="gear-goals-page__remove men-button small" title="Stop tracking ${name}">&times;</button>
  </div>
</div>`;
  }
}

customElements.define("gear-goals-page", GearGoalsPage);
