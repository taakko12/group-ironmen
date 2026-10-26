// What Jumane was asked to do and what it said back.
//
// Nothing else records this: Railway keeps stdout for a while, but it is
// per-deploy, unsearchable by player, and gone when the container recycles.
// This is the one part of the bot's activity that is genuinely ours to keep.
//
// Bounded on purpose. A JSONL file on the mounted volume, trimmed to the last
// MAX_ENTRIES on boot, with the live window held in memory so reads never
// touch disk. It is a debugging aid for a group of five, not an audit system,
// and the ceiling is what stops it quietly eating the volume.

const fs = require('fs');
const path = require('path');

const MAX_ENTRIES = Number(process.env.COMMAND_LOG_MAX ?? 500);
const FILE = process.env.COMMAND_LOG_FILE || path.join(path.dirname(process.env.COMMANDS_FILE || __dirname), 'command-log.jsonl');

let entries = [];

function load() {
  try {
    entries = fs
      .readFileSync(FILE, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .slice(-MAX_ENTRIES);
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`[commandLog] could not read ${FILE}: ${err.message}`);
    entries = [];
  }

  // Rewrite on boot so the file can never grow past the cap, however many
  // deploys have appended to it.
  persistAll();
}

function persistAll() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, entries.map((entry) => JSON.stringify(entry)).join('\n') + (entries.length ? '\n' : ''));
  } catch (err) {
    console.error(`[commandLog] could not write ${FILE}: ${err.message}`);
  }
}

function record({ command, args, user, userId, channelId, reply, ok, ms }) {
  const entry = {
    at: new Date().toISOString(),
    command,
    args: (args || '').slice(0, 200),
    user,
    userId,
    channelId,
    // Truncated: the point is what it answered, not a transcript.
    reply: String(reply ?? '').slice(0, 300),
    ok,
    ms,
  };

  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES);

  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.appendFileSync(FILE, JSON.stringify(entry) + '\n');
  } catch (err) {
    console.error(`[commandLog] could not append: ${err.message}`);
  }

  return entry;
}

/** Most recent first, which is the order anyone reading a log wants. */
function recent(limit = 100) {
  return entries.slice(-limit).reverse();
}

function stats() {
  const counts = {};
  for (const entry of entries) counts[entry.command] = (counts[entry.command] ?? 0) + 1;
  return {
    total: entries.length,
    failures: entries.filter((entry) => !entry.ok).length,
    byCommand: Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1])),
  };
}

module.exports = { load, record, recent, stats, FILE, MAX_ENTRIES };
