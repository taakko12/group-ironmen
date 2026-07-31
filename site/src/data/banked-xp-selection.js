import { pubsub } from "./pubsub";

const STORAGE_KEY = "bankedXpActivitySelections";

// Per-item "which activity did the user pick for this item" overrides for
// the banked-xp page (e.g. iron ore -> steel bar instead of the default iron
// bar). Persisted in localStorage only -- never sent to the server, so
// picking activities costs zero backend/DB egress.
class BankedXpSelection {
  constructor() {
    try {
      this.selections = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      this.selections = {};
    }
  }

  get(itemId) {
    return this.selections[itemId];
  }

  set(itemId, activityId) {
    this.selections[itemId] = activityId;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.selections));
    pubsub.publish("banked-xp-selection-updated");
  }
}

const bankedXpSelection = new BankedXpSelection();

export { bankedXpSelection };
