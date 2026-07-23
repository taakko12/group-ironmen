// Caches an item id -> name map fetched from the deployed frontend's static
// item_data.json, so bank-ping messages can show a readable item name
// without needing a copy of the item database in this repo.

const SITE_URL = process.env.SITE_URL || 'https://group-ironmen.vercel.app';
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 day — item data rarely changes

let itemNames = new Map();

async function load() {
  try {
    const response = await fetch(`${SITE_URL}/data/item_data.json`);
    const data = await response.json();
    itemNames = new Map(Object.entries(data).map(([id, item]) => [Number(id), item.name]));
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

module.exports = { start, getItemName };
