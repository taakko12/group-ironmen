import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";
import { Item } from "../data/item";
import { utility } from "../utility";

// Same reasoning as the goals page: the list only changes when someone adds
// an item, but the quantities behind it move whenever anyone plays, so a
// slow refresh keeps it honest without another poll loop worth caring about.
const REFRESH_INTERVAL_MS = 60000;
const MAX_SUGGESTIONS = 25;
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
  }

  html() {
    return `{{gear-goals-page.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();

    this.itemInput = this.querySelector(".gear-goals-page__item-input");
    this.itemList = this.querySelector("#gear-goals-page__item-list");
    this.targetInput = this.querySelector(".gear-goals-page__target");
    this.addButton = this.querySelector(".gear-goals-page__add");
    this.error = this.querySelector(".gear-goals-page__error");
    this.table = this.querySelector(".gear-goals-page__table");

    this.eventListener(this.itemInput, "input", this.handleItemSearch.bind(this));
    this.eventListener(this.addButton, "click", this.handleAdd.bind(this));
    this.eventListener(this.table, "click", this.handleTableClick.bind(this));

    this.renderTable();

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
    this.renderTable();
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

  handleItemSearch() {
    const search = this.itemInput.value.trim().toLowerCase();
    if (search.length < 2) {
      this.itemList.innerHTML = "";
      return;
    }

    let options = "";
    let count = 0;
    for (const [name, itemId] of GearGoalsPage.itemIdsByName()) {
      if (!name.includes(search)) continue;
      options += `<option value="${escapeHtml(Item.itemName(itemId))}"></option>`;
      if (++count >= MAX_SUGGESTIONS) break;
    }
    this.itemList.innerHTML = options;
  }

  async handleAdd() {
    this.error.innerHTML = "";
    const itemId = GearGoalsPage.itemIdsByName().get(this.itemInput.value.trim().toLowerCase());
    const target = parseInt(this.targetInput.value, 10);

    if (itemId === undefined) {
      this.error.innerHTML = "Pick an item from the suggestions";
      return;
    }
    if (isNaN(target) || target < 1) {
      this.error.innerHTML = "Target must be at least 1";
      return;
    }

    this.itemList.innerHTML = "";
    const response = await api.addGearGoal(itemId, target);
    if (!response.ok) {
      this.error.innerHTML = `Could not track that item (server returned ${response.status})`;
      return;
    }

    this.itemInput.value = "";
    this.targetInput.value = 1;
    await this.load();
  }

  async handleTableClick(event) {
    if (!event.target.classList.contains("gear-goals-page__remove")) return;
    const id = parseInt(event.target.closest("tr").dataset.id, 10);
    this.goals = this.goals.filter((goal) => goal.id !== id);
    this.renderTable();
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

  renderTable() {
    if (this.goals.length === 0) {
      this.table.innerHTML = `<div class="gear-goals-page__empty">Nothing tracked yet -- search for an item above.</div>`;
      return;
    }

    const members = this.memberNames();
    const header = members.map((name) => `<th>${escapeHtml(name)}</th>`).join("");
    const rows = this.goals.map((goal) => GearGoalsPage.rowHtml(goal, members)).join("");

    this.table.innerHTML = `
<table class="gear-goals-page__grid">
  <thead>
    <tr><th class="gear-goals-page__item-header">Item</th>${header}<th>Progress</th><th></th></tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`;
  }

  // A target of 1 is a "who still needs this piece" row: every member gets a
  // tick or a blank, and progress counts members. Anything higher is a
  // stockpile (shards, plates, components), where what matters is the group
  // total against the target, so the cells show counts instead.
  static rowHtml(goal, members) {
    const target = goal.target_quantity;
    let total = 0;
    let haveCount = 0;
    let cells = "";

    for (const name of members) {
      const quantity = goal.quantities[name] || 0;
      total += quantity;
      if (quantity > 0) haveCount += 1;
      cells += `<td class="gear-goals-page__cell ${quantity > 0 ? "gear-goals-page__cell--have" : ""}">${
        quantity > 0 ? (target > 1 ? quantity.toLocaleString() : "&check;") : ""
      }</td>`;
    }

    const [current, goalTotal] = target > 1 ? [total, target] : [haveCount, members.length];
    const ratio = goalTotal > 0 ? Math.min(current / goalTotal, 1) : 0;
    // An id the catalog no longer knows about (tracked before an item data
    // update) still gets a row with its quantities -- item-box would throw
    // looking up the image for it.
    const details = Item.itemDetails[goal.item_id];

    return `
<tr data-id="${goal.id}">
  <td class="gear-goals-page__item">
    <div class="gear-goals-page__item-cell">
      ${details ? `<item-box item-id="${goal.item_id}" item-quantity="1" no-tooltip></item-box>` : ""}
      <span>${escapeHtml(details ? details.name : `Item ${goal.item_id}`)}</span>
    </div>
  </td>
  ${cells}
  <td class="gear-goals-page__progress">
    <div class="gear-goals-page__bar"><div class="gear-goals-page__bar-fill" style="width: ${ratio * 100}%"></div></div>
    <span>${current.toLocaleString()} / ${goalTotal.toLocaleString()}</span>
  </td>
  <td><button type="button" class="gear-goals-page__remove men-button small">Remove</button></td>
</tr>`;
  }
}

customElements.define("gear-goals-page", GearGoalsPage);
