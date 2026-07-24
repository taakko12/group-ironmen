// Polls the backend's pending-bank-pings queue and posts a channel mention
// for each one. The backend owns all the "who's inactive holding what"
// logic (see server/src/db.rs poll_bank_pings) -- this is purely Discord I/O.

const { getItemName } = require('./itemData');
const { generateBankPingLine } = require('./personality');

const POLL_INTERVAL_MS = 10 * 1000;

async function pollOnce(client) {
  const channelId = process.env.BANK_ALERT_CHANNEL_ID;
  if (!channelId) return;

  const response = await fetch(
    `${process.env.BACKEND_URL}/api/group/${process.env.GROUP_NAME}/poll-bank-pings`,
    {
      method: 'POST',
      headers: { Authorization: process.env.GROUP_TOKEN },
    }
  );
  if (!response.ok) {
    console.error(`[bankPings] poll-bank-pings returned ${response.status}`);
    return;
  }

  const pings = await response.json();
  if (pings.length === 0) return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    console.error(`[bankPings] channel ${channelId} not found`);
    return;
  }

  for (const ping of pings) {
    if (!ping.discord_id) {
      console.warn(`[bankPings] ${ping.member_name} has no linked Discord ID, skipping item ${ping.item_id}`);
      continue;
    }
    const itemName = getItemName(ping.item_id);
    const isManual = ping.reason === 'manual';
    const context = isManual
      ? `A group member asked ${ping.member_name} to bank their ${itemName}. Write one short in-character line telling them to do it.`
      : `${ping.member_name} logged off while still holding ${itemName} instead of banking it. Write one short in-character line calling them out for it.`;
    const fallback = isManual
      ? `someone requested you bank your **${itemName}**!`
      : `you went offline holding **${itemName}** — please bank it!`;

    const line = await generateBankPingLine(context);
    const message = `${isManual ? '📢' : '⚠️'} <@${ping.discord_id}> ${line ?? fallback}`;
    await channel.send(message).catch((err) => console.error(`[bankPings] Failed to send message: ${err.message}`));
  }
}

function start(client) {
  const run = () => pollOnce(client).catch((err) => console.error(`[bankPings] poll failed: ${err.message}`));
  run();
  setInterval(run, POLL_INTERVAL_MS);
}

module.exports = { start };
