import { pubsub } from "./pubsub";
import { utility } from "../utility";
import { groupData } from "./group-data";
import { exampleData } from "./example-data";

class Api {
  constructor() {
    this.baseUrl = "/api";
    this.createGroupUrl = `${this.baseUrl}/create-group`;
    this.exampleDataEnabled = false;
    this.enabled = false;
  }

  get liveUrl() {
    // EventSource can't set custom headers, so the token travels as a query
    // param here instead of the Authorization header every other endpoint uses.
    return `${this.baseUrl}/group/${this.groupName}/live?token=${encodeURIComponent(this.groupToken)}`;
  }

  get getGroupDataUrl() {
    return `${this.baseUrl}/group/${this.groupName}/get-group-data`;
  }

  get addMemberUrl() {
    return `${this.baseUrl}/group/${this.groupName}/add-group-member`;
  }

  get deleteMemberUrl() {
    return `${this.baseUrl}/group/${this.groupName}/delete-group-member`;
  }

  get renameMemberUrl() {
    return `${this.baseUrl}/group/${this.groupName}/rename-group-member`;
  }

  get memberDiscordIdUrl() {
    return `${this.baseUrl}/group/${this.groupName}/member-discord-id`;
  }

  get memberColorUrl() {
    return `${this.baseUrl}/group/${this.groupName}/member-color`;
  }

  get mustBankItemsUrl() {
    return `${this.baseUrl}/group/${this.groupName}/must-bank-items`;
  }

  get bankPingsEnabledUrl() {
    return `${this.baseUrl}/group/${this.groupName}/bank-pings-enabled`;
  }

  get goalsUrl() {
    return `${this.baseUrl}/group/${this.groupName}/goals`;
  }

  get goalDoneUrl() {
    return `${this.baseUrl}/group/${this.groupName}/goal-done`;
  }

  get requestBankUrl() {
    return `${this.baseUrl}/group/${this.groupName}/request-bank`;
  }

  get requestBankBatchUrl() {
    return `${this.baseUrl}/group/${this.groupName}/request-bank-batch`;
  }

  get womGainsUrl() {
    return `${this.baseUrl}/group/${this.groupName}/wom-gains`;
  }

  get amILoggedInUrl() {
    return `${this.baseUrl}/group/${this.groupName}/am-i-logged-in`;
  }

  get gePricesUrl() {
    return `${this.baseUrl}/ge-prices`;
  }

  get skillDataUrl() {
    return `${this.baseUrl}/group/${this.groupName}/get-skill-data`;
  }

  get lootDataUrl() {
    return `${this.baseUrl}/group/${this.groupName}/get-loot-data`;
  }

  get deathDataUrl() {
    return `${this.baseUrl}/group/${this.groupName}/get-death-data`;
  }

  get captchaEnabledUrl() {
    return `${this.baseUrl}/captcha-enabled`;
  }

  setCredentials(groupName, groupToken) {
    this.groupName = groupName;
    this.groupToken = groupToken;
  }

  async restart() {
    const groupName = this.groupName;
    const groupToken = this.groupToken;
    await this.enable(groupName, groupToken);
  }

  async enable(groupName, groupToken) {
    await this.disable();
    this.setCredentials(groupName, groupToken);

    if (!this.enabled) {
      this.enabled = true;
      if (this.exampleDataEnabled) {
        // getGroupInterval is a Promise so we can make sure this method does not leak
        // any intervals with multiple calls to .enable(). This could be possible because of
        // the wait for the item and quest data loads before we create the interval.
        this.getGroupInterval = pubsub.waitForAllEvents("item-data-loaded", "quest-data-loaded").then(() => {
          return utility.callOnInterval(this.getGroupData.bind(this), 5000);
        });
        await this.getGroupInterval;
      } else {
        await pubsub.waitForAllEvents("item-data-loaded", "quest-data-loaded");
        // The real backend now pushes updates over /live instead of being
        // polled every few seconds (see connectLive()), so there's no
        // recurring request left to catch a bad/revoked token on. Check
        // once up front instead -- a token that goes bad *after* this,
        // while still connected, won't be caught; EventSource will just
        // keep quietly retrying the connection rather than redirecting to
        // login. Accepted gap: catching that too would mean bringing back
        // a periodic request, which is exactly what this change removes.
        const loggedIn = await this.amILoggedIn();
        if (!loggedIn.ok) {
          await this.disable();
          window.history.pushState("", "", "/login");
          pubsub.publish("get-group-data");
          return;
        }
        this.connectLive();
      }
    }
  }

  async disable() {
    this.enabled = false;
    this.groupName = undefined;
    this.groupToken = undefined;
    groupData.members = new Map();
    groupData.groupItems = {};
    groupData.filters = [""];
    if (this.liveSource) {
      this.liveSource.close();
      this.liveSource = undefined;
    }
    if (this.getGroupInterval) {
      window.clearInterval(await this.getGroupInterval);
    }
  }

  connectLive() {
    const source = new EventSource(this.liveUrl);
    this.liveSource = source;
    source.addEventListener("message", (event) => this.handleLiveMessage(event.data));
  }

  handleLiveMessage(data) {
    let payload;
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }

    if (payload.kind === "full") {
      groupData.update(payload.members);
    } else if (payload.kind === "delta") {
      groupData.updatePartial(payload.members);
    } else {
      return;
    }
    pubsub.publish("get-group-data", groupData);
  }

  async getGroupData() {
    // Only reachable in demo mode -- the real backend pushes updates over
    // /live (see connectLive()) instead of being polled.
    const newGroupData = exampleData.getGroupData();
    groupData.update(newGroupData);
    pubsub.publish("get-group-data", groupData);
  }

  async createGroup(groupName, memberNames, captchaResponse) {
    const response = await fetch(this.createGroupUrl, {
      body: JSON.stringify({ name: groupName, member_names: memberNames, captcha_response: captchaResponse }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    return response;
  }

  async addMember(memberName) {
    const response = await fetch(this.addMemberUrl, {
      body: JSON.stringify({ name: memberName }),
      headers: {
        "Content-Type": "application/json",
        Authorization: this.groupToken,
      },
      method: "POST",
    });

    return response;
  }

  async removeMember(memberName) {
    const response = await fetch(this.deleteMemberUrl, {
      body: JSON.stringify({ name: memberName }),
      headers: {
        "Content-Type": "application/json",
        Authorization: this.groupToken,
      },
      method: "DELETE",
    });

    return response;
  }

  async renameMember(originalName, newName) {
    const response = await fetch(this.renameMemberUrl, {
      body: JSON.stringify({ original_name: originalName, new_name: newName }),
      headers: {
        "Content-Type": "application/json",
        Authorization: this.groupToken,
      },
      method: "PUT",
    });

    return response;
  }

  async setMemberDiscordId(memberName, discordId) {
    const response = await fetch(this.memberDiscordIdUrl, {
      body: JSON.stringify({ member_name: memberName, discord_id: discordId || null }),
      headers: {
        "Content-Type": "application/json",
        Authorization: this.groupToken,
      },
      method: "PUT",
    });

    return response;
  }

  async setMemberColor(memberName, color) {
    const response = await fetch(this.memberColorUrl, {
      body: JSON.stringify({ member_name: memberName, color: color || null }),
      headers: {
        "Content-Type": "application/json",
        Authorization: this.groupToken,
      },
      method: "PUT",
    });

    return response;
  }

  async amILoggedIn() {
    const response = await fetch(this.amILoggedInUrl, {
      headers: { Authorization: this.groupToken },
    });

    return response;
  }

  async getGePrices() {
    const response = await fetch(this.gePricesUrl);
    return response;
  }

  async getSkillData(period) {
    if (this.exampleDataEnabled) {
      const skillData = exampleData.getSkillData(period, groupData);
      return skillData;
    } else {
      const response = await fetch(`${this.skillDataUrl}?period=${period}`, {
        headers: {
          Authorization: this.groupToken,
        },
      });
      return response.json();
    }
  }

  async getCaptchaEnabled() {
    const response = await fetch(this.captchaEnabledUrl);
    return response.json();
  }

  // `since` is optional -- omitted, the backend returns full history (the
  // Discord bot still relies on this). loot-page passes its period
  // selector's cutoff instead, so a page load only downloads what the
  // selected range actually needs rather than the whole, ever-growing
  // history by default.
  async getLootData(since) {
    const params = since ? `?since=${encodeURIComponent(since)}` : "";
    const response = await fetch(`${this.lootDataUrl}${params}`, {
      headers: {
        Authorization: this.groupToken,
      },
    });
    return response.json();
  }

  async getDeathData(since) {
    const params = since ? `?since=${encodeURIComponent(since)}` : "";
    const response = await fetch(`${this.deathDataUrl}${params}`, {
      headers: {
        Authorization: this.groupToken,
      },
    });
    return response.json();
  }

  async getMustBankItems() {
    const response = await fetch(this.mustBankItemsUrl, {
      headers: {
        Authorization: this.groupToken,
      },
    });
    return response.json();
  }

  async tagMustBankItem(itemId) {
    const response = await fetch(this.mustBankItemsUrl, {
      body: JSON.stringify({ item_id: itemId }),
      headers: {
        "Content-Type": "application/json",
        Authorization: this.groupToken,
      },
      method: "POST",
    });

    return response;
  }

  async untagMustBankItem(itemId) {
    const response = await fetch(this.mustBankItemsUrl, {
      body: JSON.stringify({ item_id: itemId }),
      headers: {
        "Content-Type": "application/json",
        Authorization: this.groupToken,
      },
      method: "DELETE",
    });

    return response;
  }

  async getBankPingsEnabled() {
    const response = await fetch(this.bankPingsEnabledUrl, {
      headers: {
        Authorization: this.groupToken,
      },
    });
    return response.json();
  }

  async setBankPingsEnabled(enabled) {
    const response = await fetch(this.bankPingsEnabledUrl, {
      body: JSON.stringify({ enabled }),
      headers: {
        "Content-Type": "application/json",
        Authorization: this.groupToken,
      },
      method: "PUT",
    });

    return response;
  }

  async getGoals() {
    const response = await fetch(this.goalsUrl, {
      headers: {
        Authorization: this.groupToken,
      },
    });
    return response.json();
  }

  async addGoal(description, addedBy) {
    const response = await fetch(this.goalsUrl, {
      body: JSON.stringify({ description, added_by: addedBy }),
      headers: {
        "Content-Type": "application/json",
        Authorization: this.groupToken,
      },
      method: "POST",
    });

    return response;
  }

  async setGoalDone(id, done) {
    const response = await fetch(this.goalDoneUrl, {
      body: JSON.stringify({ id, done }),
      headers: {
        "Content-Type": "application/json",
        Authorization: this.groupToken,
      },
      method: "PUT",
    });

    return response;
  }

  async deleteGoal(id) {
    const response = await fetch(this.goalsUrl, {
      body: JSON.stringify({ id }),
      headers: {
        "Content-Type": "application/json",
        Authorization: this.groupToken,
      },
      method: "DELETE",
    });

    return response;
  }

  async requestBank(memberName, itemId) {
    const response = await fetch(this.requestBankUrl, {
      body: JSON.stringify({ member_name: memberName, item_id: itemId }),
      headers: {
        "Content-Type": "application/json",
        Authorization: this.groupToken,
      },
      method: "POST",
    });

    return response;
  }

  // selections: [{ playerName, itemId }]
  async requestBankBatch(selections) {
    const response = await fetch(this.requestBankBatchUrl, {
      body: JSON.stringify({
        requests: selections.map((s) => ({ member_name: s.playerName, item_id: s.itemId })),
      }),
      headers: {
        "Content-Type": "application/json",
        Authorization: this.groupToken,
      },
      method: "POST",
    });

    return response;
  }

  async getWomGains(period) {
    const response = await fetch(`${this.womGainsUrl}?period=${period}`, {
      headers: {
        Authorization: this.groupToken,
      },
    });
    return response.json();
  }
}

const api = new Api();

export { api };
