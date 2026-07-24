import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";
import { bankRequestSelection } from "../data/bank-request-selection";

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
