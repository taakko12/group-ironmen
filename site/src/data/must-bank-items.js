import { api } from "./api";
import { pubsub } from "./pubsub";
import { Item } from "./item";

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

  // Tags every variant of this item (e.g. tagging "Tumeken's shadow" also
  // tags "Tumeken's shadow (uncharged)") so a group member holding whichever
  // variant they happened to get still trips the must-bank ping and shows up
  // in the RuneLite bank tag, instead of only the exact id someone clicked.
  async tag(itemId) {
    const variantIds = Item.variantIds(itemId);
    for (const id of variantIds) this.ids.add(id);
    pubsub.publish("must-bank-items-updated");
    await Promise.all(variantIds.map((id) => api.tagMustBankItem(id)));
  }

  async untag(itemId) {
    const variantIds = Item.variantIds(itemId);
    for (const id of variantIds) this.ids.delete(id);
    pubsub.publish("must-bank-items-updated");
    await Promise.all(variantIds.map((id) => api.untagMustBankItem(id)));
  }
}

const mustBankItems = new MustBankItems();

export { mustBankItems };
