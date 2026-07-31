import { Quest, QuestState } from "./quest";
import { Item } from "./item";
import { Skill, SkillName } from "./skill";
import { pubsub } from "./pubsub";
import { utility } from "../utility";
import { AchievementDiary } from "./diaries";
import { BankedXp } from "./banked-xp-data";
import { bankedXpSelection } from "./banked-xp-selection";

const playerColors = [
  "hsl(41, 100%, 40%)", // yellow
  "hsl(151, 69%, 26%)", // green
  "hsl(210, 50%, 40%)", // blue
  "hsl(355, 76%, 36%)", // red
  "hsl(288, 65%, 19%)", // purple
];
let currentColor = 0;

// player-icon renders its icon through a CSS hue-rotate(Xdeg) filter over a
// grayscale-ish base image, so it needs a plain numeric hue regardless of
// whether the color came from the round-robin hsl() palette above or a
// user-picked hex color from the settings page.
function hueFromColor(color) {
  if (!color.startsWith("#")) {
    return color.substring(color.indexOf("(") + 1, color.indexOf(","));
  }

  const r = parseInt(color.slice(1, 3), 16) / 255;
  const g = parseInt(color.slice(3, 5), 16) / 255;
  const b = parseInt(color.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;

  const delta = max - min;
  let hue;
  if (max === r) {
    hue = ((g - b) / delta) % 6;
  } else if (max === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }
  hue = Math.round(hue * 60);
  return hue < 0 ? hue + 360 : hue;
}

export const memberInventoryFields = ["bank", "inventory", "equipment", "runePouch", "seedVault"];

const allItemSourceFields = [...memberInventoryFields, "potionStorage"];

const parsedFieldMappings = [
  {
    sourceKey: "stats",
    targetKey: "stats",
    parser: (value) => value,
    publishKey: "stats",
    updatedAttribute: "stats",
  },
  {
    sourceKey: "quests",
    targetKey: "quests",
    parser: Quest.parseQuestData,
    publishKey: "quests",
    updatedAttribute: "quests",
  },
  {
    sourceKey: "diary_vars",
    targetKey: "diaries",
    parser: AchievementDiary.parseDiaryData,
    publishKey: "diaries",
    updatedAttribute: "diaries",
  },
  {
    sourceKey: "collection_log_v2",
    targetKey: "collectionLog",
    parser: Item.parseItemData,
    publishKey: "collection_log_v2",
    publishValueKey: "collectionLog",
    updatedAttribute: "collection_log_v2",
  },
];

const itemFieldMappings = [
  {
    sourceKey: "inventory",
    targetKey: "inventory",
    inventoryName: "inventory",
    publishKey: "inventory",
    updatedAttribute: "inventory",
  },
  {
    sourceKey: "equipment",
    targetKey: "equipment",
    inventoryName: "equipment",
    publishKey: "equipment",
    updatedAttribute: "equipment",
  },
  {
    sourceKey: "bank",
    targetKey: "bank",
    inventoryName: "bank",
    publishKey: "bank",
    updatedAttribute: "bank",
  },
  {
    sourceKey: "rune_pouch",
    targetKey: "runePouch",
    inventoryName: "runePouch",
    publishKey: "runePouch",
    updatedAttribute: "runePouch",
  },
  {
    sourceKey: "seed_vault",
    targetKey: "seedVault",
    inventoryName: "seedVault",
    publishKey: "seedVault",
    updatedAttribute: "seedVault",
  },
  {
    sourceKey: "potion_storage",
    targetKey: "potionStorage",
    inventoryName: "potionStorage",
    publishKey: "potionStorage",
    updatedAttribute: "potion_storage",
  },
];

export class MemberData {
  constructor(name) {
    this.name = name;
    this.itemQuantities = {};
    for (const inventoryField of allItemSourceFields) {
      this.itemQuantities[inventoryField] = new Map();
    }
    this.inactive = false;

    this.color = playerColors[currentColor];
    currentColor = (currentColor + 1) % playerColors.length;
    // Store the hue for player-icon
    this.hue = hueFromColor(this.color);
  }

  update(memberData) {
    let updatedAttributes = new Set();

    for (const field of parsedFieldMappings) {
      this.applyParsedFieldUpdate(memberData, field, updatedAttributes);
    }

    if (memberData.last_updated) {
      this.lastUpdated = new Date(memberData.last_updated);
      const timeSinceLastUpdated = utility.timeSinceLastUpdate(memberData.last_updated);
      let wasInactive = this.inactive;

      // 20 minutes matches OSRS's max AFK auto-logout timer, so this only
      // flips once the client has plausibly actually logged out rather than
      // just being briefly idle.
      this.inactive = !isNaN(timeSinceLastUpdated) && timeSinceLastUpdated > 20 * 60 * 1000;

      if (!wasInactive && this.inactive) {
        this.publishUpdate("inactive");
      } else if (wasInactive && !this.inactive) {
        this.publishUpdate("active");
      }
    }

    if (memberData.coordinates) {
      this.coordinates = memberData.coordinates;
      pubsub.publish("coordinates", this);
      updatedAttributes.add("coordinates");
    }

    if (memberData.discord_id) {
      this.discordId = memberData.discord_id;
    }

    if (memberData.color) {
      this.color = memberData.color;
      this.hue = hueFromColor(this.color);
      // player-icon reads this once at connect time and otherwise has no
      // way to know the color changed later (its host element isn't
      // recreated on every data poll, only when the member roster itself
      // changes) -- publish so it can react live instead of only ever
      // showing whatever hue was in effect when it first mounted.
      this.publishUpdate("color");
    }

    if (memberData.skills) {
      const previousSkills = this.skills;
      this.skills = Skill.parseSkillData(memberData.skills);
      this.publishUpdate("skills");
      updatedAttributes.add("skills");

      this.computeXpDrops(previousSkills);
      this.computeCombatLevel();
    }

    for (const field of itemFieldMappings) {
      this.applyItemFieldUpdate(memberData, field, updatedAttributes);
    }

    this.applyInteractingUpdate(memberData, updatedAttributes);

    return updatedAttributes;
  }

  applyParsedFieldUpdate(memberData, field, updatedAttributes) {
    if (!memberData[field.sourceKey]) return;
    this[field.targetKey] = field.parser(memberData[field.sourceKey]);
    this.publishUpdate(field.publishKey, field.publishValueKey);
    updatedAttributes.add(field.updatedAttribute);
  }

  applyItemFieldUpdate(memberData, field, updatedAttributes) {
    if (!memberData[field.sourceKey]) return;
    this[field.targetKey] = Item.parseItemData(memberData[field.sourceKey]);
    this.updateItemQuantitiesIn(field.inventoryName);
    this.publishUpdate(field.publishKey);
    updatedAttributes.add(field.updatedAttribute);
  }

  applyInteractingUpdate(memberData, updatedAttributes) {
    if (!Object.hasOwn(memberData, "interacting")) return;

    if (memberData.interacting) {
      memberData.interacting.name = utility.removeTags(memberData.interacting.name);
    }

    this.interacting = memberData.interacting;
    this.publishUpdate("interacting");
    updatedAttributes.add("interacting");
  }

  publishUpdate(attributeName, publishValueKey = attributeName) {
    pubsub.publish(`${attributeName}:${this.name}`, this[publishValueKey], this);
  }

  totalItemQuantity(itemId) {
    let total = 0;
    for (const inventoryField of memberInventoryFields) {
      total += this.itemQuantities[inventoryField].get(itemId) || 0;
    }
    return total;
  }

  updateItemQuantitiesIn(inventoryName) {
    this.itemQuantities[inventoryName] = new Map();
    for (const item of this.itemsIn(inventoryName)) {
      const x = this.itemQuantities[inventoryName];
      x.set(item.id, (x.get(item.id) || 0) + item.quantity);
    }
  }

  *allItems() {
    const yieldedIds = new Set();
    for (const item of this.itemsIn(...memberInventoryFields)) {
      if (!yieldedIds.has(item.id)) {
        yieldedIds.add(item.id);
        yield item;
      }
    }
  }

  *itemsIn(...inventoryNames) {
    for (const inventoryName of inventoryNames) {
      if (this[inventoryName] === undefined) continue;
      for (const item of this[inventoryName]) {
        if (item.isValid()) yield item;
      }
    }
  }

  computeXpDrops(previousSkills) {
    if (!previousSkills) {
      for (const skillName of Object.values(SkillName)) {
        pubsub.publish(`${skillName}:${this.name}`, this.skills[skillName]);
      }
      return;
    }

    const xpDrops = [];
    for (const skillName of Object.values(SkillName)) {
      if (!this.skills[skillName] || !previousSkills[skillName]) continue;
      const xpDiff = this.skills[skillName].xp - previousSkills[skillName].xp;
      if (xpDiff > 0 && skillName !== "Overall") xpDrops.push(new Skill(skillName, xpDiff));
      if (xpDiff !== 0) pubsub.publish(`${skillName}:${this.name}`, this.skills[skillName]);
    }

    if (xpDrops.length > 0) {
      pubsub.publish(`xp:${this.name}`, xpDrops);
    }
  }

  computeCombatLevel() {
    const s = 0.325;
    const relevantSkillNames = ["Defence", "Hitpoints", "Prayer", "Attack", "Strength", "Ranged", "Magic"];
    const hasAllSkills = relevantSkillNames.every((skillName) => typeof this.skills?.[skillName]?.level === "number");
    if (!hasAllSkills) return;

    const defence = Math.min(this.skills.Defence.level, 99);
    const hitpoints = Math.min(this.skills.Hitpoints.level, 99);
    const prayer = Math.min(this.skills.Prayer.level, 99);
    const attack = Math.min(this.skills.Attack.level, 99);
    const strength = Math.min(this.skills.Strength.level, 99);
    const ranged = Math.min(this.skills.Ranged.level, 99);
    const magic = Math.min(this.skills.Magic.level, 99);

    const base = (defence + hitpoints + Math.floor(prayer / 2)) / 4;
    const melee = s * (attack + strength);
    const range = s * (Math.floor(ranged / 2) + ranged);
    const mage = s * (Math.floor(magic / 2) + magic);

    const combatLevel = Math.floor(base + Math.max(melee, range, mage));

    if (combatLevel !== this.combatLevel) {
      this.combatLevel = combatLevel;
      this.publishUpdate("combatLevel");
    }
  }

  // How much of a secondary ingredient requirement this member can cover,
  // pooling bank + inventory + equipment + rune pouch + seed vault (people
  // often carry secondaries rather than bank them). altItemIds (Crushable --
  // crushed or uncrushed both count) and doseGroup (ByDose potions --
  // dose-weighted) are alternate ways the plugin's data expresses the same
  // "how much do you have" question; see banked-xp-data.js.
  availableSecondaryQuantity(secondary) {
    if (secondary.doseGroup) {
      return secondary.doseGroup.reduce((sum, id, i) => sum + this.totalItemQuantity(id) * (i + 1), 0);
    }
    let total = this.totalItemQuantity(secondary.itemId);
    for (const id of secondary.altItemIds ?? []) total += this.totalItemQuantity(id);
    return total;
  }

  // Total XP "locked up" in this member's bank if every held item were put
  // toward its (selectable) training activity -- ported from the RuneLite
  // "banked-experience" plugin's data tables. Purely a client-side
  // computation over data the site already fetched (bank contents) plus a
  // static reference file, so calling this costs zero extra server/DB load.
  //
  // Alongside the "full" xp figure (assumes unlimited secondary ingredients)
  // this also computes "effective" xp, capped by how many conversions the
  // member can actually afford given what they're holding. Each item's
  // effective xp is computed independently -- if two different bank items
  // both need the same scarce secondary, this doesn't detect that
  // competition, so a summed effective total can overstate what's truly
  // achievable at once. Modeling shared-pool allocation across items would
  // need a real multi-consumer allocation pass; not worth it unless this
  // turns out to matter in practice.
  computeBankedXp() {
    const bySkill = {};
    for (const [itemId, quantity] of this.itemQuantities.bank) {
      if (quantity <= 0) continue;

      const activities = BankedXp.activitiesForItem(itemId);
      if (activities.length === 0) continue;

      const selectedId = bankedXpSelection.get(itemId);
      const activity =
        activities.find((a) => a.id === selectedId) ??
        BankedXp.defaultActivity(activities, (skill) => this.skills?.[skill]?.level ?? 1);

      const secondaries = (activity.secondaries ?? []).map((secondary) => ({
        ...secondary,
        have: this.availableSecondaryQuantity(secondary),
      }));
      const affordableActions = secondaries.reduce((max, s) => Math.min(max, Math.floor(s.have / s.qty)), quantity);

      const xp = activity.xp * quantity;
      const effectiveXp = activity.xp * affordableActions;

      if (!bySkill[activity.skill]) bySkill[activity.skill] = { xp: 0, effectiveXp: 0, items: [] };
      bySkill[activity.skill].xp += xp;
      bySkill[activity.skill].effectiveXp += effectiveXp;
      bySkill[activity.skill].items.push({
        itemId,
        quantity,
        activity,
        activities,
        secondaries,
        affordableActions,
        xp,
        effectiveXp,
      });
    }
    return bySkill;
  }

  hasQuestComplete(questName) {
    if (!Quest.lookupByName || !this.quests) return false;

    const questId = Quest.lookupByName.get(questName);

    if (!questId) {
      console.warn(`Unknown quest ${questName}`);
      return false;
    }

    const questComplete = this.quests[questId]?.state === QuestState.FINISHED;

    return questComplete;
  }
}
