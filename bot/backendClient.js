// Thin client for the group-ironmen Rust backend, authenticating the same
// way the site/plugin do: a shared per-group token in the Authorization
// header (raw token, no "Bearer" prefix).

const BACKEND_URL = process.env.BACKEND_URL;
const GROUP_NAME = process.env.GROUP_NAME;
const GROUP_TOKEN = process.env.GROUP_TOKEN;

async function post(path, body) {
  const response = await fetch(`${BACKEND_URL}/api/group/${GROUP_NAME}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: GROUP_TOKEN,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${await response.text()}`);
  }
}

async function get(path) {
  const response = await fetch(`${BACKEND_URL}/api/group/${GROUP_NAME}${path}`, {
    headers: { Authorization: GROUP_TOKEN },
  });
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

function postLootDrop(drop) {
  return post('/loot-drop', drop);
}

function postDeath(death) {
  return post('/death', death);
}

function getLootData() {
  return get('/get-loot-data');
}

function getDeathData() {
  return get('/get-death-data');
}

function getBankPingData() {
  return get('/get-bank-ping-data');
}

// name/discord_id/color are returned unconditionally regardless of from_time
// (only the stat/inventory/etc columns are gated by it), and every caller of
// this -- memberCache, dryStreak, assistant, /dry-streak autocomplete -- reads
// nothing but those. So from_time is *now*, not the epoch: every gated column
// then fails its `>= from_time` check and comes back as a 4-byte NULL instead
// of the member's real skills/quests/inventory/equipment blob, which no caller
// was ever going to look at. include_heavy=false already skipped
// bank/potion_storage; this drops the rest of the dead payload.
function getGroupMembers() {
  const from_time = encodeURIComponent(new Date().toISOString());
  return get(`/get-group-data?from_time=${from_time}&include_heavy=false`);
}

// { member_name: { wom_boss_key: absolute_kill_count } } for every member,
// used for dry-streak math -- this is absolute KC, not a delta over a period
// like getWomGains would be if we had one.
function getBossKc() {
  return get('/wom-boss-kc');
}

// period must be one of the backend's SkillDataPeriod enum variant names
// exactly as spelled ("Day" | "Week" | "Month" | "Year") -- serde's default
// derive is case-sensitive on the Rust identifier, not lowercase.
function getWomGains(period) {
  return get(`/wom-gains?period=${encodeURIComponent(period)}`);
}

module.exports = {
  postLootDrop,
  postDeath,
  getLootData,
  getDeathData,
  getBankPingData,
  getGroupMembers,
  getBossKc,
  getWomGains,
};
