// "Best overall DPS across a boss list, carrying at most N switches."
//
// This is the question neither the wiki calculator nor GearScape answers.
// Both solve one setup against one monster; a raid is several monsters and a
// shared inventory, and the interesting constraint is that every extra item
// you bring costs a slot you could have filled with food or brews.
//
// The budget is inventory slots at the worst moment of the run: everything
// brought, minus whatever is on your body during that fight. See switchCost --
// the obvious per-slot count undercounts whenever a two-hander empties the
// shield slot.
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
  /** Inventory slots the gear needs at its worst moment. */
  switches: number;
  /** slot -> item worn at the start of the run. */
  worn: Record<string, string>;
  /** The extra items, i.e. what actually costs inventory space. */
  carried: { slot: string; name: string }[];
  perMonster: {
    monster: string;
    dps: number;
    weapon: string;
    swapsFromWorn: string[];
    /**
     * Gear sitting in the inventory during this fight. The largest of these
     * is `switches` -- it is what the budget actually has to cover.
     */
    inBag: number;
  }[];
}

interface Plan {
  /** slot -> item ids used in that slot across the plan so far. */
  used: Map<string, Set<number>>;
  score: number;
  picks: SearchResult[];
}

/**
 * Inventory spaces the gear occupies at its worst moment.
 *
 * Counting distinct items per slot and subtracting one undercounts, because a
 * slot can be empty in some setups: wield a two-hander and the shield you are
 * not using still has to live somewhere. While you are on the bowfa, the
 * melee weapon *and* its shield are both in your inventory.
 *
 * So the real question is per setup -- everything brought, minus what is on
 * your body right now -- and the budget has to cover the worst of them.
 */
function switchCost(picks: SearchResult[]): number {
  const distinct = new Set<number>();
  for (const pick of picks) for (const id of pick.itemIds) distinct.add(id);

  let peak = 0;
  for (const pick of picks) peak = Math.max(peak, distinct.size - pick.itemIds.length);
  return peak;
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
        const picks = [...plan.picks, loadout];
        if (switchCost(picks) > maxSwitches) continue;
        next.push({ used: merge(plan.used, loadout), score: plan.score + weight * loadout.dps, picks });
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

  return describe(repair(beam[0], order, targets, owned, maxSwitches, search), order, targets);
}

export interface BudgetStep {
  budget: number;
  plan: SwitchPlan;
  /** DPS this budget buys over the one below it. */
  marginal: number;
}

/**
 * Every budget from 0 to `maxSwitches`, with what each extra slot buys.
 *
 * "Give me a budget of 4" and "what is the fewest I can get away with" are
 * different questions, and only this one answers the second. Switches are not
 * free in practice -- every one is a slot of brews and a click mid-fight -- so
 * the useful output is the curve, letting whoever is asking see that (say) the
 * third slot is worth 0.4 dps and the fourth is worth 0.02, and stop.
 *
 * Costs a full plan per budget, so it is a "work out my setup" call, not
 * something to run on every page load.
 */
export function budgetCurve(
  ownedIds: Iterable<number>,
  targets: MonsterTarget[],
  options: SwitchOptions
): BudgetStep[] {
  const owned = [...ownedIds];
  const steps: BudgetStep[] = [];

  for (let budget = 0; budget <= options.maxSwitches; budget += 1) {
    const plan = planSwitches(owned, targets, { ...options, maxSwitches: budget });
    steps.push({ budget, plan, marginal: budget === 0 ? 0 : plan.score - steps[budget - 1].plan.score });
  }

  return steps;
}

/** The smallest budget within `tolerance` dps of the best one on offer. */
export function fewestSwitchesFor(steps: BudgetStep[], tolerance = 0.05): BudgetStep {
  const best = Math.max(...steps.map((s) => s.plan.score));
  return steps.find((s) => s.plan.score >= best - tolerance) ?? steps[steps.length - 1];
}

/**
 * Spend the budget the beam left on the table.
 *
 * Every candidate is a loadout re-optimised from scratch for one weapon, so
 * "Emberlight but keep my crystal armour" is not among them -- the Emberlight
 * candidate drags its whole melee set and busts the budget, and the planner
 * settles for the bow. This walks the finished plan and tries single-item
 * additions against each monster, keeping any that pay for themselves and
 * still fit, which is exactly the hybrid the candidate set cannot express.
 */
function repair(
  plan: Plan,
  order: number[],
  targets: MonsterTarget[],
  owned: number[],
  maxSwitches: number,
  search: SearchOptions
): Plan {
  let current = plan;

  for (let round = 0; round < 3; round += 1) {
    let improved = false;

    for (let step = 0; step < current.picks.length; step += 1) {
      const monster = targets[order[step]].monster;
      const weight = targets[order[step]].weight ?? 1;
      const pick = current.picks[step];
      const held = new Set(pick.itemIds);
      // Repair must not undo the user's own decisions: a locked slot is
      // settled, and swapping it back out is exactly what locking forbids.
      const lockedSlots = new Set(
        (search.lockedIds ?? []).map((id) => equipmentById(id)?.slot).filter(Boolean) as string[]
      );

      let bestIds: number[] | null = null;
      let bestDps = pick.dps;

      for (const id of owned) {
        if (held.has(id)) continue;
        const slot = equipmentById(id)?.slot;
        if (!slot || lockedSlots.has(slot)) continue;

        // Replace whatever occupies that slot, or fill it if empty.
        const ids = pick.itemIds.filter((existing) => equipmentById(existing)?.slot !== slot).concat(id);
        const candidate = rescore({ ...pick, itemIds: ids }, monster, search);
        if (candidate.dps <= bestDps) continue;

        const picks = current.picks.map((p, i) => (i === step ? candidate : p));
        if (switchCost(picks) > maxSwitches) continue;

        bestDps = candidate.dps;
        bestIds = ids;
      }

      if (bestIds) {
        const replacement = rescore({ ...pick, itemIds: bestIds }, monster, search);
        const picks = current.picks.map((p, i) => (i === step ? replacement : p));
        current = {
          picks,
          used: picks.reduce((acc, p) => merge(acc, p), new Map<string, Set<number>>()),
          score: current.score + weight * (replacement.dps - pick.dps),
        };
        improved = true;
      }
    }

    if (!improved) break;
  }

  return current;
}

/**
 * Score a set of item ids against a monster. Used both to re-price gear the
 * plan already carries (free) and to price a one-item change in repair().
 *
 * The gear map is rebuilt rather than carried over -- buildPlayer may drop a
 * shield for a two-hander, so the ids asked for are not always the ids worn,
 * and reporting the stale set would misname the weapon.
 */
function rescore(loadout: SearchResult, monster: Monster, search: SearchOptions): SearchResult {
  const player = buildPlayer({ ...search, itemIds: loadout.itemIds });
  const result = evaluate(player, monster);
  const gear: Record<string, string> = {};
  const wornIds: number[] = [];
  for (const [slot, piece] of Object.entries(player.equipment)) {
    if (!piece) continue;
    gear[slot] = piece.name;
    wornIds.push(piece.id);
  }
  return {
    ...loadout,
    itemIds: wornIds,
    gear,
    dps: result.dps,
    maxHit: result.maxHit,
    accuracy: result.accuracy,
  };
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

  const distinct = new Set<number>();
  for (const pick of plan.picks) for (const id of pick.itemIds) distinct.add(id);

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
      inBag: distinct.size - loadout.itemIds.length,
    };
  });

  return {
    score: plan.score / totalWeight,
    switches: switchCost(plan.picks),
    worn,
    carried,
    perMonster,
  };
}
