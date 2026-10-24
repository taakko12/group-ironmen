import { describe, expect, it, vi } from "vitest";

vi.mock("../src/data/api", () => ({ api: {} }));

import { ItemsPage } from "../src/items-page/items-page";

// The regex GearScape validates a pasted bank tag against before importing it.
const GEARSCAPE_BANK_TAG = /^banktags,1,[^,]*(,[0-9]+)+$/;

const members = [
  { name: "T aak", bank: [{ id: 20997, quantity: 1 }], equipment: [{ id: 11832, quantity: 1 }], inventory: [] },
  {
    name: "N a s h",
    bank: [
      { id: 20997, quantity: 1 },
      { id: 0, quantity: 0 },
    ],
    equipment: null,
    inventory: null,
  },
];

describe("ItemsPage.bankTagFor", () => {
  it("emits a tag GearScape accepts, skipping empty slots", () => {
    const tag = ItemsPage.bankTagFor("T aak", members);

    expect(tag).toMatch(GEARSCAPE_BANK_TAG);
    expect(tag).toBe("banktags,1,T aak,995,20997,11832");
  });

  it("unions every member for the all-players filter, without repeating an id", () => {
    const tag = ItemsPage.bankTagFor("@ALL", members);

    expect(tag).toMatch(GEARSCAPE_BANK_TAG);
    expect(tag.match(/20997/g)).toHaveLength(1);
  });

  it("drops commas from the name so the tag keeps its field count", () => {
    const tag = ItemsPage.bankTagFor("a,b", [{ name: "a,b", bank: [{ id: 4151, quantity: 1 }] }]);

    expect(tag).toMatch(GEARSCAPE_BANK_TAG);
    expect(tag).toBe("banktags,1,ab,995,4151");
  });

  it("returns null when the filtered player has nothing loaded", () => {
    expect(ItemsPage.bankTagFor("nobody", members)).toBeNull();
  });
});
