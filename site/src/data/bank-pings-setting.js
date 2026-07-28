import { api } from "./api";
import { pubsub } from "./pubsub";

// Group-wide switch for the bot's automated "you went offline holding X"
// Discord pings -- loaded once per session (alongside must-bank-items in
// app-initializer.js) so the settings page can reflect and toggle it without
// a page reload. Doesn't affect manually-requested bank pings, only the
// automated noise the toggle exists to quiet down.
class BankPingsSetting {
  constructor() {
    this.enabled = true;
  }

  async load() {
    try {
      this.enabled = await api.getBankPingsEnabled();
      pubsub.publish("bank-pings-enabled-updated", this.enabled);
    } catch (err) {
      console.error("Failed to load bank-pings-enabled setting", err);
    }
  }

  async setEnabled(enabled) {
    this.enabled = enabled;
    pubsub.publish("bank-pings-enabled-updated", this.enabled);
    await api.setBankPingsEnabled(enabled);
  }
}

const bankPingsSetting = new BankPingsSetting();

export { bankPingsSetting };
