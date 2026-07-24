// Computes "how dry" a member is on a boss's notable uniques: total KC (from
// WOM, via /wom-boss-kc) vs whether they've ever obtained each unique
// (checked against their collection log, which reflects true lifetime
// unlock status regardless of when the bot started tracking loot drops).
// Pure math, no LLM involved -- this is presented as a real stat, not a
// joke, so it stays separate from personality.js entirely.

const { getBossKc, getGroupMembers } = require('./backendClient');
const { getItemId } = require('./itemData');
const droprates = require('./data/droprates');

function normalizeBossName(input) {
  return input
    .toLowerCase()
    .replace(/^the /, '')
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function findBoss(input) {
  const normalized = normalizeBossName(input);
  for (const [key, boss] of Object.entries(droprates)) {
    if (key === normalized || normalizeBossName(boss.displayName) === normalized) {
      return { key, ...boss };
    }
  }
  return null;
}

// collection_log_v2 is a flat [id, quantity, id, quantity, ...] array (see
// site/src/data/group-data.js's transformItemsFromStorage for the same
// decoding on the site side), not the {id, quantity} pairs it gets turned
// into for display.
function decodeCollectionLog(flat) {
  const unlocked = new Set();
  if (!flat) return unlocked;
  for (let i = 0; i < flat.length; i += 2) {
    const id = flat[i];
    const quantity = flat[i + 1];
    if (id > 0 && quantity > 0) unlocked.add(id);
  }
  return unlocked;
}

async function getDryStreak(memberName, bossInput) {
  const boss = findBoss(bossInput);
  if (!boss) {
    return { error: `No droprate data for "${bossInput}" yet -- ask to have it added.` };
  }
  if (!boss.uniques.length) {
    return { error: `No droprate data seeded for ${boss.displayName} yet.` };
  }

  const [bossKc, members] = await Promise.all([getBossKc(), getGroupMembers()]);

  // The LLM-supplied member name isn't guaranteed to match RSN casing
  // exactly, so resolve it case-insensitively against the real member list
  // rather than indexing bossKc/members directly with whatever it sent.
  const normalizedInput = memberName.toLowerCase();
  const member = members.find((m) => m.name.toLowerCase() === normalizedInput);
  if (!member) {
    return { error: `No group member named "${memberName}" found.` };
  }

  const kc = bossKc[member.name]?.[boss.key];
  if (kc == null) {
    return {
      error: `No WOM kill count found for ${member.name} at ${boss.displayName} (never ranked on the hiscores for it, or WOM hasn't synced yet).`,
    };
  }

  const unlockedItemIds = decodeCollectionLog(member.collection_log_v2);

  const items = boss.uniques.map((unique) => {
    const itemId = getItemId(unique.name);
    const obtained = itemId != null && unlockedItemIds.has(itemId);
    const probabilityStillDryPercent = obtained
      ? null
      : Number((Math.pow(1 - 1 / unique.rate, kc) * 100).toFixed(1));
    return {
      item: unique.name,
      rate: unique.rate,
      obtained,
      probabilityStillDryPercent,
      note: unique.note ?? null,
    };
  });

  return { member: member.name, boss: boss.displayName, kc, items };
}

module.exports = { getDryStreak, findBoss };
