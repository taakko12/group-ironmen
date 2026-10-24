// Best gear for a monster, restricted to items the group actually owns.
//
// This is the part no public calculator can do for us: the wiki's and
// GearScape's searches run over every item in the game, because they have no
// idea what is in our bank. We do.
//
// A full cross-product is hopeless -- the group's owned gear alone is about
// 4e20 combinations -- but it collapses once you fix the weapon. The weapon
// decides the attack style, whether the shield slot is free, and which ammo is
// legal; after that the slots are very nearly independent, with only weak
// coupling from set bonuses and integer max-hit flooring. So: enumerate
// weapons, greedily fill the rest, then a swap pass to pick up the couplings
// greed misses.
import { AmmoApplicability, ammoApplicability } from "@/lib/Equipment";
import { Monster } from "@/types/Monster";
import { EquipmentPiece, Player, PlayerEquipment } from "@/types/Player";
import { attackStyleOf, AttackStyle, buildPlayer, equipmentById, equippableBySlot, evaluate, LoadoutInput } from "./engine";

/** Slots the search fills once the weapon is chosen, in no significant order. */
const FILLABLE: (keyof PlayerEquipment)[] = [
  "head",
  "cape",
  "neck",
  "ammo",
  "body",
  "shield",
  "legs",
  "hands",
  "feet",
  "ring",
];

export interface SearchOptions extends Omit<LoadoutInput, "itemIds"> {
  /**
   * Item ids whose slots are settled -- gear you have decided to camp.
   *
   * These are not a hint, they are a constraint: the slot is never searched
   * and never swapped, so it can never cost an inventory space. That is the
   * point. Armour switches are rarely worth a click mid-fight even when the
   * DPS says otherwise, and locking body/legs/head is how you say so.
   */
  lockedIds?: number[];
  /**
   * Which ways of attacking are actually possible here. Omit for all three.
   *
   * No monster data says whether you can physically reach a target: Olm's
   * head has real melee defence numbers and a halberd scores against them,
   * but you cannot walk up to it. Reachability is a fact about the encounter,
   * not about the monster's stats, so it has to be told to us.
   */
  allowedStyles?: AttackStyle[];
  /** Cap on weapons tried, best-effort for latency. Omit to try every one. */
  maxWeapons?: number;
  /** Swap passes after the greedy fill. Two is enough in practice. */
  passes?: number;
}

export interface SearchResult {
  dps: number;
  maxHit: number;
  accuracy: number;
  itemIds: number[];
  /** slot -> item name, for anything actually worn. */
  gear: Record<string, string>;
  /** How many loadouts were scored to get here. */
  evaluated: number;
}

function scored(player: Player, monster: Monster): number {
  const result = evaluate(player, monster);
  // Comparing on DPS alone silently prefers an unarmed loadout over one whose
  // weapon cannot reach the target (melee at Zulrah scores 0 either way), so
  // ties break on nothing -- callers get the dps and decide.
  return result.dps;
}

/**
 * Best loadout for one monster from a pool of owned item ids.
 *
 * Deliberately returns the pool's best rather than the game's best: the point
 * is "what should I bring tonight", not "what should I aspire to".
 */
export function bestLoadout(ownedIds: Iterable<number>, monster: Monster, options: SearchOptions = {}): SearchResult {
  const all = loadoutsPerWeapon(ownedIds, monster, options);
  return all[0];
}

/**
 * The best loadout for each candidate weapon, best first.
 *
 * One per weapon is a naturally diverse candidate set -- a different weapon
 * drags different gear with it -- which is exactly what the switch planner
 * needs. Taking the top N of a single weapon's neighbourhood would hand it N
 * near-identical loadouts and no real choices.
 */
export function topLoadouts(
  ownedIds: Iterable<number>,
  monster: Monster,
  options: SearchOptions = {},
  limit = 10
): SearchResult[] {
  return loadoutsPerWeapon(ownedIds, monster, options).slice(0, limit);
}

function loadoutsPerWeapon(ownedIds: Iterable<number>, monster: Monster, options: SearchOptions = {}): SearchResult[] {
  const { maxWeapons, passes = 2, lockedIds = [], allowedStyles, ...loadout } = options;
  const bySlot = equippableBySlot(ownedIds);

  const locked = new Map<string, EquipmentPiece>();
  for (const id of lockedIds) {
    const piece = equipmentById(id);
    if (!piece) throw new Error(`cannot lock item ${id}: not equipment the calculator knows`);
    locked.set(piece.slot, piece);
  }

  // A locked weapon means there is nothing to enumerate. A locked shield rules
  // out every two-hander, because buildPlayer would quietly drop the shield to
  // make room -- which would break the lock without saying so.
  const lockedWeapon = locked.get("weapon");
  let weapons = lockedWeapon ? [lockedWeapon] : (bySlot.weapon ?? []);
  if (locked.has("shield")) weapons = weapons.filter((weapon) => !weapon.isTwoHanded);
  if (allowedStyles?.length) weapons = weapons.filter((weapon) => allowedStyles.includes(attackStyleOf(weapon)));

  if (weapons.length === 0) {
    const why = allowedStyles?.length ? ` that attacks with ${allowedStyles.join(" or ")}` : "";
    throw new Error(
      locked.has("shield")
        ? `no one-handed weapon in the pool${why}, and the shield slot is locked`
        : `no weapon in the pool${why}`
    );
  }

  let evaluated = 0;
  const score = (ids: number[]): number => {
    evaluated += 1;
    return scored(buildPlayer({ ...loadout, itemIds: ids }), monster);
  };

  const results: { dps: number; ids: number[] }[] = [];

  for (const weapon of maxWeapons ? weapons.slice(0, maxWeapons) : weapons) {
    // A two-hander frees nothing into the shield slot, so skip it entirely
    // rather than scoring shields that will be silently dropped.
    const slots = FILLABLE.filter(
      (slot) => !(slot === "shield" && weapon.isTwoHanded) && !locked.has(slot)
    );
    const chosen = new Map<keyof PlayerEquipment, EquipmentPiece>();
    // Locked pieces ride along in every loadout without ever being searched.
    const lockedHere = [...locked.entries()]
      .filter(([slot]) => slot !== "weapon" && !(slot === "shield" && weapon.isTwoHanded))
      .map(([, piece]) => piece.id);
    const idsNow = () => [weapon.id, ...lockedHere, ...[...chosen.values()].map((p) => p.id)];

    // Greedy fill: take each slot's best contribution against what is already
    // worn. Order matters a little and we accept that -- the swap pass below
    // is what cleans up after it.
    for (const slot of slots) {
      const candidates = (bySlot[slot] ?? []).filter((piece) => isLegal(weapon, slot, piece));
      if (candidates.length === 0) continue;

      let bestPiece: EquipmentPiece | null = null;
      let bestDps = score(idsNow()); // the empty-slot baseline is a real option
      for (const piece of candidates) {
        chosen.set(slot, piece);
        const dps = score(idsNow());
        if (dps > bestDps) {
          bestDps = dps;
          bestPiece = piece;
        }
        chosen.delete(slot);
      }
      if (bestPiece) chosen.set(slot, bestPiece);
    }

    // Swap pass: with every other slot now settled, re-ask each one. This is
    // what catches set bonuses, where a piece is only worth wearing once its
    // partners are already on.
    let current = score(idsNow());
    for (let pass = 0; pass < passes; pass += 1) {
      let improved = false;
      for (const slot of slots) {
        const candidates = (bySlot[slot] ?? []).filter((piece) => isLegal(weapon, slot, piece));
        const incumbent = chosen.get(slot);
        for (const piece of candidates) {
          if (incumbent && piece.id === incumbent.id) continue;
          chosen.set(slot, piece);
          const dps = score(idsNow());
          if (dps > current) {
            current = dps;
            improved = true;
          } else if (incumbent) {
            chosen.set(slot, incumbent);
          } else {
            chosen.delete(slot);
          }
        }
      }
      if (!improved) break;
    }

    results.push({ dps: current, ids: idsNow() });
  }

  results.sort((a, b) => b.dps - a.dps);

  return results.map(({ ids }) => {
    const player = buildPlayer({ ...loadout, itemIds: ids });
    const result = evaluate(player, monster);
    const gear: Record<string, string> = {};
    for (const [slot, piece] of Object.entries(player.equipment)) {
      if (piece) gear[slot] = (piece as EquipmentPiece).name;
    }
    return { dps: result.dps, maxHit: result.maxHit, accuracy: result.accuracy, itemIds: ids, gear, evaluated };
  });
}

function isLegal(weapon: EquipmentPiece, slot: keyof PlayerEquipment, piece: EquipmentPiece): boolean {
  if (slot !== "ammo") return true;
  // Firing dragon arrows out of a crossbow is not a loadout, it is a bug.
  return ammoApplicability(weapon.id, piece.id) !== AmmoApplicability.INVALID;
}
