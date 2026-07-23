import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";

export class StorageLogPage extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{storage-log-page.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();

    this.logContainer = this.querySelector(".storage-log-page__log");
    this.refreshButton = this.querySelector(".storage-log-page__refresh");
    this.playerFilter = this.querySelector(".storage-log-page__player-filter");
    this.actionFilter = this.querySelector(".storage-log-page__action-filter");
    this.eventListener(this.refreshButton, "click", this.handleRefreshClicked.bind(this));
    this.eventListener(this.playerFilter, "change", this.handleFilterChange.bind(this));
    this.eventListener(this.actionFilter, "change", this.handleFilterChange.bind(this));
    this.subscribe("members-updated", this.handleUpdatedMembers.bind(this));

    this.subscribeOnce("get-group-data", this.load.bind(this));
  }

  handleUpdatedMembers(members) {
    const selected = this.playerFilter.value;
    let playerOptions = `<option value="@ALL">All Players</option>`;
    for (const member of members) {
      if (member.name === "@SHARED") continue;
      playerOptions += `<option value="${member.name}" ${member.name === selected ? "selected" : ""}>${
        member.name
      }</option>`;
    }
    this.playerFilter.innerHTML = playerOptions;
  }

  handleFilterChange() {
    if (this.logData) this.renderLog();
  }

  handleRefreshClicked() {
    this.subscribeOnce("get-group-data", this.load.bind(this));
  }

  async load(groupData) {
    if (!this.isConnected) return;
    this.currentGroupData = groupData;
    this.logContainer.innerHTML = '<div class="loader"></div>';

    try {
      this.logData = await api.getStorageLog();
      this.renderLog();
    } catch (err) {
      console.error(err);
      this.logContainer.innerHTML = `Failed to load ${err}`;
    }
  }

  renderLog() {
    const selectedPlayer = this.playerFilter.value;
    const selectedAction = this.actionFilter.value;

    const rows = this.logData.filter(
      (entry) =>
        (selectedPlayer === "@ALL" || !selectedPlayer || entry.member_name === selectedPlayer) &&
        (selectedAction === "@ALL" || !selectedAction || entry.action === selectedAction)
    );

    if (rows.length === 0) {
      this.logContainer.innerHTML = '<div class="storage-log-page__no-data">No activity recorded yet</div>';
      return;
    }

    this.logContainer.innerHTML = `
<table>
  <thead><tr><th>Time</th><th>Member</th><th>Action</th><th>Item</th><th>Qty</th><th>Value</th></tr></thead>
  <tbody>
    ${rows.map((entry) => StorageLogPage.rowHtml(entry)).join("")}
  </tbody>
</table>`;
  }

  static rowHtml(entry) {
    const time = new Date(entry.time).toLocaleString();
    const actionLabel =
      entry.action === "deposit"
        ? '<span class="storage-log-page__action storage-log-page__action--deposit">Deposited</span>'
        : '<span class="storage-log-page__action storage-log-page__action--withdraw">Withdrew</span>';
    const value = entry.gp_value ? `${entry.gp_value.toLocaleString()} gp` : "";
    const itemCell = entry.message_link
      ? `<a href="${entry.message_link}" target="_blank" rel="noopener">${entry.item_name}</a>`
      : entry.item_name;

    return `
<tr>
  <td>${time}</td>
  <td>${entry.member_name}</td>
  <td>${actionLabel}</td>
  <td>${itemCell}</td>
  <td>${entry.quantity.toLocaleString()}</td>
  <td>${value}</td>
</tr>`;
  }
}
customElements.define("storage-log-page", StorageLogPage);
