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

  get requestBankUrl() {
    return `${this.baseUrl}/group/${this.groupName}/request-bank`;
  }

  get requestBankBatchUrl() {
    return `${this.baseUrl}/group/${this.groupName}/request-bank-batch`;
  }

  get recentBankPingsUrl() {
    return `${this.baseUrl}/group/${this.groupName}/recent-bank-pings`;
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

  get storageLogUrl() {
    return `${this.baseUrl}/group/${this.groupName}/get-storage-log`;
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
    this.nextCheck = new Date(0).toISOString();
    this.setCredentials(groupName, groupToken);

    if (!this.enabled) {
      this.enabled = true;
      // getGroupInterval is a Promise so we can make sure this method does not leak
      // any intervals with multiple calls to .enable(). This could be possible because of
      // the wait for the item and quest data loads before we create the interval.
      this.getGroupInterval = pubsub.waitForAllEvents("item-data-loaded", "quest-data-loaded").then(() => {
        return utility.callOnInterval(this.getGroupData.bind(this), 1000);
      });
    }

    await this.getGroupInterval;
  }

  async disable() {
    this.enabled = false;
    this.groupName = undefined;
    this.groupToken = undefined;
    groupData.members = new Map();
    groupData.groupItems = {};
    groupData.filters = [""];
    if (this.getGroupInterval) {
      window.clearInterval(await this.getGroupInterval);
    }
  }

  async getGroupData() {
    const nextCheck = this.nextCheck;

    if (this.exampleDataEnabled) {
      const newGroupData = exampleData.getGroupData();
      groupData.update(newGroupData);
      pubsub.publish("get-group-data", groupData);
    } else {
      const response = await fetch(`${this.getGroupDataUrl}?from_time=${nextCheck}`, {
        headers: {
          Authorization: this.groupToken,
        },
      });
      if (!response.ok) {
        if (response.status === 401) {
          await this.disable();
          window.history.pushState("", "", "/login");
          pubsub.publish("get-group-data");
        }
        return;
      }

      const newGroupData = await response.json();
      this.nextCheck = groupData.update(newGroupData).toISOString();
      pubsub.publish("get-group-data", groupData);
    }
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

  async getLootData() {
    const response = await fetch(this.lootDataUrl, {
      headers: {
        Authorization: this.groupToken,
      },
    });
    return response.json();
  }

  async getDeathData() {
    const response = await fetch(this.deathDataUrl, {
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

  async getRecentBankPings() {
    const response = await fetch(this.recentBankPingsUrl, {
      headers: {
        Authorization: this.groupToken,
      },
    });
    return response.json();
  }

  async getStorageLog() {
    const response = await fetch(this.storageLogUrl, {
      headers: {
        Authorization: this.groupToken,
      },
    });
    return response.json();
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
