import { pubsub } from "./pubsub";

// Local-only (never persisted) set of "player + item" checkbox selections
// made on the Items page, so the page's single batch "Request bank" button
// can collect everything checked across however many separate
// <inventory-item> elements are on screen, then fire one batched request and
// clear the selection. Replaces the old per-item-per-player 📢 button that
// sent a request immediately on click.
class BankRequestSelection {
  constructor() {
    this.selections = new Map();
  }

  key(playerName, itemId) {
    return `${playerName}:${itemId}`;
  }

  has(playerName, itemId) {
    return this.selections.has(this.key(playerName, itemId));
  }

  toggle(playerName, itemId, checked) {
    const key = this.key(playerName, itemId);
    if (checked) {
      this.selections.set(key, { playerName, itemId });
    } else {
      this.selections.delete(key);
    }
    pubsub.publish("bank-request-selection-updated");
  }

  get size() {
    return this.selections.size;
  }

  values() {
    return [...this.selections.values()];
  }

  clear() {
    this.selections.clear();
    pubsub.publish("bank-request-selection-updated");
  }
}

const bankRequestSelection = new BankRequestSelection();

export { bankRequestSelection };
