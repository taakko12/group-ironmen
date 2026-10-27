// Notices when something stops working, and says so in Discord.
//
// Everything this checks has already failed silently at least once: the
// backend went six weeks without deploying while the gear page 404'd, Groq
// decommissioned every model the bot used and it answered nothing for two
// months, and Dink stopped posting one member's loot for eighty-four days.
// None of it was noticed by anyone looking at a dashboard -- it was all found
// by accident, weeks later.
//
// The rule that makes this useful rather than noise: only speak on a change
// of state. A watchdog that posts "everything is fine" on a schedule gets
// muted, and then it is worth nothing when it finally has something to say.

const fs = require('fs');
const path = require('path');

const INTERVAL_MS = Number(process.env.WATCHDOG_INTERVAL_MS ?? 10 * 60 * 1000);
const SLOW_INTERVAL_MS = Number(process.env.WATCHDOG_SLOW_INTERVAL_MS ?? 24 * 60 * 60 * 1000);
const CHANNEL_ID = process.env.WATCHDOG_CHANNEL_ID || process.env.MUST_BANK_ANNOUNCE_CHANNEL_ID;
const STATE_FILE =
  process.env.WATCHDOG_STATE_FILE || path.join(path.dirname(process.env.COMMANDS_FILE || __dirname), 'watchdog.json');

// A member whose tracker is live but whose last Dink loot post is older than
// this is probably not unlucky -- their plugin has stopped.
const DINK_SILENT_DAYS = Number(process.env.WATCHDOG_DINK_SILENT_DAYS ?? 30);
const TRACKER_ACTIVE_HOURS = 48;

const BACKEND_URL = process.env.BACKEND_URL;
const GROUP_NAME = process.env.GROUP_NAME;
const GROUP_TOKEN = process.env.GROUP_TOKEN;
const DPS_URL = process.env.DPS_URL || 'https://dps-production.up.railway.app';

let previous = {};

function loadState() {
  try {
    previous = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`[watchdog] could not read state: ${err.message}`);
    previous = {};
  }
}

function saveState() {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(previous, null, 2));
  } catch (err) {
    console.error(`[watchdog] could not write state: ${err.message}`);
  }
}

async function reachable(label, url, options = {}) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
    return response.ok
      ? { name: label, ok: true }
      : { name: label, ok: false, detail: `HTTP ${response.status}` };
  } catch (err) {
    return { name: label, ok: false, detail: err.name === 'TimeoutError' ? 'timed out' : err.message };
  }
}

/**
 * Every model the bot is configured to use still exists.
 *
 * Groq retires models on a schedule and the call just fails; nothing about a
 * dead model id looks different from a bad prompt from the outside, which is
 * why the bot sat mute for two months.
 */
async function checkGroqModels() {
  if (!process.env.GROQ_API_KEY) return [{ name: 'groq', ok: true, detail: 'not configured' }];

  const wanted = [
    ['personality', process.env.GROQ_MODEL || 'qwen/qwen3.8-27b'],
    ['tools', process.env.GROQ_TOOLS_MODEL || 'openai/gpt-oss-20b'],
    ['vision', process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b'],
  ];

  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return [{ name: 'groq', ok: false, detail: `models endpoint HTTP ${response.status}` }];

    const live = new Set((await response.json()).data.map((model) => model.id));
    return wanted.map(([role, id]) => ({
      name: `groq:${role}`,
      ok: live.has(id),
      detail: live.has(id) ? undefined : `${id} is no longer served`,
    }));
  } catch (err) {
    return [{ name: 'groq', ok: false, detail: err.message }];
  }
}

/** Members who are clearly playing but whose Dink has gone quiet. */
async function checkDink() {
  try {
    const headers = { Authorization: GROUP_TOKEN };
    // Twice the silence threshold, so a member right at the boundary still
    // has their last drop inside the window.
    const lootSince = new Date(Date.now() - DINK_SILENT_DAYS * 2 * 86400000).toISOString();
    const [members, loot] = await Promise.all([
      fetch(
        `${BACKEND_URL}/api/group/${GROUP_NAME}/get-group-data?from_time=2000-01-01T00:00:00Z&include_heavy=false`,
        { headers, signal: AbortSignal.timeout(25000) }
      ).then((r) => r.json()),
      // Windowed, not full history: this only reads the newest drop per
      // member, and the unwindowed response is 99.6 KB and grows forever.
      fetch(`${BACKEND_URL}/api/group/${GROUP_NAME}/get-loot-data?since=${encodeURIComponent(lootSince)}`, {
        headers,
        signal: AbortSignal.timeout(25000),
      }).then((r) => r.json()),
    ]);

    const newestDrop = new Map();
    for (const member of loot) {
      const times = (member.drops || []).map((drop) => new Date(drop.time).getTime());
      if (times.length) newestDrop.set(member.name, Math.max(...times));
    }

    const checks = [];
    for (const member of members) {
      if (member.name === '@SHARED' || !member.last_updated) continue;

      const trackerAgeHours = (Date.now() - new Date(member.last_updated).getTime()) / 3600000;
      if (trackerAgeHours > TRACKER_ACTIVE_HOURS) continue; // not playing; nothing to conclude

      const last = newestDrop.get(member.name);
      const days = last ? (Date.now() - last) / 86400000 : Infinity;
      checks.push({
        name: `dink:${member.name}`,
        ok: days <= DINK_SILENT_DAYS,
        detail: last ? `no loot posted in ${Math.round(days)} days, but the tracker is live` : 'no loot ever posted',
      });
    }
    return checks;
  } catch (err) {
    return [{ name: 'dink', ok: false, detail: `could not check: ${err.message}` }];
  }
}

/**
 * Service reachability and model ids. Cheap enough to run every few minutes.
 */
async function runFastChecks() {
  const [backend, dps, groq] = await Promise.all([
    reachable('backend', `${BACKEND_URL}/api/group/${GROUP_NAME}/am-i-logged-in`, {
      headers: { Authorization: GROUP_TOKEN },
    }),
    reachable('dps', `${DPS_URL}/health`),
    checkGroqModels(),
  ]);
  return [backend, dps, ...groq];
}

/**
 * Everything checkable, including the expensive one. Used by !status and once
 * a day by the poller.
 */
async function runChecks() {
  const [fast, dink] = await Promise.all([runFastChecks(), checkDink()]);
  return [...fast, ...dink];
}

function describe(check) {
  return check.detail ? `**${check.name}** — ${check.detail}` : `**${check.name}**`;
}

async function pollOnce(client, { includeSlow = false } = {}) {
  if (!CHANNEL_ID) return;

  const checks = includeSlow ? await runChecks() : await runFastChecks();
  const broke = [];
  const fixed = [];

  for (const check of checks) {
    const was = previous[check.name];
    // An unknown check that is healthy stays quiet: a first run should not
    // announce every green thing it has just learned about.
    if (was === undefined) {
      if (!check.ok) broke.push(check);
    } else if (was !== check.ok) {
      (check.ok ? fixed : broke).push(check);
    }
    previous[check.name] = check.ok;
  }

  // Checks can disappear (a member stops playing), and a stale entry would
  // fire a spurious "recovered" the next time they come back. Only prune what
  // this run actually looked at -- a fast run has no dink: entries, and
  // dropping them would re-alert every single day.
  if (includeSlow) {
    for (const name of Object.keys(previous)) {
      if (!checks.some((check) => check.name === name)) delete previous[name];
    }
  }
  saveState();

  if (!broke.length && !fixed.length) return;

  const lines = [];
  if (broke.length) lines.push(`:rotating_light: **Something stopped working**\n${broke.map(describe).join('\n')}`);
  if (fixed.length) lines.push(`:white_check_mark: Recovered: ${fixed.map((c) => c.name).join(', ')}`);

  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    await channel.send({ content: lines.join('\n\n').slice(0, 1900), allowedMentions: { parse: [] } });
  } catch (err) {
    console.error(`[watchdog] could not post: ${err.message}`);
  }
}

function start(client) {
  if (!CHANNEL_ID) {
    console.warn('[watchdog] WATCHDOG_CHANNEL_ID is unset -- health alerts are off');
    return;
  }
  loadState();

  // The Dink check compares against a 30-day threshold but used to run on the
  // 10-minute loop, pulling the group's whole loot history 144 times a day --
  // 15 MB of egress to answer a question that changes at most once a day.
  const run = (includeSlow) =>
    pollOnce(client, { includeSlow }).catch((err) => console.error(`[watchdog] ${err.message}`));
  run(true);
  setInterval(() => run(false), INTERVAL_MS);
  setInterval(() => run(true), SLOW_INTERVAL_MS);
}

module.exports = { start, runChecks, runFastChecks };
