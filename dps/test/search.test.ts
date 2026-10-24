import { describe, expect, it } from "vitest";
import { Prayer } from "@/enums/Prayer";
import { dpsFor, equipmentById, findMonster } from "../src/engine";
import { bestLoadout } from "../src/search";

const TWISTED_BOW = 20997;
const DRAGON_ARROW = 11212;
const RUNE_CROSSBOW = 9185;
const RUNITE_BOLTS = 9144;
const DRAGON_SCIMITAR = 4587;
const DRAGON_DEFENDER = 12954;
const MASORI_BODY_F = 27238;
const BLACK_DHIDE_BODY = 2503;
const BARROWS_GLOVES = 7462;
const PEGASIAN_BOOTS = 13237;

// Small enough to search exhaustively in milliseconds, varied enough that the
// right answer is not the only answer.
const POOL = [
  TWISTED_BOW,
  RUNE_CROSSBOW,
  DRAGON_SCIMITAR,
  DRAGON_ARROW,
  RUNITE_BOLTS,
  DRAGON_DEFENDER,
  MASORI_BODY_F,
  BLACK_DHIDE_BODY,
  BARROWS_GLOVES,
  PEGASIAN_BOOTS,
];

const vorkath = findMonster("Vorkath")!;

describe("bestLoadout", () => {
  it("only ever recommends items from the pool", () => {
    const result = bestLoadout(POOL, vorkath);

    for (const id of result.itemIds) expect(POOL).toContain(id);
  });

  it("beats a reasonable hand-picked loadout from the same pool", () => {
    const handPicked = dpsFor({ itemIds: [RUNE_CROSSBOW, RUNITE_BOLTS, BLACK_DHIDE_BODY] }, "Vorkath").dps;
    const searched = bestLoadout(POOL, vorkath).dps;

    expect(searched).toBeGreaterThan(handPicked);
  });

  it("never pairs a two-hander with a shield", () => {
    const result = bestLoadout(POOL, vorkath);

    if (result.gear.weapon && equipmentById(result.itemIds[0])?.isTwoHanded) {
      expect(result.gear.shield).toBeUndefined();
    }
  });

  // Dragon arrows out of a crossbow is not a loadout, it is a bug -- and it
  // would score as free ranged strength if the ammo check were missing.
  it("never pairs ammo with a weapon that cannot fire it", () => {
    const crossbowOnly = [RUNE_CROSSBOW, DRAGON_ARROW, RUNITE_BOLTS, BARROWS_GLOVES];
    const result = bestLoadout(crossbowOnly, vorkath);

    expect(result.itemIds).not.toContain(DRAGON_ARROW);
  });

  it("picks the stronger weapon when both are usable", () => {
    const result = bestLoadout([TWISTED_BOW, DRAGON_ARROW, RUNE_CROSSBOW, RUNITE_BOLTS], vorkath);

    expect(result.gear.weapon).toBe("Twisted bow");
  });

  it("carries prayers through into the result", () => {
    const unprayed = bestLoadout(POOL, vorkath).dps;
    const prayed = bestLoadout(POOL, vorkath, { prayers: [Prayer.RIGOUR] }).dps;

    expect(prayed).toBeGreaterThan(unprayed);
  });

  it("refuses a pool with nothing to swing", () => {
    expect(() => bestLoadout([BARROWS_GLOVES, PEGASIAN_BOOTS], vorkath)).toThrow(/no weapon in the pool/i);
  });

  it("reports how much work it did, so cost stays visible", () => {
    expect(bestLoadout(POOL, vorkath).evaluated).toBeGreaterThan(0);
  });
});
