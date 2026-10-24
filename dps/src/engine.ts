// The seam between our data and the wiki calculator's model.
//
// We store gear as OSRS item ids in `members.equipment`/`bank` ([id, qty]
// pairs); the calculator wants a fully-populated Player with every slot
// resolved and the aggregate bonuses already summed. Everything here is that
// translation plus thin wrappers -- deliberately no combat maths, because the
// moment we reimplement any of it we own keeping it correct through game
// updates, which is the entire reason for vendoring theirs.
import { EquipmentCategory } from "@/enums/EquipmentCategory";
import { Prayer } from "@/enums/Prayer";
import { availableEquipment, calculateEquipmentBonusesFromGear } from "@/lib/Equipment";
import { getMonsters, INITIAL_MONSTER_INPUTS } from "@/lib/Monsters";
import PlayerVsNPCCalc from "@/lib/PlayerVsNPCCalc";
import { Monster } from "@/types/Monster";
import { EquipmentPiece, Player, PlayerEquipment, PlayerSkills } from "@/types/Player";
import { getCombatStylesForCategory, getDefaultCombatStyle } from "@/utils";
import { generateEmptyPlayer } from "./playerDefaults";

// Item ids are not unique per item: trouver-tagged, charged, ornamented and
// locked variants are separate ids with identical stats. The first match wins
// because availableEquipment is ordered the way the calculator's own picker
// shows it.
const byId = new Map<number, EquipmentPiece>();
for (const piece of availableEquipment) {
  if (!byId.has(piece.id)) byId.set(piece.id, piece);
}

export function equipmentById(itemId: number): EquipmentPiece | undefined {
  return byId.get(itemId);
}

/**
 * Whether a piece is something a search may consider.
 *
 * The catalog carries things that occupy the weapon slot but are not weapons
 * -- greegrees, crates of fish, a Christmas dinner -- and the wiki has never
 * given them a real attack speed. `speed: -1` becomes a one-tick weapon, the
 * fastest rate in the game, so an optimiser hands you a monkey greegree over
 * a scythe and is right to by its own arithmetic. 29 weapon-slot entries have
 * a speed of 0 or less; none of them are weapons.
 */
export function isUsableGear(piece: EquipmentPiece): boolean {
  return piece.slot !== "weapon" || (typeof piece.speed === "number" && piece.speed > 0);
}

/** Every id we own that the calculator recognises as usable equipment, by slot. */
export function equippableBySlot(itemIds: Iterable<number>): Record<string, EquipmentPiece[]> {
  const bySlot: Record<string, EquipmentPiece[]> = {};
  for (const id of itemIds) {
    const piece = byId.get(id);
    if (!piece || !isUsableGear(piece)) continue;
    (bySlot[piece.slot] ||= []).push(piece);
  }
  return bySlot;
}

export interface LoadoutInput {
  /** OSRS item ids. Unrecognised ids are ignored; a later id wins its slot. */
  itemIds?: number[];
  skills?: Partial<PlayerSkills>;
  boosts?: Partial<PlayerSkills>;
  prayers?: Prayer[];
  /** Defaults to the weapon's own default stance. */
  styleName?: string;
  onSlayerTask?: boolean;
  inWilderness?: boolean;
}

export function buildPlayer(input: LoadoutInput = {}): Player {
  const equipment: PlayerEquipment = generateEmptyPlayer().equipment;
  for (const id of input.itemIds ?? []) {
    const piece = byId.get(id);
    if (piece) equipment[piece.slot as keyof PlayerEquipment] = piece;
  }

  // A two-hander and a shield cannot both be worn; the calculator trusts the
  // state it is given, so dropping the shield is our job.
  if (equipment.weapon?.isTwoHanded) equipment.shield = null;

  const category = (equipment.weapon?.category ?? EquipmentCategory.NONE) as EquipmentCategory;

  const player: Player = {
    ...generateEmptyPlayer(),
    equipment,
    skills: { ...generateEmptyPlayer().skills, ...input.skills },
    boosts: { ...generateEmptyPlayer().boosts, ...input.boosts },
    prayers: input.prayers ?? [],
  };
  player.style = getDefaultCombatStyle(category);
  player.buffs.onSlayerTask = input.onSlayerTask ?? false;
  player.buffs.inWilderness = input.inWilderness ?? false;

  if (input.styleName) {
    const wanted = input.styleName.toLowerCase();
    const match = getCombatStylesForCategory(category).find((s) => s.name.toLowerCase() === wanted);
    if (!match) {
      const names = getCombatStylesForCategory(category).map((s) => s.name);
      throw new Error(`unknown stance "${input.styleName}" for ${category || "unarmed"}; have: ${names.join(", ")}`);
    }
    player.style = match;
  }

  return player;
}

let monsterCache: Map<string, Monster> | null = null;

/** Monsters keyed by lowercased "name" and "name#version". */
function monsterIndex(): Map<string, Monster> {
  if (monsterCache) return monsterCache;
  monsterCache = new Map();
  for (const base of getMonsters()) {
    const monster: Monster = { ...base, inputs: { ...INITIAL_MONSTER_INPUTS } };
    const name = monster.name.toLowerCase();
    if (!monsterCache.has(name)) monsterCache.set(name, monster);
    if (monster.version) monsterCache.set(`${name}#${monster.version.toLowerCase()}`, monster);
  }
  return monsterCache;
}

export function findMonster(name: string, version?: string): Monster | undefined {
  const index = monsterIndex();
  const key = name.trim().toLowerCase();
  return (version ? index.get(`${key}#${version.trim().toLowerCase()}`) : undefined) ?? index.get(key);
}

export interface DpsResult {
  dps: number;
  maxHit: number;
  accuracy: number;
  attackSpeed: number;
  expectedTtk: number | null;
  style: string;
}

export function evaluate(player: Player, monster: Monster): DpsResult {
  // The bonuses the calculator reads are the summed ones, not the per-piece
  // ones; without this every loadout scores as if it were naked.
  Object.assign(player, calculateEquipmentBonusesFromGear(player, monster));

  const calc = new PlayerVsNPCCalc(player, monster, { detailedOutput: false });
  const dist = calc.getDistribution();
  return {
    dps: calc.getDps(),
    maxHit: dist.getMax(),
    accuracy: calc.getHitChance(),
    attackSpeed: player.attackSpeed,
    expectedTtk: Number.isFinite(calc.getTtk()) ? calc.getTtk() : null,
    style: `${player.style.type ?? "none"}/${player.style.stance ?? "none"}`,
  };
}

/** Convenience: ids + monster name straight to a DPS number. */
export function dpsFor(input: LoadoutInput, monsterName: string, version?: string): DpsResult {
  const monster = findMonster(monsterName, version);
  if (!monster) throw new Error(`unknown monster: ${monsterName}`);
  return evaluate(buildPlayer(input), monster);
}
