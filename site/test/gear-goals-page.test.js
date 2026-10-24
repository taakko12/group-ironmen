import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/data/api", () => ({
  api: {
    getGearGoals: vi.fn(),
    addGearGoal: vi.fn(),
    deleteGearGoal: vi.fn(),
  },
}));

import { Item } from "../src/data/item";
import { GearGoalsPage } from "../src/gear-goals-page/gear-goals-page";

const MEMBERS = ["aaa", "bbb", "ccc"];

beforeEach(() => {
  Item.itemDetails = {
    20997: { id: 20997, name: "Twisted bow", highalch: 2400000 },
    30765: { id: 30765, name: "Oathplate shards", highalch: 600 },
    9185: { id: 9185, name: "Rune crossbow", highalch: 18000 },
    841: { id: 841, name: "Shortbow", highalch: 15 },
    565: { id: 565, name: "Blood rune", highalch: 0 },
  };
  GearGoalsPage._itemIdsByName = null;
});

describe("GearGoalsPage.progress", () => {
  it("counts members holding the piece when the target is one", () => {
    const p = GearGoalsPage.progress(
      { item_id: 20997, target_quantity: 1, quantities: { aaa: 1, bbb: 0, ccc: 2 } },
      MEMBERS
    );

    expect(p).toMatchObject({ current: 2, goalTotal: 3, stockpile: false, done: false });
  });

  it("sums the group total against the target for stockpiles", () => {
    const p = GearGoalsPage.progress({ item_id: 30765, target_quantity: 1800, quantities: { aaa: 751, bbb: 0 } }, [
      "aaa",
      "bbb",
    ]);

    expect(p).toMatchObject({ current: 751, goalTotal: 1800, stockpile: true, done: false });
    expect(p.ratio).toBeCloseTo(0.4172, 4);
  });

  it("caps a met goal at done, without overflowing the bar", () => {
    const p = GearGoalsPage.progress({ item_id: 30765, target_quantity: 5, quantities: { aaa: 9 } }, ["aaa"]);

    expect(p).toMatchObject({ done: true, ratio: 1 });
  });
});

describe("GearGoalsPage.cardHtml", () => {
  it("gives every member a chip and greens the ones holding it", () => {
    const html = GearGoalsPage.cardHtml(
      { id: 1, item_id: 20997, target_quantity: 1, quantities: { aaa: 1, bbb: 0, ccc: 2 } },
      MEMBERS
    );

    expect(html.match(/gear-goals-page__chip /g)).toHaveLength(3);
    expect(html.match(/gear-goals-page__chip--have/g)).toHaveLength(2);
    expect(html).toContain("Twisted bow");
    expect(html).toContain("2 / 3");
  });

  it("shows held quantities on stockpile chips instead of a tick", () => {
    const html = GearGoalsPage.cardHtml(
      { id: 2, item_id: 30765, target_quantity: 1800, quantities: { aaa: 751, bbb: 0 } },
      ["aaa", "bbb"]
    );

    expect(html).toContain("751 / 1,800");
    expect(html).toContain(">751<");
    expect(html).not.toContain("&check;");
  });

  it("labels shared storage rather than printing @SHARED", () => {
    const html = GearGoalsPage.cardHtml({ id: 3, item_id: 20997, target_quantity: 1, quantities: { "@SHARED": 1 } }, [
      "@SHARED",
    ]);

    expect(html).toContain("Shared");
    expect(html).not.toContain("@SHARED");
    expect(html).toContain("gear-goals-page__chip--shared");
  });

  it("still renders an item id the catalog no longer knows, without an item-box", () => {
    const html = GearGoalsPage.cardHtml({ id: 4, item_id: 123456, target_quantity: 1, quantities: { aaa: 0 } }, [
      "aaa",
    ]);

    expect(html).toContain("Item 123456");
    expect(html).not.toContain("<item-box");
  });

  it("carries the item id so an inline target edit knows what to upsert", () => {
    const html = GearGoalsPage.cardHtml({ id: 5, item_id: 9185, target_quantity: 3, quantities: {} }, []);

    expect(html).toContain('data-item-id="9185"');
    expect(html).toContain('value="3"');
  });
});

describe("GearGoalsPage.search", () => {
  it("ranks names that start with the query above incidental matches", () => {
    // "Rune crossbow" starts with it; "Blood rune" only contains it.
    const ids = GearGoalsPage.search("rune");

    expect(ids.indexOf(9185)).toBeLessThan(ids.indexOf(565));
  });

  it("still finds matches in the middle of a name", () => {
    expect(GearGoalsPage.search("bow")).toEqual(expect.arrayContaining([20997, 841]));
  });

  it("ignores queries shorter than two characters", () => {
    expect(GearGoalsPage.search("b")).toEqual([]);
  });

  it("honours the result limit", () => {
    expect(GearGoalsPage.search("bow", 1)).toHaveLength(1);
  });
});

describe("GearGoalsPage.prototype.memberNames", () => {
  it("sorts members alphabetically with shared storage last", () => {
    const page = { goals: [{ quantities: { zeta: 0, "@SHARED": 1 } }, { quantities: { alpha: 0 } }] };

    expect(GearGoalsPage.prototype.memberNames.call(page)).toEqual(["alpha", "zeta", "@SHARED"]);
  });
});
