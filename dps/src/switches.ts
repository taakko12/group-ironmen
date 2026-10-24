// "Best overall DPS across a boss list, carrying at most N switches."
//
// This is the question neither the wiki calculator nor GearScape answers.
// Both solve one setup against one monster; a raid is several monsters and a
// shared inventory, and the interesting constraint is that every extra item
// you bring costs a slot you could have filled with food or brews.
//
// The cost model is per-slot: if a slot is worn with d distinct items across
// the whole run, you wear one and carry d-1. Total switches is the sum of
// those, which is exactly the number of inventory spaces the gear eats.
//
// Choosing one loadout per monster to maximise total DPS under that cap is a
// set-cover flavoured problem -- NP-hard in general, trivial at our size.
// Monsters go in one at a time and only the best B partial plans survive each
// step (beam search). Greedy alone fails badly here: the best loadout for the
// first boss happily spends the whole budget on gear nothing else wants.
import { Monster } from "@/types/Monster";
import { SearchOptions, SearchResult, topLoadouts } from "./search";
import { buildPlayer, equipmentById, evaluate } from "./engine";

export interface MonsterTarget {
  monster: Monster;
  /**
   * How much this monster matters -- time spent on it, kills per raid, however
   * you want to weight it. Defaults to 1, i.e. plain average DPS.
   */
  weight?: number;
}

export interface SwitchOptions extends SearchOptions {
  /** Inventory spaces the gear may eat. 0 means one setup for the whole run. */
  maxSwitches: number;
  /** Candidate loadouts considered per monster. */
  candidatesPerMonster?: number;
  /** Partial plans kept between monsters. */
  beamWidth?: number;
}

export interface SwitchPlan {
  /** Weighted mean DPS across the targets. */
  score: number;
  switches: number;
  /** slot -> item worn at the start of the run. */
  worn: Record<string, string>;
  /** The extra items, i.e. what actually costs inventory space. */
  carried: { slot: string; name: string }[];
  perMonster: { monster: string; dps: number; weapon: string; swapsFromWorn: string[] }[];
}

interface Plan {
  /** slot -> item ids used in that slot across the plan so far. */
  used: Map<string, Set<number>>;
  score: number;
  picks: SearchResult[];
}

/** Inventory spaces the gear eats: everything beyond one item per used slot. */
function switchCost(used: Map<string, Set<number>>): number {
  let cost = 0;
  for (const ids of used.values()) cost += ids.size - 1;
  return cost;
}

function merge(used: Map<string, Set<number>>, loadout: SearchResult): Map<string, Set<number>> {
  const next = new Map<string, Set<number>>();
  for (const [slot, ids] of used) next.set(slot, new Set(ids));
  for (const id of loadout.itemIds) {
    const slot = equipmentById(id)?.slot;
    if (!slot) continue;
    if (!next.has(slot)) next.set(slot, new Set());
    next.get(slot)!.add(id);
  }
  return next;
}

export function planSwitches(
  ownedIds: Iterable<number>,
  targets: MonsterTarget[],
  options: SwitchOptions
): SwitchPlan {
  const { maxSwitches, candidatesPerMonster = 8, beamWidth = 40, ...search } = options;
  if (targets.length === 0) throw new Error("no targets to plan for");

  const owned = [...ownedIds];
  const candidates = targets.map((t) => topLoadouts(owned, t.monster, search, candidatesPerMonster));

  // Hardest monster first. The early picks shape what the budget gets spent
  // on, so the boss with the most to lose from a compromise should choose
  // while the budget is still free.
  const order = targets
    .map((_, index) => index)
    .sort((a, b) => spread(candidates[b]) - spread(candidates[a]));

  let beam: Plan[] = [{ used: new Map(), score: 0, picks: [] }];

  for (const index of order) {
    const weight = targets[index].weight ?? 1;
    const next: Plan[] = [];
    for (const plan of beam) {
      // A monster's own best loadouts, plus the option of simply keeping gear
      // the plan is already carrying. Without the second half there is no
      // such thing as a compromise setup: every monster insists on what suits
      // it alone, and a tight budget has no feasible plan at all even when
      // "wear one thing everywhere" plainly works.
      const reuse = plan.picks.map((pick) => rescore(pick, targets[index].monster, search));
      for (const loadout of [...candidates[index], ...reuse]) {
        const used = merge(plan.used, loadout);
        if (switchCost(used) > maxSwitches) continue;
        next.push({ used, score: plan.score + weight * loadout.dps, picks: [...plan.picks, loadout] });
      }
    }
    if (next.length === 0) {
      throw new Error(
        `no plan fits ${maxSwitches} switch(es) -- every candidate for ${targets[index].monster.name} needs more`
      );
    }
    next.sort((a, b) => b.score - a.score);
    beam = next.slice(0, beamWidth);
  }

  return describe(beam[0], order, targets);
}

/** The same gear, scored against a different monster. Costs no switches. */
function rescore(loadout: SearchResult, monster: Monster, search: SearchOptions): SearchResult {
  const player = buildPlayer({ ...search, itemIds: loadout.itemIds });
  const result = evaluate(player, monster);
  return { ...loadout, dps: result.dps, maxHit: result.maxHit, accuracy: result.accuracy };
}

/** How much DPS is at stake between a monster's best and worst candidate. */
function spread(loadouts: SearchResult[]): number {
  if (loadouts.length === 0) return 0;
  return loadouts[0].dps - loadouts[loadouts.length - 1].dps;
}

function describe(plan: Plan, order: number[], targets: MonsterTarget[]): SwitchPlan {
  const totalWeight = targets.reduce((sum, t) => sum + (t.weight ?? 1), 0);

  // The worn item for a slot is whichever appears in most loadouts: that is
  // the one you log in wearing and swap away from least often.
  const worn: Record<string, string> = {};
  const wornId: Record<string, number> = {};
  for (const [slot, ids] of plan.used) {
    let bestId = -1;
    let bestCount = -1;
    for (const id of ids) {
      const count = plan.picks.filter((p) => p.itemIds.includes(id)).length;
      if (count > bestCount) {
        bestCount = count;
        bestId = id;
      }
    }
    worn[slot] = equipmentById(bestId)?.name ?? `Item ${bestId}`;
    wornId[slot] = bestId;
  }

  const carried: { slot: string; name: string }[] = [];
  for (const [slot, ids] of plan.used) {
    for (const id of ids) {
      if (id === wornId[slot]) continue;
      carried.push({ slot, name: equipmentById(id)?.name ?? `Item ${id}` });
    }
  }

  const perMonster = order.map((targetIndex, step) => {
    const loadout = plan.picks[step];
    const swaps: string[] = [];
    for (const id of loadout.itemIds) {
      const slot = equipmentById(id)?.slot;
      if (slot && wornId[slot] !== id) swaps.push(equipmentById(id)!.name);
    }
    return {
      monster: targets[targetIndex].monster.name,
      dps: loadout.dps,
      weapon: loadout.gear.weapon ?? "unarmed",
      swapsFromWorn: swaps,
    };
  });

  return {
    score: plan.score / totalWeight,
    switches: switchCost(plan.used),
    worn,
    carried,
    perMonster,
  };
}
