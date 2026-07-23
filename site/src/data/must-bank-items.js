import { api } from "./api";
import { pubsub } from "./pubsub";

// Group-wide set of item ids tagged as "must be banked" — loaded once per
// session and kept in sync locally so every item-box reflects tag changes
// immediately without a full reload.
class MustBankItems {
  constructor() {
    this.ids = new Set();
  }

  async load() {
    try {
      const ids = await api.getMustBankItems();
      this.ids = new Set(ids);
      pubsub.publish("must-bank-items-updated");
    } catch (err) {
      console.error("Failed to load must-bank items", err);
    }
  }

  has(itemId) {
    return this.ids.has(itemId);
  }

  async tag(itemId) {
    this.ids.add(itemId);
    pubsub.publish("must-bank-items-updated");
    await api.tagMustBankItem(itemId);
  }

  async untag(itemId) {
    this.ids.delete(itemId);
    pubsub.publish("must-bank-items-updated");
    await api.untagMustBankItem(itemId);
  }
}

const mustBankItems = new MustBankItems();

export { mustBankItems };
