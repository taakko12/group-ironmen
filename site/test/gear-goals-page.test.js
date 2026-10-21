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

  it("counts members for a target of one", () => {
    const html = GearGoalsPage.rowHtml(
      { id: 1, item_id: 20997, target_quantity: 1, quantities: { aaa: 1, bbb: 0, ccc: 2 } },
      ["aaa", "bbb", "ccc"]
    );

    expect(html).toContain("2 / 3");
    expect(html.match(/gear-goals-page__cell--have/g)).toHaveLength(2);
    expect(html).toContain("width: 66.66666666666666%");
  });

  it("sums the group total against the target for stockpiles", () => {
    const html = GearGoalsPage.rowHtml(
      { id: 2, item_id: 30765, target_quantity: 1800, quantities: { aaa: 751, bbb: 0 } },
      ["aaa", "bbb"]
    );

    expect(html).toContain("751 / 1,800");
    expect(html).toContain("width: 41.72222222222222%");
  });

  it("caps the bar at a met goal and still renders an unknown item id", () => {
    const html = GearGoalsPage.rowHtml({ id: 3, item_id: 123456, target_quantity: 5, quantities: { aaa: 9 } }, ["aaa"]);

    expect(html).toContain("width: 100%");
    expect(html).toContain("Item 123456");
    expect(html).not.toContain("<item-box");
  });
});

describe("GearGoalsPage.prototype.memberNames", () => {
  it("sorts members alphabetically with shared storage last", () => {
    const page = { goals: [{ quantities: { zeta: 0, "@SHARED": 1 } }, { quantities: { alpha: 0 } }] };

    expect(GearGoalsPage.prototype.memberNames.call(page)).toEqual(["alpha", "zeta", "@SHARED"]);
  });
});
