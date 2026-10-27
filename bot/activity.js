// "What has tru been up to lately?"
//
// The other assistant tools are all aggregates -- leaderboards, totals, dry
// streaks -- which cannot answer an open question about a person. This is the
// narrative version: what they got, what killed them, what they moved in and
// out of shared storage, and what they are fighting right this second.

const {
  getLootData,
  getDeathData,
  getStorageLog,
  getLiveMembers,
  getWomGains,
  getBossKc,
} = require('./backendClient');

const SHARED = '@SHARED';

function daysAgo(time) {
  return (Date.now() - new Date(time).getTime()) / 86400000;
}

function gp(value) {
  if (!value) return null;
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}m`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
  return String(value);
}

/**
 * A member's last few days, or everyone's.
 *
 * Returns plain objects rather than prose: the model is better at summarising
 * structured facts than at being handed a pre-written sentence, and this way
 * it can answer "who died most" off the same payload.
 */
async function getRecentActivity(member, days = 7) {
  // People ask about "tru" and "pearl", never "trufracture" and
  // "FarmerPearly", and the model passes along whatever was typed. Spaces go
  // too, so "nash" matches "N a s h".
  const normalise = (name) => name.toLowerCase().replace(/[\s_-]/g, '');
  const wanted = member ? normalise(member) : null;
  const matches = (name) => {
    if (!wanted) return true;
    const candidate = normalise(name);
    return candidate === wanted || candidate.startsWith(wanted) || candidate.includes(wanted);
  };

  const [loot, deaths, storage, live] = await Promise.all([
    getLootData().catch(() => []),
    getDeathData().catch(() => []),
    getStorageLog().catch(() => []),
    getLiveMembers().catch(() => []),
  ]);

  const events = [];

  for (const entry of loot) {
    if (!matches(entry.name)) continue;
    for (const drop of entry.drops || []) {
      if (daysAgo(drop.time) > days) continue;
      events.push({
        when: drop.time,
        member: entry.name,
        what: 'drop',
        detail: gp(drop.gp_value) ? `${drop.item_name} (${gp(drop.gp_value)})` : drop.item_name,
      });
    }
  }

  for (const entry of deaths) {
    if (!matches(entry.name)) continue;
    for (const death of entry.deaths || []) {
      if (daysAgo(death.time) > days) continue;
      events.push({ when: death.time, member: entry.name, what: 'death', detail: 'died' });
    }
  }

  for (const entry of storage) {
    if (!matches(entry.member_name) || daysAgo(entry.time) > days) continue;
    events.push({
      when: entry.time,
      member: entry.member_name,
      what: entry.action,
      detail: `${entry.action} ${entry.quantity > 1 ? `${entry.quantity}x ` : ''}${entry.item_name} (shared storage)`,
    });
  }

  events.sort((a, b) => new Date(b.when) - new Date(a.when));

  // What they are doing this second, which is usually the most interesting
  // part of the answer and is not in any of the history tables.
  const now = [];
  for (const entry of live) {
    if (entry.name === SHARED || !matches(entry.name)) continue;
    const idleHours = entry.last_updated ? (Date.now() - new Date(entry.last_updated).getTime()) / 3600000 : null;
    now.push({
      member: entry.name,
      online: idleHours !== null && idleHours < 0.25,
      lastSeenHoursAgo: idleHours === null ? null : Number(idleHours.toFixed(1)),
      fighting: entry.interacting?.name ?? null,
      // Both of these are percentages and the model will happily attribute
      // one to the other -- it reported "tru is on the Leviathan at 57%
      // health" when 57% was the Leviathan's. The names have to say whose.
      healthOfTheThingTheyAreFighting:
        entry.interacting && entry.interacting.ratio >= 0 ? `${entry.interacting.ratio}%` : null,
      theirOwnHitpoints: entry.stats ? `${entry.stats[0]}/${entry.stats[1]}` : null,
    });
  }

  return {
    periodDays: days,
    rightNow: now,
    // Capped: a busy week can run to hundreds of rows and the model only
    // needs enough to characterise it.
    recentEvents: events.slice(0, 40),
    totalEventsInPeriod: events.length,
  };
}

module.exports = { getRecentActivity, getBossKillCounts };

// Boss KC is its own question -- "how much zulrah have I done today" -- and
// the model never connected it to a tool called get_skill_gains, whose
// payload is also every skill for every member. This answers the narrow
// question with a small payload, which matters on an 8k token/minute limit.
async function getBossKillCounts({ member, boss, period = 'Day' } = {}) {
  const normalise = (text) => text.toLowerCase().replace(/[\s_'-]/g, '');
  const wantedMember = member ? normalise(member) : null;
  const wantedBoss = boss ? normalise(boss) : null;
  const matchName = (name, wanted) => {
    if (!wanted) return true;
    const candidate = normalise(name);
    return candidate === wanted || candidate.startsWith(wanted) || candidate.includes(wanted);
  };

  const [gains, totals] = await Promise.all([
    getWomGains(period).catch(() => ({})),
    getBossKc().catch(() => ({})),
  ]);

  const rows = [];
  for (const [name, data] of Object.entries(gains)) {
    if (!matchName(name, wantedMember)) continue;

    const gained = (data?.bosses_gained ?? []).filter((entry) => matchName(entry.name, wantedBoss));
    // A boss asked about by name belongs in the answer even at zero kills --
    // "none today" is the answer, and omitting it reads as missing data.
    if (wantedBoss && gained.length === 0) {
      const everKilled = Object.keys(totals[name] ?? {}).find((key) => matchName(key, wantedBoss));
      rows.push({
        member: name,
        boss: everKilled ?? boss,
        killsThisPeriod: 0,
        totalKcEver: everKilled ? totals[name][everKilled] : null,
      });
      continue;
    }

    for (const entry of gained) {
      const totalKey = Object.keys(totals[name] ?? {}).find((key) => matchName(key, entry.name));
      rows.push({
        member: name,
        boss: entry.name,
        killsThisPeriod: entry.kills,
        totalKcEver: totalKey ? totals[name][totalKey] : null,
      });
    }
  }

  return { period, bossFilter: boss ?? null, rows };
}
