// Posts one recap image a morning, at 7am Central.
//
// Dink announces events one at a time as they happen; nothing ever adds them
// up. This is the "what did the group actually do yesterday" post that
// otherwise means scrolling four channels.
//
// Scheduling is a 5-minute poll against a recorded date rather than a single
// long setTimeout, because a redeploy mid-wait would silently eat the day's
// post -- and this stack has a history of things quietly not happening. The
// same design also self-heals: if the bot is down at 07:00 it posts whenever
// it next wakes, instead of skipping the day.

const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const { renderDailyRecap } = require('./recapImage');
const { getWomGains } = require('./backendClient');

const POLL_MS = 5 * 60 * 1000;
const TIMEZONE = process.env.RECAP_TIMEZONE || 'America/Chicago';
const POST_HOUR = Number(process.env.RECAP_HOUR ?? 7);
const CHANNEL_ID = process.env.RECAP_CHANNEL_ID;
const STATE_FILE =
  process.env.RECAP_STATE_FILE || path.join(path.dirname(process.env.COMMANDS_FILE || __dirname), 'recap.json');

/**
 * The wall-clock date and hour in the configured timezone.
 *
 * Intl rather than a date library: it already knows about DST, so 7am stays
 * 7am across the March and November shifts without any arithmetic here.
 */
function localNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type) => parts.find((part) => part.type === type)?.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`[recap] could not read state: ${err.message}`);
    return {};
  }
}

function writeState(state) {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error(`[recap] could not write state: ${err.message}`);
  }
}

/** Exported so the gate can be tested without waiting for tomorrow. */
function shouldPost({ date, hour }, lastPostedDate) {
  return hour >= POST_HOUR && date !== lastPostedDate;
}

async function buildRecap() {
  const gains = await getWomGains('Day');

  const members = Object.entries(gains)
    .map(([name, data]) => ({
      name,
      xpGained: data?.xp_gained ?? 0,
      skills: (data?.skills_gained ?? []).map((skill) => ({ name: skill.name, xp: skill.xp })),
      bosses: (data?.bosses_gained ?? []).map((boss) => ({ name: boss.name, kills: boss.kills })),
    }))
    .sort((a, b) => b.xpGained - a.xpGained);

  // WOM's Day period is a rolling 24 hours, not midnight to midnight, so the
  // label says what it actually covers rather than implying a calendar day.
  return { members, png: await renderDailyRecap(members, 'last 24 hours') };
}

async function postRecap(client) {
  const { members, png } = await buildRecap();
  const channel = await client.channels.fetch(CHANNEL_ID);

  const busiest = members.find((member) => member.xpGained > 0);
  const total = members.reduce((sum, member) => sum + member.xpGained, 0);
  const content =
    total > 0
      ? `Yesterday's recap — ${busiest.name} led the way.`
      : "Yesterday's recap — nobody did anything.";

  await channel.send({
    content,
    files: [new AttachmentBuilder(png, { name: 'daily-recap.png' })],
    allowedMentions: { parse: [] },
  });
}

async function tick(client) {
  const state = readState();
  const now = localNow();
  if (!shouldPost(now, state.lastPostedDate)) return;

  // Recorded before posting, not after: a Discord failure should not leave
  // the job retrying every 5 minutes for the rest of the day.
  writeState({ ...state, lastPostedDate: now.date });

  try {
    await postRecap(client);
    console.log(`[recap] posted for ${now.date}`);
  } catch (err) {
    console.error(`[recap] failed to post: ${err.message}`);
  }
}

function start(client) {
  if (!CHANNEL_ID) {
    console.warn('[recap] RECAP_CHANNEL_ID is unset -- the daily recap is off');
    return;
  }

  // On a first run with no state, record today as already posted rather than
  // firing immediately: deploying at 2pm should not produce a surprise recap.
  const state = readState();
  if (!state.lastPostedDate) {
    const now = localNow();
    writeState({ lastPostedDate: now.hour >= POST_HOUR ? now.date : null });
  }

  const run = () => tick(client).catch((err) => console.error(`[recap] ${err.message}`));
  run();
  setInterval(run, POLL_MS);
  console.log(`[recap] scheduled for ${POST_HOUR}:00 ${TIMEZONE}`);
}

module.exports = { start, shouldPost, localNow, buildRecap, postRecap };
