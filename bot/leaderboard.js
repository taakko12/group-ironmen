// Mirrors the period-cutoff and ranking logic used by the site's
// loot-page.js / death-page.js so /loot-leaderboard and /death-leaderboard
// show the same numbers a member would see on the website.

const PERIODS = {
  day: { label: 'Last 24 Hours', ms: 24 * 3600 * 1000 },
  week: { label: 'Last 7 Days', ms: 7 * 24 * 3600 * 1000 },
  month: { label: 'Last 30 Days', ms: 30 * 24 * 3600 * 1000 },
  year: { label: 'Last Year', ms: 365 * 24 * 3600 * 1000 },
  all: { label: 'All Time', ms: null },
};

function cutoffForPeriod(period) {
  const config = PERIODS[period] ?? PERIODS.day;
  return config.ms === null ? new Date(0) : new Date(Date.now() - config.ms);
}

function periodLabel(period) {
  return (PERIODS[period] ?? PERIODS.day).label;
}

function buildLootLeaderboard(lootData, period) {
  const cutoff = cutoffForPeriod(period);
  return lootData
    .map((member) => {
      const drops = member.drops.filter((drop) => new Date(drop.time) >= cutoff);
      const sorted = [...drops].sort((a, b) => new Date(b.time) - new Date(a.time));
      return {
        name: member.name,
        total: drops.reduce((sum, drop) => sum + drop.gp_value, 0),
        count: drops.length,
        mostRecent: sorted[0],
      };
    })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.total - a.total);
}

function buildDeathLeaderboard(deathData, period) {
  const cutoff = cutoffForPeriod(period);
  return deathData
    .map((member) => {
      const deaths = member.deaths.filter((death) => new Date(death.time) >= cutoff);
      const sorted = [...deaths].sort((a, b) => new Date(b.time) - new Date(a.time));
      return { name: member.name, count: deaths.length, mostRecent: sorted[0] };
    })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);
}

// Only counts 'offline' pings -- the bot auto-detecting someone logged off
// still holding a tagged item. 'manual' pings are a group member nagging
// someone else to bank something, which isn't really "how often did the bot
// have to call this person out for their own neglect".
function buildBankPingLeaderboard(bankPingData, period) {
  const cutoff = cutoffForPeriod(period);
  return bankPingData
    .map((member) => {
      const pings = member.pings.filter((ping) => ping.reason === 'offline' && new Date(ping.time) >= cutoff);
      const sorted = [...pings].sort((a, b) => new Date(b.time) - new Date(a.time));
      return { name: member.name, count: pings.length, mostRecent: sorted[0] };
    })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);
}

module.exports = {
  PERIODS,
  periodLabel,
  buildLootLeaderboard,
  buildDeathLeaderboard,
  buildBankPingLeaderboard,
};
