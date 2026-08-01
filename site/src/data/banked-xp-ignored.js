import { pubsub } from "./pubsub";

const STORAGE_KEY = "bankedXpIgnoredItems";

// Per-item "exclude this from banked-xp totals" flags for the banked-xp page
// (e.g. herbs being kept for something else, not for training). Persisted in
// localStorage only -- never sent to the server. See banked-xp-selection.js
// for the sibling per-item override store this mirrors.
class BankedXpIgnored {
  constructor() {
    try {
      this.ignored = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY)) || []);
    } catch {
      this.ignored = new Set();
    }
  }

  has(itemId) {
    return this.ignored.has(String(itemId));
  }

  toggle(itemId) {
    const key = String(itemId);
    if (this.ignored.has(key)) {
      this.ignored.delete(key);
    } else {
      this.ignored.add(key);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.ignored]));
    pubsub.publish("banked-xp-ignored-updated");
  }
}

const bankedXpIgnored = new BankedXpIgnored();

export { bankedXpIgnored };
