// The blank Player every loadout is built from.
//
// Upstream keeps this in state.tsx next to the mobx store, which is the one
// file we cannot vendor. Rather than copy it and hope the copy stays honest,
// the vendor script points `@/state` at this module -- so upstream's own 200+
// test cases run against these defaults. If a field here drifts from what
// their maths expects, their suite says so.
import { EquipmentCategory } from "@/enums/EquipmentCategory";
import { Player, PlayerEquipment, PlayerSkills } from "@/types/Player";
import { getDefaultCombatStyle } from "@/utils";

export const EMPTY_EQUIPMENT: PlayerEquipment = {
  head: null,
  cape: null,
  neck: null,
  ammo: null,
  weapon: null,
  body: null,
  shield: null,
  legs: null,
  hands: null,
  feet: null,
  ring: null,
};

export const MAXED_SKILLS: PlayerSkills = {
  atk: 99,
  def: 99,
  hp: 99,
  magic: 99,
  prayer: 99,
  ranged: 99,
  str: 99,
  mining: 99,
  herblore: 99,
  farming: 99,
};

export const NO_BOOSTS: PlayerSkills = {
  atk: 0,
  def: 0,
  hp: 0,
  magic: 0,
  prayer: 0,
  ranged: 0,
  str: 0,
  mining: 0,
  herblore: 0,
  farming: 0,
};

export function generateEmptyPlayer(name?: string): Player {
  return {
    name: name ?? "Loadout 1",
    style: getDefaultCombatStyle(EquipmentCategory.NONE),
    skills: { ...MAXED_SKILLS },
    boosts: { ...NO_BOOSTS },
    equipment: { ...EMPTY_EQUIPMENT },
    attackSpeed: 4,
    prayers: [],
    bonuses: { str: 0, ranged_str: 0, magic_str: 0, prayer: 0 },
    defensive: { stab: 0, slash: 0, crush: 0, magic: 0, ranged: 0 },
    offensive: { stab: 0, slash: 0, crush: 0, magic: 0, ranged: 0 },
    buffs: {
      potions: [],
      // Faithful to upstream, whose suite asserts slayer-helm max hits
      // against it. Our own policy -- score off-task unless asked, so "is
      // this gear good" never quietly assumes a black mask is live -- is
      // applied in buildPlayer rather than changed here, because these
      // defaults are what their 350 test cases are checking.
      onSlayerTask: true,
      inWilderness: false,
      kandarinDiary: true,
      chargeSpell: false,
      markOfDarknessSpell: false,
      forinthrySurge: false,
      soulreaperStacks: 0,
      baAttackerLevel: 0,
      // 4 tiles is the optimal range for the default "medium fuse" chinchompa
      // stance; ignored for everything else.
      chinchompaDistance: 4,
      usingSunfireRunes: false,
      // The Fractured Archive's elemental spell upgrades, each +2 base max
      // hit for its element. Off by default: they are unlocks, and assuming
      // someone has them would quietly inflate every magic number.
      fragmentOfWind: false,
      fragmentOfWater: false,
      fragmentOfEarth: false,
      fragmentOfFire: false,
    },
    spell: null,
  };
}
