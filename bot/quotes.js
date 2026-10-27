// The group's own quote book.
//
// Storage only -- same volume-backed pattern as custom commands, so a deploy
// cannot eat it. Quotes are kept verbatim with who said them and when, since
// half the joke is usually how long ago it was.

const fs = require('fs');
const path = require('path');

const MAX_LENGTH = 500;
const FILE = process.env.QUOTES_FILE || path.join(path.dirname(process.env.COMMANDS_FILE || __dirname), 'quotes.json');

let quotes = [];
let nextId = 1;

function load() {
  try {
    quotes = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`[quotes] could not read ${FILE}: ${err.message}`);
    quotes = [];
  }
  nextId = quotes.reduce((max, quote) => Math.max(max, quote.id), 0) + 1;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(quotes, null, 2));
  } catch (err) {
    console.error(`[quotes] could not write ${FILE}: ${err.message}`);
  }
}

function add({ text, said, saidId, addedBy, messageLink }) {
  const trimmed = text.trim().slice(0, MAX_LENGTH);
  if (!trimmed) return null;

  // Saving the same line twice is nearly always a double-tap rather than a
  // second joke.
  const duplicate = quotes.find((quote) => quote.text === trimmed && quote.said === said);
  if (duplicate) return { ...duplicate, duplicate: true };

  const quote = { id: nextId++, text: trimmed, said, saidId, addedBy, messageLink, at: new Date().toISOString() };
  quotes.push(quote);
  save();
  return quote;
}

function remove(id) {
  const index = quotes.findIndex((quote) => quote.id === id);
  if (index === -1) return false;
  quotes.splice(index, 1);
  save();
  return true;
}

function byId(id) {
  return quotes.find((quote) => quote.id === id) ?? null;
}

/** Random, optionally narrowed by text or speaker. */
function random(search) {
  let pool = quotes;
  if (search) {
    const needle = search.toLowerCase();
    pool = quotes.filter(
      (quote) => quote.text.toLowerCase().includes(needle) || quote.said.toLowerCase().includes(needle)
    );
  }
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

function count() {
  return quotes.length;
}

module.exports = { load, add, remove, byId, random, count, FILE };
