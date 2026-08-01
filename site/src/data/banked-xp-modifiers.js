// Flat xp-rate boosts ported from the RuneLite "banked-experience" plugin's
// Modifiers.java, restricted to the ones that are a plain whole-skill xp
// multiplier -- Prayer's altar/Ectofuntus/Wildy-altar/Demonic-Offering
// options are already baked into banked_xp_data.json as separate selectable
// activities (see e.g. item 25766's "Demonic Offering" entry), so they don't
// need a modifier here. Skilling-outfit set bonuses are simplified to a
// single "worn or not" toggle instead of the plugin's 4-piece partial-bonus
// UI -- not worth the complexity for an estimate page. Zealot's robes is
// skipped entirely: it's a consumption-save mechanic on the primary item
// (bones), not an xp multiplier, and doesn't fit this model.
const MODIFIERS = [
  { id: "farmers_outfit", skill: "Farming", name: "Farmer's Outfit", xpMultiplier: 1.025 },
  { id: "carpenters_outfit", skill: "Construction", name: "Carpenter's Outfit", xpMultiplier: 1.025 },
  { id: "pyromancer_outfit", skill: "Firemaking", name: "Pyromancer Outfit", xpMultiplier: 1.025 },
  { id: "horizons_lure", skill: "Sailing", name: "Horizon's Lure", xpMultiplier: 1.025 },
];

export class BankedXpModifiers {
  static forSkill(skillName) {
    return MODIFIERS.filter((m) => m.skill === skillName);
  }
}
