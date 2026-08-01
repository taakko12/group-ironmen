import { pubsub } from "./pubsub";

const STORAGE_KEY = "bankedXpEnabledModifiers";

// Which BankedXpModifiers ids the viewer has toggled on for the banked-xp
// page (e.g. "I wear the Carpenter's Outfit"). Persisted in localStorage
// only -- never sent to the server. See banked-xp-ignored.js for the sibling
// store this mirrors.
class BankedXpModifierSelection {
  constructor() {
    try {
      this.enabled = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY)) || []);
    } catch {
      this.enabled = new Set();
    }
  }

  has(modifierId) {
    return this.enabled.has(modifierId);
  }

  toggle(modifierId) {
    if (this.enabled.has(modifierId)) {
      this.enabled.delete(modifierId);
    } else {
      this.enabled.add(modifierId);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.enabled]));
    pubsub.publish("banked-xp-modifier-updated");
  }
}

const bankedXpModifierSelection = new BankedXpModifierSelection();

export { bankedXpModifierSelection };
