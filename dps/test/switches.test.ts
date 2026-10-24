import { describe, expect, it } from "vitest";
import { findMonster } from "../src/engine";
import { planSwitches } from "../src/switches";

const TWISTED_BOW = 20997;
const DRAGON_ARROW = 11212;
const EMBERLIGHT = 28997; // demonbane, only worth carrying against demons
const DRAGON_SCIMITAR = 4587;
const DRAGON_DEFENDER = 12954;
const MASORI_BODY_F = 27238;
const BARROWS_GLOVES = 7462;
const PEGASIAN_BOOTS = 13237;

const POOL = [
  TWISTED_BOW,
  DRAGON_ARROW,
  EMBERLIGHT,
  DRAGON_SCIMITAR,
  DRAGON_DEFENDER,
  MASORI_BODY_F,
  BARROWS_GLOVES,
  PEGASIAN_BOOTS,
];

const TARGETS = [
  { monster: findMonster("Vorkath")! },
  { monster: findMonster("Abyssal demon")! },
  { monster: findMonster("General Graardor")! },
];

const OPTS = { maxWeapons: 6, candidatesPerMonster: 4 };

describe("planSwitches", () => {
  it("fits a zero-switch budget by wearing one setup throughout", () => {
    const plan = planSwitches(POOL, TARGETS, { ...OPTS, maxSwitches: 0 });

    expect(plan.switches).toBe(0);
    expect(plan.carried).toHaveLength(0);
    // Every monster is fought in the same gear, so nothing is ever swapped.
    for (const entry of plan.perMonster) expect(entry.swapsFromWorn).toHaveLength(0);
  });

  it("never exceeds the budget it was given", () => {
    for (const maxSwitches of [0, 1, 3, 6]) {
      expect(planSwitches(POOL, TARGETS, { ...OPTS, maxSwitches }).switches).toBeLessThanOrEqual(maxSwitches);
    }
  });

  // The whole point: more inventory space must never buy a worse plan, since
  // every plan available at a smaller budget is still available at a larger.
  it("never scores worse with a bigger budget", () => {
    const scores = [0, 2, 4, 8].map((maxSwitches) => planSwitches(POOL, TARGETS, { ...OPTS, maxSwitches }).score);

    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1] - 1e-9);
    }
  });

  it("spends a budget rather than ignoring it", () => {
    const tight = planSwitches(POOL, TARGETS, { ...OPTS, maxSwitches: 0 }).score;
    const loose = planSwitches(POOL, TARGETS, { ...OPTS, maxSwitches: 8 }).score;

    expect(loose).toBeGreaterThan(tight);
  });

  it("counts carried items as everything beyond one per slot", () => {
    const plan = planSwitches(POOL, TARGETS, { ...OPTS, maxSwitches: 8 });

    expect(plan.carried).toHaveLength(plan.switches);
    // A carried item is by definition not the one worn in that slot.
    for (const item of plan.carried) expect(plan.worn[item.slot]).not.toBe(item.name);
  });

  it("reports a line per target", () => {
    const plan = planSwitches(POOL, TARGETS, { ...OPTS, maxSwitches: 4 });

    expect(plan.perMonster.map((m) => m.monster).sort()).toEqual(
      TARGETS.map((t) => t.monster.name).sort()
    );
  });

  it("lets weighting pull the plan toward what you actually fight", () => {
    const weighted = planSwitches(
      POOL,
      [
        { monster: findMonster("Abyssal demon")!, weight: 100 },
        { monster: findMonster("Vorkath")!, weight: 1 },
      ],
      { ...OPTS, maxSwitches: 0 }
    );
    const demonOnly = planSwitches(POOL, [{ monster: findMonster("Abyssal demon")! }], {
      ...OPTS,
      maxSwitches: 0,
    });

    // With the demon dominating the weights, the single setup should be the
    // one the demon would have picked on its own.
    expect(weighted.perMonster.find((m) => m.monster === "Abyssal demon")!.weapon).toBe(
      demonOnly.perMonster[0].weapon
    );
  });

  it("refuses to plan for nothing", () => {
    expect(() => planSwitches(POOL, [], { maxSwitches: 2 })).toThrow(/no targets/i);
  });
});
