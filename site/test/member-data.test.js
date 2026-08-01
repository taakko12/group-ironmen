import { beforeEach, describe, expect, it } from "vitest";
import { MemberData } from "../src/data/member-data";
import { Item } from "../src/data/item";
import { Quest } from "../src/data/quest";
import { pubsub } from "../src/data/pubsub";
import { BankedXp } from "../src/data/banked-xp-data";
import { bankedXpSelection } from "../src/data/banked-xp-selection";
import { bankedXpIgnored } from "../src/data/banked-xp-ignored";
import { bankedXpModifierSelection } from "../src/data/banked-xp-modifier-selection";

describe("member-data", () => {
  let originalLookupByName;

  beforeEach(() => {
    originalLookupByName = Quest.lookupByName;
    Item.itemDetails = {
      4151: { id: 4151, name: "Abyssal whip" },
    };
    BankedXp.data = undefined;
    bankedXpSelection.selections = {};
    bankedXpIgnored.ignored = new Set();
    bankedXpModifierSelection.enabled = new Set();
  });

  it("publishes parsed collection log payload on collection_log_v2 updates", () => {
    const member = new MemberData("Alice");

    member.update({
      collection_log_v2: [{ id: 4151, quantity: 2 }],
    });

    const event = pubsub.getMostRecent("collection_log_v2:Alice");
    expect(event).toBeDefined();
    expect(event[0]).toBe(member.collectionLog);
    expect(member.collectionLog).toHaveLength(1);
    expect(member.collectionLog[0].id).toBe(4151);
    expect(member.collectionLog[0].quantity).toBe(2);
  });

  it("publishes interacting updates when payload explicitly clears interacting", () => {
    const member = new MemberData("Alice");

    member.update({
      interacting: {
        name: "<col=ff0000>Goblin</col>",
        location: { x: 3200, y: 3200, plane: 0 },
        last_updated: new Date().toISOString(),
        ratio: 1,
        scale: 1,
      },
    });

    const updatedAttributes = member.update({
      interacting: null,
    });

    const event = pubsub.getMostRecent("interacting:Alice");
    expect(updatedAttributes.has("interacting")).toBe(true);
    expect(member.interacting).toBeNull();
    expect(event).toBeDefined();
    expect(event[0]).toBeNull();
  });

  it("returns false when quest lookup data is unavailable", () => {
    const member = new MemberData("Alice");
    member.quests = {};
    Quest.lookupByName = undefined;

    expect(member.hasQuestComplete("Cook's Assistant")).toBe(false);
  });

  it("returns false when member quest data is unavailable", () => {
    const member = new MemberData("Alice");
    Quest.lookupByName = new Map([["Cook's Assistant", "1"]]);

    expect(member.hasQuestComplete("Cook's Assistant")).toBe(false);
  });

  it("does not throw when combat level is computed with incomplete skills", () => {
    const member = new MemberData("Alice");
    member.skills = {
      Attack: { level: 99 },
      Strength: { level: 99 },
    };

    expect(() => member.computeCombatLevel()).not.toThrow();
    expect(member.combatLevel).toBeUndefined();
  });

  it("computes combat level when all required skills are present", () => {
    const member = new MemberData("Alice");
    member.skills = {
      Defence: { level: 99 },
      Hitpoints: { level: 99 },
      Prayer: { level: 99 },
      Attack: { level: 99 },
      Strength: { level: 99 },
      Ranged: { level: 99 },
      Magic: { level: 99 },
    };

    member.computeCombatLevel();

    expect(member.combatLevel).toBeGreaterThan(0);
  });

  it("parses packed potion storage data into its own source map", () => {
    Item.itemDetails[244] = { id: 244, name: "Attack potion(1)" };
    const member = new MemberData("Alice");

    const updated = member.update({
      potion_storage: [
        { id: 244, quantity: 6 },
        { id: 244, quantity: 2 },
      ],
    });

    expect(updated.has("potion_storage")).toBe(true);
    expect(member.itemQuantities.potionStorage.get(244)).toBe(8);
    expect(member.totalItemQuantity(244)).toBe(0);
  });

  it("publishes potion storage update on its own topic", () => {
    Item.itemDetails[244] = { id: 244, name: "Attack potion(1)" };
    const member = new MemberData("Alice");

    member.update({ potion_storage: [{ id: 244, quantity: 4 }] });

    const event = pubsub.getMostRecent("potionStorage:Alice");
    expect(event).toBeDefined();
    expect(event[0]).toHaveLength(1);
    expect(event[0][0].id).toBe(244);
    expect(event[0][0].quantity).toBe(4);
  });

  it("replaces prior potion storage with a new snapshot", () => {
    Item.itemDetails[244] = { id: 244, name: "Attack potion(1)" };
    Item.itemDetails[245] = { id: 245, name: "Strength potion(1)" };
    const member = new MemberData("Alice");

    member.update({ potion_storage: [{ id: 244, quantity: 6 }] });
    member.update({ potion_storage: [{ id: 245, quantity: 3 }] });

    expect(member.itemQuantities.potionStorage.get(244)).toBeUndefined();
    expect(member.itemQuantities.potionStorage.get(245)).toBe(3);
  });

  it("clears potion storage with an empty array without affecting normal items", () => {
    Item.itemDetails[244] = { id: 244, name: "Attack potion(1)" };
    Item.itemDetails[4151] = { id: 4151, name: "Abyssal whip" };
    const member = new MemberData("Alice");

    member.update({ inventory: [{ id: 4151, quantity: 2 }] });
    member.update({ potion_storage: [{ id: 244, quantity: 4 }] });

    expect(member.itemQuantities.potionStorage.get(244)).toBe(4);

    member.update({ potion_storage: [] });

    expect(member.itemQuantities.potionStorage.get(244)).toBeUndefined();
    expect(member.itemQuantities.potionStorage.size).toBe(0);
    expect(member.totalItemQuantity(4151)).toBe(2);
  });

  it("computes banked xp, defaulting to the highest-xp activity the member's skill level qualifies for", () => {
    Item.itemDetails[440] = { id: 440, name: "Iron ore" };
    BankedXp.data = {
      440: [
        { id: "iron_bar", skill: "Smithing", name: "Iron bar", level: 15, xp: 12.5 },
        { id: "steel_bar", skill: "Smithing", name: "Steel bar", level: 30, xp: 17.5 },
      ],
    };
    const member = new MemberData("Alice");
    member.skills = { Smithing: { level: 20 } };
    member.update({ bank: [{ id: 440, quantity: 10 }] });

    const bySkill = member.computeBankedXp();

    expect(bySkill.Smithing.xp).toBe(125);
    expect(bySkill.Smithing.effectiveXp).toBe(125);
    expect(bySkill.Smithing.items).toHaveLength(1);
    expect(bySkill.Smithing.items[0].activity.id).toBe("iron_bar");
    expect(bySkill.Smithing.items[0].secondaries).toEqual([]);
  });

  it("falls back to the lowest-level activity when the member qualifies for none", () => {
    Item.itemDetails[440] = { id: 440, name: "Iron ore" };
    BankedXp.data = {
      440: [{ id: "steel_bar", skill: "Smithing", name: "Steel bar", level: 30, xp: 17.5 }],
    };
    const member = new MemberData("Alice");
    member.skills = { Smithing: { level: 1 } };
    member.update({ bank: [{ id: 440, quantity: 2 }] });

    const bySkill = member.computeBankedXp();

    expect(bySkill.Smithing.xp).toBe(35);
  });

  it("uses a manually selected activity override instead of the computed default", () => {
    Item.itemDetails[440] = { id: 440, name: "Iron ore" };
    BankedXp.data = {
      440: [
        { id: "iron_bar", skill: "Smithing", name: "Iron bar", level: 15, xp: 12.5 },
        { id: "steel_bar", skill: "Smithing", name: "Steel bar", level: 30, xp: 17.5 },
      ],
    };
    bankedXpSelection.set(440, "iron_bar");
    const member = new MemberData("Alice");
    member.skills = { Smithing: { level: 99 } };
    member.update({ bank: [{ id: 440, quantity: 10 }] });

    const bySkill = member.computeBankedXp();

    expect(bySkill.Smithing.items[0].activity.id).toBe("iron_bar");
    expect(bySkill.Smithing.xp).toBe(125);
  });

  it("caps effective xp when the member is short on a required secondary", () => {
    Item.itemDetails[3004] = { id: 3004, name: "Super restore(4)" };
    Item.itemDetails[223] = { id: 223, name: "Red spider's eggs" };
    BankedXp.data = {
      3004: [
        {
          id: "super_restore",
          skill: "Herblore",
          name: "Super restore",
          level: 63,
          xp: 142.5,
          secondaries: [{ itemId: 223, qty: 1 }],
        },
      ],
    };
    const member = new MemberData("Alice");
    member.skills = { Herblore: { level: 99 } };
    member.update({ bank: [{ id: 3004, quantity: 10 }] });
    member.update({ inventory: [{ id: 223, quantity: 4 }] });

    const bySkill = member.computeBankedXp();

    expect(bySkill.Herblore.xp).toBe(1425);
    expect(bySkill.Herblore.effectiveXp).toBe(570);
    expect(bySkill.Herblore.items[0].affordableActions).toBe(4);
    expect(bySkill.Herblore.items[0].secondaries[0].have).toBe(4);
  });

  it("is limited by whichever required secondary is scarcest when multiple are needed at once", () => {
    Item.itemDetails[100] = { id: 100, name: "Test unf potion" };
    Item.itemDetails[201] = { id: 201, name: "Secondary A" };
    Item.itemDetails[202] = { id: 202, name: "Secondary B" };
    BankedXp.data = {
      100: [
        {
          id: "act",
          skill: "Herblore",
          name: "Test potion",
          level: 1,
          xp: 10,
          secondaries: [
            { itemId: 201, qty: 1 },
            { itemId: 202, qty: 2 },
          ],
        },
      ],
    };
    const member = new MemberData("Alice");
    member.skills = { Herblore: { level: 99 } };
    member.update({ bank: [{ id: 100, quantity: 20 }] });
    member.update({
      inventory: [
        { id: 201, quantity: 15 },
        { id: 202, quantity: 10 },
      ],
    });

    const bySkill = member.computeBankedXp();

    // Secondary A affords 15, secondary B affords floor(10/2)=5 -- scarcest wins.
    expect(bySkill.Herblore.items[0].affordableActions).toBe(5);
    expect(bySkill.Herblore.effectiveXp).toBe(50);
  });

  it("sums alternate item forms (Crushable) toward a secondary requirement", () => {
    Item.itemDetails[93] = { id: 93, name: "Grimy marrentill" };
    Item.itemDetails[235] = { id: 235, name: "Unicorn horn dust" };
    Item.itemDetails[237] = { id: 237, name: "Unicorn horn" };
    BankedXp.data = {
      93: [
        {
          id: "antipoison",
          skill: "Herblore",
          name: "Antipoison",
          level: 5,
          xp: 37.5,
          secondaries: [{ itemId: 235, qty: 1, altItemIds: [237] }],
        },
      ],
    };
    const member = new MemberData("Alice");
    member.skills = { Herblore: { level: 99 } };
    member.update({ bank: [{ id: 93, quantity: 5 }] });
    member.update({
      inventory: [
        { id: 235, quantity: 2 },
        { id: 237, quantity: 3 },
      ],
    });

    const bySkill = member.computeBankedXp();

    expect(bySkill.Herblore.items[0].affordableActions).toBe(5);
    expect(bySkill.Herblore.effectiveXp).toBe(bySkill.Herblore.xp);
  });

  it("weights a doseGroup secondary by dose count", () => {
    Item.itemDetails[300] = { id: 300, name: "Test herb" };
    Item.itemDetails[3022] = { id: 3022, name: "Super energy(1)" };
    Item.itemDetails[3020] = { id: 3020, name: "Super energy(2)" };
    BankedXp.data = {
      300: [
        {
          id: "stamina",
          skill: "Herblore",
          name: "Stamina potion",
          level: 77,
          xp: 25.5,
          secondaries: [{ itemId: 3022, qty: 1, doseGroup: [3022, 3020, 3018, 3016] }],
        },
      ],
    };
    const member = new MemberData("Alice");
    member.skills = { Herblore: { level: 99 } };
    member.update({ bank: [{ id: 300, quantity: 10 }] });
    member.update({
      inventory: [
        { id: 3022, quantity: 1 },
        { id: 3020, quantity: 2 },
      ],
    });

    const bySkill = member.computeBankedXp();

    // 1 one-dose (1x1) + 2 two-dose (2x2) = 5 doses available.
    expect(bySkill.Herblore.items[0].affordableActions).toBe(5);
  });

  it("excludes an ignored item from skill totals but still lists it", () => {
    Item.itemDetails[93] = { id: 93, name: "Grimy marrentill" };
    BankedXp.data = {
      93: [{ id: "clean_marrentill", skill: "Herblore", name: "Clean marrentill", level: 1, xp: 3.8 }],
    };
    const member = new MemberData("Alice");
    member.skills = { Herblore: { level: 99 } };
    member.update({ bank: [{ id: 93, quantity: 10 }] });

    bankedXpIgnored.toggle(93);
    const bySkill = member.computeBankedXp();

    expect(bySkill.Herblore.xp).toBe(0);
    expect(bySkill.Herblore.effectiveXp).toBe(0);
    expect(bySkill.Herblore.items[0].ignored).toBe(true);
  });

  it("applies an enabled skill xp modifier to both xp and effectiveXp", () => {
    Item.itemDetails[1521] = { id: 1521, name: "Oak logs" };
    BankedXp.data = {
      1521: [{ id: "oak_plank", skill: "Construction", name: "Oak Plank", level: 15, xp: 60 }],
    };
    const member = new MemberData("Alice");
    member.skills = { Construction: { level: 99 } };
    member.update({ bank: [{ id: 1521, quantity: 10 }] });

    bankedXpModifierSelection.toggle("carpenters_outfit");
    const bySkill = member.computeBankedXp();

    expect(bySkill.Construction.xp).toBeCloseTo(60 * 1.025 * 10);
    expect(bySkill.Construction.effectiveXp).toBeCloseTo(60 * 1.025 * 10);
  });

  it("cascades quantity from an item whose selected activity feeds into another bankable item", () => {
    Item.itemDetails[1511] = { id: 1511, name: "Logs" };
    Item.itemDetails[960] = { id: 960, name: "Plank" };
    BankedXp.data = {
      1511: [{ id: "regular_plank", skill: "Construction", name: "Regular Plank", level: 1, xp: 0, linkedItemId: 960 }],
      960: [{ id: "plank_products", skill: "Construction", name: "Regular plank products", level: 1, xp: 29 }],
    };
    const member = new MemberData("Alice");
    member.skills = { Construction: { level: 99 } };
    member.update({ bank: [{ id: 1511, quantity: 10 }] });

    const bySkill = member.computeBankedXp();

    // Logs contribute 0 xp on their own (Regular Plank is 0xp); the cascaded
    // 10 logs -> 10 planks show up entirely on the Plank item's row instead,
    // even though the member holds zero actual planks.
    expect(bySkill.Construction.xp).toBe(290);
    const logsItem = bySkill.Construction.items.find((i) => i.itemId === 1511);
    const plankItem = bySkill.Construction.items.find((i) => i.itemId === 960);
    expect(logsItem.xp).toBe(0);
    expect(plankItem.bankQuantity).toBe(0);
    expect(plankItem.cascadedQuantity).toBe(10);
    expect(plankItem.xp).toBe(290);
  });

  it("excludes an ignored item from contributing cascaded quantity downstream", () => {
    Item.itemDetails[1511] = { id: 1511, name: "Logs" };
    Item.itemDetails[960] = { id: 960, name: "Plank" };
    BankedXp.data = {
      1511: [{ id: "regular_plank", skill: "Construction", name: "Regular Plank", level: 1, xp: 0, linkedItemId: 960 }],
      960: [{ id: "plank_products", skill: "Construction", name: "Regular plank products", level: 1, xp: 29 }],
    };
    const member = new MemberData("Alice");
    member.skills = { Construction: { level: 99 } };
    member.update({ bank: [{ id: 1511, quantity: 10 }] });

    bankedXpIgnored.toggle(1511);
    const bySkill = member.computeBankedXp();

    expect(bySkill.Construction.xp).toBe(0);
  });

  it("ignores bank items with no banked-xp data", () => {
    Item.itemDetails[4151] = { id: 4151, name: "Abyssal whip" };
    BankedXp.data = {};
    const member = new MemberData("Alice");
    member.update({ bank: [{ id: 4151, quantity: 1 }] });

    expect(member.computeBankedXp()).toEqual({});
  });

  afterEach(() => {
    Quest.lookupByName = originalLookupByName;
  });
});
