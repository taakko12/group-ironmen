import { BaseElement } from "../base-element/base-element";
import { Item } from "../data/item";
import { Skill } from "../data/skill";
import { BankedXp } from "../data/banked-xp-data";
import { bankedXpSelection } from "../data/banked-xp-selection";

export class BankedXpPage extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{banked-xp-page.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();

    this.expanded = new Set();
    this.members = [];

    this.playerFilter = this.querySelector(".banked-xp-page__player-filter");
    this.list = this.querySelector(".banked-xp-page__list");

    this.eventListener(this.playerFilter, "change", this.renderList.bind(this));
    this.eventListener(this.list, "click", this.handleListClick.bind(this));
    this.eventListener(this.list, "change", this.handleActivityChange.bind(this));

    this.subscribe("members-updated", this.handleUpdatedMembers.bind(this));
    this.subscribe("banked-xp-selection-updated", this.renderList.bind(this));

    BankedXp.loadData().then(this.renderList.bind(this));
  }

  handleUpdatedMembers(members) {
    this.members = members.filter((member) => member.name !== "@SHARED");
    const selected = this.playerFilter.value;

    this.playerFilter.innerHTML = this.members
      .map(
        (member) =>
          `<option value="${member.name}" ${member.name === selected ? "selected" : ""}>${member.name}</option>`
      )
      .join("");

    if (this.playerFilter.value !== selected) {
      this.playerFilter.dispatchEvent(new Event("change"));
    } else {
      this.renderList();
    }
  }

  get selectedMember() {
    return this.members.find((member) => member.name === this.playerFilter.value);
  }

  renderList() {
    const member = this.selectedMember;
    if (!BankedXp.data || !member) {
      this.list.innerHTML = `<div class="banked-xp-page__empty">Loading...</div>`;
      return;
    }

    const bySkill = member.computeBankedXp();
    const skillNames = Object.keys(bySkill).sort((a, b) => bySkill[b].xp - bySkill[a].xp);

    if (skillNames.length === 0) {
      this.list.innerHTML = `<div class="banked-xp-page__empty">No banked XP items found in this player's bank.</div>`;
      return;
    }

    this.list.innerHTML = skillNames.map((skillName) => this.skillRowHtml(skillName, bySkill[skillName])).join("");
  }

  skillRowHtml(skillName, data) {
    const expanded = this.expanded.has(skillName);
    const items = [...data.items].sort((a, b) => b.xp - a.xp);
    return `
<div class="banked-xp-page__skill rsborder-tiny rsbackground" data-skill="${skillName}">
  <button type="button" class="banked-xp-page__skill-head">
    <img class="banked-xp-page__skill-icon" src="${Skill.getIcon(skillName)}" alt="" />
    <span class="banked-xp-page__skill-name">${skillName}</span>
    <span class="banked-xp-page__skill-xp">${Math.round(data.xp).toLocaleString()} xp</span>
  </button>
  <div class="banked-xp-page__items ${expanded ? "" : "banked-xp-page__items--hidden"}">
    ${items.map((item) => this.itemRowHtml(item)).join("")}
  </div>
</div>`;
  }

  itemRowHtml(item) {
    const activityControl =
      item.activities.length > 1
        ? `<select class="banked-xp-page__item-activity">${item.activities
            .map(
              (a) =>
                `<option value="${a.id}" ${a.id === item.activity.id ? "selected" : ""}>${a.name} (${a.xp} xp, lvl ${
                  a.level
                })</option>`
            )
            .join("")}</select>`
        : `<span class="banked-xp-page__item-activity-name">${item.activity.name}</span>`;

    return `
<div class="banked-xp-page__item" data-item-id="${item.itemId}">
  <img class="banked-xp-page__item-icon" src="${Item.imageUrl(item.itemId, item.quantity)}" alt="" />
  <span class="banked-xp-page__item-name">${Item.itemName(item.itemId)} x${item.quantity.toLocaleString()}</span>
  ${activityControl}
  <span class="banked-xp-page__item-xp">${Math.round(item.xp).toLocaleString()} xp</span>
</div>`;
  }

  handleListClick(event) {
    const head = event.target.closest(".banked-xp-page__skill-head");
    if (!head) return;

    const skillName = head.closest(".banked-xp-page__skill").dataset.skill;
    if (this.expanded.has(skillName)) {
      this.expanded.delete(skillName);
    } else {
      this.expanded.add(skillName);
    }
    this.renderList();
  }

  handleActivityChange(event) {
    if (!event.target.classList.contains("banked-xp-page__item-activity")) return;

    const itemId = event.target.closest(".banked-xp-page__item").dataset.itemId;
    bankedXpSelection.set(itemId, event.target.value);
  }
}
customElements.define("banked-xp-page", BankedXpPage);
