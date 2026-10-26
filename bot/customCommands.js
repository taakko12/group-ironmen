// Storage for user-defined !commands.
//
// A JSON file rather than a Postgres table, deliberately: this needs no
// backend deploy, and deploys to that service are the part of this stack that
// has historically gone wrong quietly. The command layer reads through these
// four functions, so moving to Postgres later means rewriting this file and
// nothing else.
//
// Railway containers are ephemeral, so COMMANDS_FILE must point at a mounted
// volume or every custom command dies on the next deploy. If it is unset we
// still work, loudly, out of the container's own filesystem.

const fs = require('fs');
const path = require('path');

const FILE = process.env.COMMANDS_FILE || path.join(__dirname, 'commands.json');

let commands = null;

function load() {
  if (commands) return commands;
  try {
    commands = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`[commands] could not read ${FILE}: ${err.message}`);
    commands = {};
  }
  return commands;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(commands, null, 2));
  } catch (err) {
    console.error(`[commands] could not write ${FILE}: ${err.message}`);
  }
}

function normalise(name) {
  return name.replace(/^!/, '').trim().toLowerCase();
}

function get(name) {
  return load()[normalise(name)];
}

function list() {
  return Object.keys(load()).sort();
}

function set(name, response, author) {
  const key = normalise(name);
  const existing = load()[key];
  commands[key] = {
    response,
    author,
    count: existing?.count ?? 0,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  save();
  return Boolean(existing);
}

function remove(name) {
  const key = normalise(name);
  if (!load()[key]) return false;
  delete commands[key];
  save();
  return true;
}

/** $(count) is "how many times has this been used", so bump on every use. */
function bumpCount(name) {
  const key = normalise(name);
  const command = load()[key];
  if (!command) return 0;
  command.count = (command.count ?? 0) + 1;
  save();
  return command.count;
}

function warnIfEphemeral() {
  if (!process.env.COMMANDS_FILE) {
    console.warn('[commands] COMMANDS_FILE is unset -- custom commands will not survive a deploy');
  }
}

module.exports = { get, list, set, remove, bumpCount, normalise, warnIfEphemeral, FILE };
