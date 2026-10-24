import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";
import { bankRequestSelection } from "../data/bank-request-selection";
import { groupData } from "../data/group-data";

const ALL_PLAYERS = "@ALL";
// GearScape drops the field after the tag name -- it is the bank tag's icon in
// RuneLite -- so something has to sit there or the first real item is eaten.
const BANK_TAG_ICON = 995;

export class ItemsPage extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{items-page.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();

    this.subscribe("members-updated", this.handleUpdatedMembers.bind(this));

    this.requestBankButton = this.querySelector(".items-page__request-bank");
    this.eventListener(this.requestBankButton, "click", this.handleRequestBankClick.bind(this));
    this.subscribe("bank-request-selection-updated", this.updateRequestBankButton.bind(this));

    this.gearscapeButton = this.querySelector(".items-page__gearscape");
    this.eventListener(this.gearscapeButton, "click", this.handleGearscapeClick.bind(this));
  }

  // GearScape's "Bank Tags" import takes a RuneLite bank tag string and turns
  // the item ids into its include-only list, which is how you tell its best
  // setup search to only consider gear you actually own. Ids it does not
  // recognise as equipment are ignored on their end, so a whole bank is fine.
  static bankTagFor(playerName, members) {
    const ids = new Set();
    for (const member of members) {
      if (playerName !== ALL_PLAYERS && member.name !== playerName) continue;
      for (const storage of [member.bank, member.equipment, member.inventory]) {
        for (const item of storage || []) {
          if (item.id > 0) ids.add(item.id);
        }
      }
    }

    if (ids.size === 0) return null;
    // Commas would split into extra fields; GearScape rejects anything that
    // does not match /^banktags,1,[^,]*(,[0-9]+)+$/.
    const tagName = playerName.replace(/,/g, "");
    return ["banktags", 1, tagName, BANK_TAG_ICON, ...ids].join(",");
  }

  async handleGearscapeClick() {
    const playerName = this.querySelector(".items-page__player-filter").value || ALL_PLAYERS;
    const bankTag = ItemsPage.bankTagFor(playerName, [...groupData.members.values()]);

    if (bankTag === null) {
      this.gearscapeButton.textContent = "No items loaded";
    } else {
      try {
        await navigator.clipboard.writeText(bankTag);
        this.gearscapeButton.textContent = "Copied!";
      } catch (err) {
        // Clipboard access needs a secure context and a real user gesture; if
        // it is refused the tag still has to be reachable by hand.
        console.error("Could not copy the bank tag to the clipboard", err);
        window.prompt("Copy this into GearScape's Bank Tags import:", bankTag);
        this.gearscapeButton.textContent = "Copy GearScape tag";
        return;
      }
    }

    setTimeout(() => {
      this.gearscapeButton.textContent = "Copy GearScape tag";
    }, 2000);
  }

  updateRequestBankButton() {
    const count = bankRequestSelection.size;
    this.requestBankButton.disabled = count === 0;
    this.requestBankButton.textContent = count === 0 ? "Request bank" : `Request bank (${count})`;
  }

  async handleRequestBankClick() {
    const selections = bankRequestSelection.values();
    if (selections.length === 0) return;

    this.requestBankButton.disabled = true;
    try {
      await api.requestBankBatch(selections);
      bankRequestSelection.clear();
    } catch (err) {
      console.error("Failed to send batched bank request", err);
      this.updateRequestBankButton();
    }
  }

  handleUpdatedMembers(members) {
    const playerFilter = this.querySelector(".items-page__player-filter");
    const selected = playerFilter.value;

    let playerOptions = `<option value="@ALL">All Players</option>`;
    for (const member of members) {
      playerOptions += `<option value="${member.name}" ${member.name === selected ? "selected" : ""}>${
        member.name
      }</option>`;
    }

    playerFilter.innerHTML = playerOptions;

    if (playerFilter.value !== selected) {
      playerFilter.dispatchEvent(new CustomEvent("change"));
    }
  }
}
customElements.define("items-page", ItemsPage);
