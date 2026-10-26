// Caches an item id -> name map fetched from the deployed frontend's static
// item_data.json, so bank-ping messages can show a readable item name
// without needing a copy of the item database in this repo.

const SITE_URL = process.env.SITE_URL || 'https://group-ironmen.vercel.app';
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 day — item data rarely changes

let itemNames = new Map();
let itemIds = new Map();

function normalizeItemName(name) {
  return name.trim().toLowerCase();
}

async function load() {
  try {
    const response = await fetch(`${SITE_URL}/data/item_data.json`);
    const data = await response.json();
    itemNames = new Map(Object.entries(data).map(([id, item]) => [Number(id), item.name]));

    // Names are not unique: placeholders, ornament kits and beta copies all
    // repeat them, so building this map naively keeps whichever id happened
    // to come last. That is how "dragon wh" resolved to a Dragon warhammer
    // with no GE price while the real one sits at 13576. Lowest id wins --
    // it is the real item for everything anyone would look up.
    itemIds = new Map();
    for (const [id, name] of itemNames) {
      const key = normalizeItemName(name);
      const existing = itemIds.get(key);
      if (existing === undefined || id < existing) itemIds.set(key, id);
    }
    console.log(`[itemData] Loaded ${itemNames.size} item names`);
  } catch (err) {
    console.error(`[itemData] Failed to load item data: ${err.message}`);
  }
}

function start() {
  load();
  setInterval(load, REFRESH_INTERVAL_MS);
}

function getItemName(itemId) {
  return itemNames.get(itemId) ?? `item #${itemId}`;
}

// Reverse lookup for parsing Dink text, which only ever gives item names.
// Returns null (rather than throwing) for names we can't resolve, since
// callers should still log the entry with just the name.
function getItemId(name) {
  return itemIds.get(normalizeItemName(name)) ?? null;
}

// Every character of the query appearing in order, so "bgs" finds "Bandos
// godsword" and "twsted" survives a typo. Deliberately the last tier of
// matching: on its own it is far too generous, since almost any short query
// is a subsequence of something.
function isSubsequence(query, name) {
  let i = 0;
  for (const character of name) {
    if (character === query[i]) i += 1;
    if (i === query.length) return true;
  }
  return false;
}

/**
 * Items whose names resemble `query`, best first.
 *
 * Tiered rather than scored: an exact name always wins, then a prefix, then a
 * substring, then a subsequence. Within a tier the shorter name wins, because
 * a query is a better match for "Dragon dagger" than "Dragon dagger(p++)",
 * and ties break on the lower id -- names are not unique in the catalog
 * (placeholders and variants repeat them) and the lowest id is the real item.
 */
// Community abbreviations. No amount of string distance turns "bgs" into
// "Bandos godsword" -- it is a convention, not a spelling, and a subsequence
// match happily prefers "Big bass". These are what people actually type.
const ALIASES = {
  bgs: 'bandos godsword',
  ags: 'armadyl godsword',
  sgs: 'saradomin godsword',
  zgs: 'zamorak godsword',
  dwh: 'dragon warhammer',
  dds: 'dragon dagger',
  dfs: 'dragon fire shield',
  tbow: 'twisted bow',
  bowfa: 'bow of faerdhinen',
  scythe: 'scythe of vitur',
  tent: 'abyssal tentacle',
  whip: 'abyssal whip',
  ely: 'elysian spirit shield',
  acb: 'armadyl crossbow',
  dhcb: 'dragon hunter crossbow',
  dhl: 'dragon hunter lance',
  fang: "osmumten's fang",
  shadow: "tumeken's shadow",
  sang: 'sanguinesti staff',
  ward: 'elidinis ward',
  avernic: 'avernic defender',
  torture: 'amulet of torture',
  anguish: 'necklace of anguish',
  fury: 'amulet of fury',
  prims: 'primordial boots',
  pegs: 'pegasian boots',
  ferocious: 'ferocious gloves',
  bis: 'barrows gloves',
};

function searchItems(query, limit = 5) {
  const needle = ALIASES[normalizeItemName(query)] ?? normalizeItemName(query);
  if (needle.length < 2) return [];

  const tierOf = (name) => {
    if (name === needle) return 0;
    if (name.startsWith(needle)) return 1;
    if (name.includes(needle)) return 2;
    return isSubsequence(needle, name) ? 3 : -1;
  };

  const matches = [];
  for (const [name, id] of itemIds) {
    const tier = tierOf(name);
    if (tier >= 0) matches.push({ id, name, tier });
  }

  matches.sort((a, b) => a.tier - b.tier || a.name.length - b.name.length || a.id - b.id);
  return matches.slice(0, limit).map(({ id }) => ({ id, name: getItemName(id) }));
}

/** Best single match, or null. The common case for a command argument. */
function findItem(query) {
  return searchItems(query, 1)[0] ?? null;
}

module.exports = { start, getItemName, getItemId, searchItems, findItem, SITE_URL };
