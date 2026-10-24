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

describe("GearGoalsPage.rowHtml", () => {
  beforeEach(() => {
    Item.itemDetails = {
      20997: { id: 20997, name: "Twisted bow", highalch: 2400000 },
      30765: { id: 30765, name: "Oathplate shards", highalch: 600 },
    };
  });

  it("greens the cell of every member holding the item", () => {
    const html = GearGoalsPage.rowHtml(
      { id: 1, item_id: 20997, target_quantity: 1, quantities: { aaa: 1, bbb: 0, ccc: 2 } },
      ["aaa", "bbb", "ccc"]
    );

    expect(html.match(/gear-goals-page__cell--have/g)).toHaveLength(2);
    expect(html.match(/<item-box/g)).toHaveLength(3);
    expect(html).toContain("2 / 3");
  });

  it("renders an unknown item id without an item-box", () => {
    const html = GearGoalsPage.rowHtml({ id: 3, item_id: 123456, target_quantity: 1, quantities: { aaa: 9 } }, ["aaa"]);

    expect(html).toContain("Item 123456");
    expect(html).not.toContain("<item-box");
  });
});

describe("GearGoalsPage.stockpileHtml", () => {
  beforeEach(() => {
    Item.itemDetails = { 30765: { id: 30765, name: "Oathplate shards", highalch: 600 } };
  });

  it("sums the group total against the target", () => {
    const html = GearGoalsPage.stockpileHtml({
      id: 2,
      item_id: 30765,
      target_quantity: 1800,
      quantities: { aaa: 751, bbb: 0 },
    });

    expect(html).toContain("751 / 1,800");
    expect(html).toContain("width: 41.72222222222222%");
  });

  it("caps the bar at a met goal", () => {
    const html = GearGoalsPage.stockpileHtml({ id: 4, item_id: 30765, target_quantity: 5, quantities: { aaa: 9 } });

    expect(html).toContain("width: 100%");
  });
});

describe("GearGoalsPage.prototype.memberNames", () => {
  it("sorts members alphabetically with shared storage last", () => {
    const page = { goals: [{ quantities: { zeta: 0, "@SHARED": 1 } }, { quantities: { alpha: 0 } }] };

    expect(GearGoalsPage.prototype.memberNames.call(page)).toEqual(["alpha", "zeta", "@SHARED"]);
  });
});
