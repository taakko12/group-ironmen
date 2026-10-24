import { describe, expect, it } from "vitest";
import { Prayer } from "@/enums/Prayer";
import { buildPlayer, dpsFor, equipmentById, equippableBySlot, findMonster } from "../src/engine";

// Item ids as they appear in our own members.equipment / members.bank arrays.
const TWISTED_BOW = 20997;
const DRAGON_ARROW = 11212;
const MASORI_MASK_F = 27235;
const MASORI_BODY_F = 27238;
const MASORI_CHAPS_F = 27241;
const NECKLACE_OF_ANGUISH = 19547;
const AVAS_ASSEMBLER = 22109;
const PEGASIAN_BOOTS = 13237;
const BARROWS_GLOVES = 7462;
const RING_OF_SUFFERING_I = 19710;

const MAX_RANGED = [
  TWISTED_BOW,
  DRAGON_ARROW,
  MASORI_MASK_F,
  MASORI_BODY_F,
  MASORI_CHAPS_F,
  NECKLACE_OF_ANGUISH,
  AVAS_ASSEMBLER,
  PEGASIAN_BOOTS,
  BARROWS_GLOVES,
  RING_OF_SUFFERING_I,
];

describe("item id resolution", () => {
  it("resolves our ids to the calculator's equipment", () => {
    expect(equipmentById(TWISTED_BOW)?.name).toBe("Twisted bow");
    expect(equipmentById(TWISTED_BOW)?.isTwoHanded).toBe(true);
    expect(equipmentById(MASORI_BODY_F)?.slot).toBe("body");
  });

  it("ignores ids that are not equipment, rather than throwing", () => {
    // 995 is Coins -- present in every bank, equippable by nobody.
    expect(equipmentById(995)).toBeUndefined();
    expect(buildPlayer({ itemIds: [995] }).equipment.weapon).toBeNull();
  });

  it("buckets a mixed bag of ids by slot", () => {
    const bySlot = equippableBySlot([TWISTED_BOW, MASORI_BODY_F, 995, PEGASIAN_BOOTS]);
    expect(Object.keys(bySlot).sort()).toEqual(["body", "feet", "weapon"]);
  });
});

describe("loadout construction", () => {
  it("fills slots from ids and drops the shield for a two-hander", () => {
    const player = buildPlayer({ itemIds: [...MAX_RANGED, 12954] }); // + an off-hand
    expect(player.equipment.weapon?.name).toBe("Twisted bow");
    expect(player.equipment.shield).toBeNull();
  });

  it("rejects a stance the weapon does not have, instead of silently defaulting", () => {
    expect(() => buildPlayer({ itemIds: [TWISTED_BOW], styleName: "Lunge" })).toThrow(/unknown stance/i);
  });
});

describe("monster lookup", () => {
  it("finds monsters by name", () => {
    expect(findMonster("Vorkath")?.name).toBe("Vorkath");
    expect(findMonster("vorkath")?.skills.hp).toBeGreaterThan(0);
  });

  it("returns undefined rather than throwing for nonsense", () => {
    expect(findMonster("Gerald")).toBeUndefined();
  });
});

describe("dps", () => {
  it("produces a plausible number for a maxed tbow loadout", () => {
    const result = dpsFor({ itemIds: MAX_RANGED, prayers: [Prayer.RIGOUR] }, "Vorkath");

    expect(result.dps).toBeGreaterThan(1);
    expect(result.dps).toBeLessThan(30);
    expect(result.accuracy).toBeGreaterThan(0);
    expect(result.accuracy).toBeLessThanOrEqual(1);
    expect(result.maxHit).toBeGreaterThan(0);
    expect(result.attackSpeed).toBeGreaterThan(0);
  });

  // The failure this guards against is silent: forget to sum the per-piece
  // bonuses and every loadout scores as if it were naked, which still returns
  // a believable-looking float.
  it("scores a geared player far above a naked one", () => {
    const naked = dpsFor({}, "Vorkath").dps;
    const geared = dpsFor({ itemIds: MAX_RANGED, prayers: [Prayer.RIGOUR] }, "Vorkath").dps;

    expect(geared).toBeGreaterThan(naked * 3);
  });

  it("ranks a better ring above a worse one, all else equal", () => {
    const withSuffering = dpsFor({ itemIds: MAX_RANGED }, "Vorkath").dps;
    const withoutRing = dpsFor({ itemIds: MAX_RANGED.filter((id) => id !== RING_OF_SUFFERING_I) }, "Vorkath").dps;

    expect(withSuffering).toBeGreaterThanOrEqual(withoutRing);
  });

  it("knows Rigour is worth something", () => {
    const unprayed = dpsFor({ itemIds: MAX_RANGED }, "Vorkath").dps;
    const prayed = dpsFor({ itemIds: MAX_RANGED, prayers: [Prayer.RIGOUR] }, "Vorkath").dps;

    expect(prayed).toBeGreaterThan(unprayed);
  });

  it("throws on an unknown monster rather than returning zero", () => {
    expect(() => dpsFor({ itemIds: MAX_RANGED }, "Gerald")).toThrow(/unknown monster/i);
  });
});
