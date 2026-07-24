// Shared, short-TTL cache over getGroupMembers() for resolving between a
// group member's RSN and their linked Discord ID. Pulled out of deathRoast.js
// (which only needed name -> discord_id) so personality.js's ambient chat
// can also do the reverse lookup (discord_id -> RSN) without every chat
// message triggering its own full /get-group-data fetch.

const { getGroupMembers } = require('./backendClient');

const MEMBERS_CACHE_MS = 5 * 60 * 1000;
let membersCache = null;
let membersCacheAt = 0;

async function getMembers() {
  if (!membersCache || Date.now() - membersCacheAt > MEMBERS_CACHE_MS) {
    membersCache = await getGroupMembers();
    membersCacheAt = Date.now();
  }
  return membersCache;
}

async function getDiscordId(memberName) {
  const members = await getMembers();
  return members.find((member) => member.name === memberName)?.discord_id ?? null;
}

async function getRsnForDiscordId(discordId) {
  const members = await getMembers();
  return members.find((member) => member.discord_id === discordId)?.name ?? null;
}

module.exports = { getDiscordId, getRsnForDiscordId };
