// `!remind 80m herb run`.
//
// OSRS is mostly timers -- farm runs, birdhouses, Wintertodt, raid resets --
// and a reminder that does not survive a deploy is worse than none, because
// you stop checking for yourself and then it silently is not there. So these
// live on the volume and are swept from disk, not from a timer handle.
//
// Overdue reminders fire on boot rather than being dropped: waking up to a
// late "herb run" is useful, waking up to nothing is not.

const fs = require('fs');
const path = require('path');

const SWEEP_MS = 30 * 1000;
const MAX_PER_USER = 20;
const FILE =
  process.env.REMINDERS_FILE || path.join(path.dirname(process.env.COMMANDS_FILE || __dirname), 'reminders.json');

let reminders = [];
let nextId = 1;

function load() {
  try {
    reminders = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`[reminders] could not read ${FILE}: ${err.message}`);
    reminders = [];
  }
  nextId = reminders.reduce((max, reminder) => Math.max(max, reminder.id), 0) + 1;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(reminders, null, 2));
  } catch (err) {
    console.error(`[reminders] could not write ${FILE}: ${err.message}`);
  }
}

/**
 * "90s", "80m", "2h", "1d", or a bare number meaning minutes.
 *
 * Returns null rather than guessing: a mistyped duration should say so, not
 * silently become a reminder for some other time.
 */
function parseDuration(text) {
  const match = /^(\d+(?:\.\d+)?)\s*(s|m|h|d|sec|secs|min|mins|hour|hours|day|days)?$/i.exec(text.trim());
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const unit = (match[2] || 'm').toLowerCase()[0];
  const ms = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit];
  const total = amount * ms;
  // A year is past the point where anyone means it, and keeps a typo from
  // parking an entry on the volume forever.
  return total > 365 * 86400000 ? null : total;
}

function formatDelay(ms) {
  const minutes = ms / 60000;
  // Under two minutes, seconds are what someone asked for: rounding 90s to
  // "2m" reads as the bot having misheard.
  if (minutes < 2) return `${Math.round(ms / 1000)}s`;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)}h`;
  return `${(minutes / 1440).toFixed(1)}d`;
}

function add({ userId, channelId, text, ms }) {
  const mine = reminders.filter((reminder) => reminder.userId === userId);
  if (mine.length >= MAX_PER_USER) return null;

  const reminder = {
    id: nextId++,
    userId,
    channelId,
    text: text.slice(0, 200),
    dueAt: Date.now() + ms,
    createdAt: Date.now(),
  };
  reminders.push(reminder);
  save();
  return reminder;
}

function listFor(userId) {
  return reminders.filter((reminder) => reminder.userId === userId).sort((a, b) => a.dueAt - b.dueAt);
}

function remove(id, userId) {
  const index = reminders.findIndex((reminder) => reminder.id === id && reminder.userId === userId);
  if (index === -1) return false;
  reminders.splice(index, 1);
  save();
  return true;
}

async function sweep(client) {
  const due = reminders.filter((reminder) => reminder.dueAt <= Date.now());
  if (!due.length) return;

  // Drop them first: a send that throws must not leave the entry behind to
  // fire again on the next sweep, forever.
  reminders = reminders.filter((reminder) => reminder.dueAt > Date.now());
  save();

  for (const reminder of due) {
    const late = Date.now() - reminder.dueAt;
    const lateNote = late > 5 * 60000 ? ` _(${formatDelay(late)} late -- I was restarting)_` : '';
    try {
      const channel = await client.channels.fetch(reminder.channelId);
      await channel.send({
        content: `<@${reminder.userId}> ⏰ ${reminder.text}${lateNote}`.slice(0, 1900),
        allowedMentions: { users: [reminder.userId] },
      });
    } catch (err) {
      console.error(`[reminders] could not deliver ${reminder.id}: ${err.message}`);
    }
  }
}

function start(client) {
  load();
  const run = () => sweep(client).catch((err) => console.error(`[reminders] ${err.message}`));
  run();
  setInterval(run, SWEEP_MS);
}

module.exports = { start, add, listFor, remove, parseDuration, formatDelay, count: () => reminders.length };
