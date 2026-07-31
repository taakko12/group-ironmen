import { pubsub } from "./pubsub";

// Static item id -> [{id, skill, name, level, xp}] lookup ported from the
// RuneLite "banked-experience" plugin's Activity/ExperienceItem tables.
// Loaded lazily (only when the banked-xp page is actually opened, not at
// app startup) since most sessions never visit it -- same reasoning as
// Item.variantGroups() in item.js.
export class BankedXp {
  static async loadData() {
    if (BankedXp.data) return;
    const response = await fetch("/data/banked_xp_data.json");
    BankedXp.data = await response.json();
    pubsub.publish("banked-xp-data-loaded");
  }

  static activitiesForItem(itemId) {
    return BankedXp.data?.[itemId] ?? [];
  }

  // Prefers the highest-xp activity the player's current level in that
  // activity's skill already qualifies for (a single item, e.g. logs, can
  // have candidate activities in more than one skill); falls back to the
  // lowest-level one so under-leveled items still show their eventual value
  // instead of nothing. getLevelForSkill(skillName) -> current level.
  static defaultActivity(activities, getLevelForSkill) {
    const qualifying = activities.filter((a) => a.level <= getLevelForSkill(a.skill));
    if (qualifying.length > 0) {
      return qualifying.reduce((best, a) => (a.xp > best.xp ? a : best));
    }
    return activities.reduce((lowest, a) => (a.level < lowest.level ? a : lowest));
  }
}
