import { describe, expect, it } from "vitest";
import { findMonster } from "../src/engine";
import { budgetCurve, fewestSwitchesFor, planSwitches } from "../src/switches";

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

  it("reports the budget as the worst fight's bag, not the starting spares", () => {
    const plan = planSwitches(POOL, TARGETS, { ...OPTS, maxSwitches: 8 });

    // `carried` is what you stow at the start; `switches` is the peak, which
    // is higher whenever a setup leaves slots empty. Conflating the two is
    // what made the old per-slot model undercount.
    expect(plan.switches).toBe(Math.max(...plan.perMonster.map((m) => m.inBag)));
    expect(plan.switches).toBeGreaterThanOrEqual(plan.carried.length);
    // A carried item is by definition not the one worn in that slot.
    for (const item of plan.carried) expect(plan.worn[item.slot]).not.toBe(item.name);
  });

  it("reports a line per target", () => {
    const plan = planSwitches(POOL, TARGETS, { ...OPTS, maxSwitches: 4 });

    // Versioned bosses are labelled "Name (Version)" so a raid's phases are
    // tellable apart.
    expect(plan.perMonster.map((m) => m.monster).sort()).toEqual(
      TARGETS.map((t) => (t.monster.version ? `${t.monster.name} (${t.monster.version})` : t.monster.name)).sort()
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
    expect(weighted.perMonster.find((m) => m.monster.startsWith("Abyssal demon"))!.weapon).toBe(
      demonOnly.perMonster[0].weapon
    );
  });

  // Counting distinct items per slot says a shield used in only one setup is
  // free. It is not: while the two-hander is equipped, that shield and its
  // one-handed weapon are both sitting in the inventory.
  it("charges for gear stowed while a two-hander is equipped", () => {
    const plan = planSwitches(POOL, TARGETS, { ...OPTS, maxSwitches: 8 });

    const brought = new Set<string>([...Object.values(plan.worn), ...plan.carried.map((c) => c.name)]);
    const worstWorn = Math.min(
      ...plan.perMonster.map((m) => Object.keys(plan.worn).length - m.swapsFromWorn.length)
    );

    // Whatever is not on your body is in your bag, so the budget must cover
    // at least the spares, and more when a setup leaves a slot empty.
    expect(plan.switches).toBeGreaterThanOrEqual(brought.size - Object.keys(plan.worn).length);
    expect(worstWorn).toBeGreaterThan(0);
  });

  it("refuses to plan for nothing", () => {
    expect(() => planSwitches(POOL, [], { maxSwitches: 2 })).toThrow(/no targets/i);
  });
});

// Locking is a constraint the planner may not trade away, not a preference.
// Camping crystal body/legs + oath helm means those slots are settled: never
// searched, never swapped, and therefore never costing an inventory space.
describe("locked slots", () => {
  const CRYSTAL_BODY = 23975;
  const CRYSTAL_LEGS = 23979;

  it("wears the locked piece against every monster", () => {
    const plan = planSwitches([...POOL, CRYSTAL_BODY, CRYSTAL_LEGS], TARGETS, {
      ...OPTS,
      maxSwitches: 6,
      lockedIds: [CRYSTAL_BODY, CRYSTAL_LEGS],
    });

    expect(plan.worn.body).toBe("Crystal body");
    expect(plan.worn.legs).toBe("Crystal legs");
    // Locked slots never appear as something you carry or swap into.
    for (const item of plan.carried) expect(["body", "legs"]).not.toContain(item.slot);
    for (const entry of plan.perMonster) {
      expect(entry.swapsFromWorn).not.toContain("Crystal body");
      expect(entry.swapsFromWorn).not.toContain("Crystal legs");
    }
  });

  it("spends the budget elsewhere rather than on the camped slots", () => {
    const locked = planSwitches([...POOL, CRYSTAL_BODY, CRYSTAL_LEGS], TARGETS, {
      ...OPTS,
      maxSwitches: 4,
      lockedIds: [CRYSTAL_BODY, CRYSTAL_LEGS],
    });

    expect(locked.switches).toBeLessThanOrEqual(4);
    expect(locked.carried.every((c) => c.slot !== "body" && c.slot !== "legs")).toBe(true);
  });

  it("rules out two-handers when the shield slot is locked", () => {
    const plan = planSwitches(POOL, TARGETS, {
      ...OPTS,
      maxSwitches: 4,
      lockedIds: [DRAGON_DEFENDER],
    });

    expect(plan.worn.shield).toBe("Dragon defender");
    for (const entry of plan.perMonster) expect(entry.weapon).not.toBe("Twisted bow");
  });

  it("says so when a lock makes the pool unusable", () => {
    expect(() =>
      planSwitches([TWISTED_BOW, DRAGON_ARROW, DRAGON_DEFENDER], TARGETS, {
        ...OPTS,
        maxSwitches: 2,
        lockedIds: [DRAGON_DEFENDER],
      })
    ).toThrow(/one-handed/i);
  });

  it("refuses to lock something that is not equipment", () => {
    expect(() => planSwitches(POOL, TARGETS, { ...OPTS, maxSwitches: 2, lockedIds: [995] })).toThrow(
      /cannot lock/i
    );
  });
});

// "Budget of 4" and "fewest I can get away with" are different questions.
describe("budgetCurve", () => {
  it("returns one plan per budget, none exceeding its own cap", () => {
    const steps = budgetCurve(POOL, TARGETS, { ...OPTS, maxSwitches: 3 });

    expect(steps.map((s) => s.budget)).toEqual([0, 1, 2, 3]);
    for (const step of steps) expect(step.plan.switches).toBeLessThanOrEqual(step.budget);
  });

  it("never reports a negative marginal, since a bigger budget cannot hurt", () => {
    const steps = budgetCurve(POOL, TARGETS, { ...OPTS, maxSwitches: 3 });

    for (const step of steps) expect(step.marginal).toBeGreaterThanOrEqual(-1e-9);
  });

  it("picks the smallest budget that gives up nothing worth having", () => {
    const steps = budgetCurve(POOL, TARGETS, { ...OPTS, maxSwitches: 4 });
    const fewest = fewestSwitchesFor(steps, 0.05);
    const best = Math.max(...steps.map((s) => s.plan.score));

    expect(fewest.plan.score).toBeGreaterThanOrEqual(best - 0.05);
    // Nothing cheaper would have done.
    for (const step of steps.filter((s) => s.budget < fewest.budget)) {
      expect(step.plan.score).toBeLessThan(best - 0.05);
    }
  });
});

// No monster data says whether you can physically reach a target. Olm's head
// has real melee defence numbers and a halberd scores against them, but you
// cannot walk up to it -- so reachability has to be an input.
describe("per-target attack styles", () => {
  const olm = (version: string, styles?: ("melee" | "ranged" | "magic")[]) => ({
    monster: findMonster("Great Olm", version)!,
    styles,
  });

  it("never picks a melee weapon for a target melee cannot reach", () => {
    const plan = planSwitches([...POOL, 23975, 23979], [olm("Head (Normal)", ["ranged", "magic"])], {
      ...OPTS,
      maxSwitches: 2,
    });

    expect(plan.perMonster[0].weapon).not.toBe("Dragon scimitar");
    expect(plan.perMonster[0].weapon).not.toBe("Emberlight");
  });

  it("restricts each phase independently", () => {
    const plan = planSwitches(POOL, [olm("Head (Normal)", ["ranged"]), olm("Left claw (Normal)", ["melee"])], {
      ...OPTS,
      maxSwitches: 4,
    });

    const head = plan.perMonster.find((m) => m.monster.includes("Head"))!;
    const claw = plan.perMonster.find((m) => m.monster.includes("Left claw"))!;
    expect(head.weapon).toBe("Twisted bow");
    expect(["Dragon scimitar", "Emberlight"]).toContain(claw.weapon);
  });

  it("says so when nothing in the pool can hit the target that way", () => {
    expect(() => planSwitches([TWISTED_BOW, DRAGON_ARROW], [olm("Head (Normal)", ["melee"])], {
      ...OPTS,
      maxSwitches: 2,
    })).toThrow(/melee/i);
  });

  it("leaves targets with no restriction free to use anything", () => {
    const plan = planSwitches(POOL, [olm("Left claw (Normal)")], { ...OPTS, maxSwitches: 2 });
    expect(plan.perMonster[0].weapon).toBeTruthy();
  });

  // Every candidate is a full re-optimisation, so "camp the armour, bring one
  // other weapon" is not among them. Before weapon-swap candidates existed,
  // a melee-only phase alongside ranged-only phases had no plan at all under
  // a small budget -- even though one spare weapon plainly covers it.
  it("finds a weapon-only swap when a full set would not fit", () => {
    const plan = planSwitches(
      POOL,
      [
        { monster: findMonster("Great Olm", "Head (Normal)")!, styles: ["ranged"] },
        { monster: findMonster("Great Olm", "Right claw (Normal)")!, styles: ["melee"] },
      ],
      { ...OPTS, maxSwitches: 2 }
    );

    expect(plan.switches).toBeLessThanOrEqual(2);
    const head = plan.perMonster.find((m) => m.monster.includes("Head"))!;
    const claw = plan.perMonster.find((m) => m.monster.includes("Right claw"))!;
    expect(head.weapon).toBe("Twisted bow");
    expect(["Dragon scimitar", "Emberlight"]).toContain(claw.weapon);
  });
});
