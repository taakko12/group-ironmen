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

    this.list = this.querySelector(".banked-xp-page__list");

    this.eventListener(this.list, "click", this.handleListClick.bind(this));
    this.eventListener(this.list, "change", this.handleActivityChange.bind(this));

    this.subscribe("members-updated", this.handleUpdatedMembers.bind(this));
    this.subscribe("banked-xp-selection-updated", this.renderAll.bind(this));

    BankedXp.loadData().then(this.renderAll.bind(this));
  }

  handleUpdatedMembers(members) {
    this.members = members.filter((member) => member.name !== "@SHARED");
    this.renderAll();
  }

  renderAll() {
    if (!BankedXp.data || this.members.length === 0) {
      this.list.innerHTML = `<div class="banked-xp-page__empty">Loading...</div>`;
      return;
    }

    this.list.innerHTML = this.members.map((member) => this.memberSectionHtml(member)).join("");
  }

  memberSectionHtml(member) {
    const bySkill = member.computeBankedXp();
    const skillNames = Object.keys(bySkill).sort((a, b) => bySkill[b].effectiveXp - bySkill[a].effectiveXp);

    if (skillNames.length === 0) {
      return `
<div class="banked-xp-page__member" data-member="${member.name}">
  <h3 class="banked-xp-page__member-name">${member.name}</h3>
  <div class="banked-xp-page__empty">No banked XP items found in this player's bank.</div>
</div>`;
    }

    const totalXp = skillNames.reduce((sum, name) => sum + bySkill[name].xp, 0);
    const totalEffectiveXp = skillNames.reduce((sum, name) => sum + bySkill[name].effectiveXp, 0);

    return `
<div class="banked-xp-page__member" data-member="${member.name}">
  <h3 class="banked-xp-page__member-name">
    ${member.name}
    <span class="banked-xp-page__member-total">${BankedXpPage.xpDisplayHtml(totalXp, totalEffectiveXp)}</span>
  </h3>
  <div class="banked-xp-page__skills">
    ${skillNames.map((skillName) => this.skillRowHtml(member.name, skillName, bySkill[skillName])).join("")}
  </div>
</div>`;
  }

  skillRowHtml(memberName, skillName, data) {
    const expanded = this.expanded.has(`${memberName}:${skillName}`);
    const items = [...data.items].sort((a, b) => b.effectiveXp - a.effectiveXp);
    return `
<div class="banked-xp-page__skill rsborder-tiny rsbackground" data-skill="${skillName}">
  <button type="button" class="banked-xp-page__skill-head">
    <img class="banked-xp-page__skill-icon" src="${Skill.getIcon(skillName)}" alt="" />
    <span class="banked-xp-page__skill-name">${skillName}</span>
    <span class="banked-xp-page__skill-xp">${BankedXpPage.xpDisplayHtml(data.xp, data.effectiveXp)}</span>
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
  <span class="banked-xp-page__item-name" title="${Item.itemName(
    item.itemId
  )} x${item.quantity.toLocaleString()}">${Item.itemName(item.itemId)} x${item.quantity.toLocaleString()}</span>
  ${activityControl}
  ${BankedXpPage.secondariesHtml(item)}
  <span class="banked-xp-page__item-xp">${BankedXpPage.xpDisplayHtml(item.xp, item.effectiveXp)}</span>
</div>`;
  }

  static secondariesHtml(item) {
    if (item.secondaries.length === 0) return "";

    return `<span class="banked-xp-page__secondaries">${item.secondaries
      .map((secondary) => {
        const needed = item.quantity * secondary.qty;
        const short = secondary.have < needed;
        const name = Item.itemName(secondary.itemId);
        return `
<span class="banked-xp-page__secondary ${
          short ? "banked-xp-page__secondary--short" : ""
        }" title="${name}: have ${Math.floor(secondary.have).toLocaleString()}, need ${Math.ceil(
          needed
        ).toLocaleString()}">
  <img class="banked-xp-page__secondary-icon" src="${Item.imageUrl(secondary.itemId, secondary.have)}" alt="" />
  <span class="banked-xp-page__secondary-name">${name}</span>
  <span class="banked-xp-page__secondary-count">${Math.floor(secondary.have).toLocaleString()}/${Math.ceil(
          needed
        ).toLocaleString()}</span>
</span>`;
      })
      .join("")}</span>`;
  }

  // "Obtainable" (bold, prominent) is what the member can actually get right
  // now given secondaries on hand; "Potential" (smaller, muted) is what it'd
  // be with unlimited secondaries. Only shows Potential when it differs from
  // Obtainable -- an item with no secondary requirement (the common case)
  // just shows one number instead of the same value twice with a label
  // nobody needs.
  static xpDisplayHtml(xp, effectiveXp) {
    if (Math.round(xp) === Math.round(effectiveXp)) {
      return `<span class="banked-xp-page__xp-obtainable">${Math.round(xp).toLocaleString()} xp</span>`;
    }
    const obtainable = `<span class="banked-xp-page__xp-obtainable">${Math.round(
      effectiveXp
    ).toLocaleString()} xp <span class="banked-xp-page__xp-label">obtainable</span></span>`;
    const potential = `<span class="banked-xp-page__xp-potential">${Math.round(
      xp
    ).toLocaleString()} xp <span class="banked-xp-page__xp-label">potential</span></span>`;
    return `${obtainable}${potential}`;
  }

  handleListClick(event) {
    const head = event.target.closest(".banked-xp-page__skill-head");
    if (!head) return;

    const memberName = head.closest(".banked-xp-page__member").dataset.member;
    const skillName = head.closest(".banked-xp-page__skill").dataset.skill;
    const key = `${memberName}:${skillName}`;
    if (this.expanded.has(key)) {
      this.expanded.delete(key);
    } else {
      this.expanded.add(key);
    }
    this.renderAll();
  }

  handleActivityChange(event) {
    if (!event.target.classList.contains("banked-xp-page__item-activity")) return;

    const itemId = event.target.closest(".banked-xp-page__item").dataset.itemId;
    bankedXpSelection.set(itemId, event.target.value);
  }
}
customElements.define("banked-xp-page", BankedXpPage);
