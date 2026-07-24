// Polls the backend's pending-bank-pings queue and posts one batched alert
// per member/reason to Discord. The backend owns all the "who's inactive
// holding what" logic (see server/src/db.rs poll_bank_pings) -- this is
// purely Discord I/O.
//
// Deliberately doesn't run item names through the LLM personality voice:
// that was producing messages that dropped the specific item ("great job
// screwing up something simple" with no item named), which defeats the
// point of a bank-item alert. This is plain, deterministic, and always
// names every item, backed by a canvas graphic instead of a wall of
// near-identical one-item-per-message pings.

const { AttachmentBuilder } = require('discord.js');
const { getItemName } = require('./itemData');
const { renderBankAlert } = require('./bankPingImage');

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

  // Batch by member + reason so one person's pile of unbanked items (or one
  // manual request covering several items) becomes a single message with a
  // single graphic, instead of one near-identical ping per item.
  const groups = new Map();
  for (const ping of pings) {
    if (!ping.discord_id) {
      console.warn(`[bankPings] ${ping.member_name} has no linked Discord ID, skipping item ${ping.item_id}`);
      continue;
    }
    const key = `${ping.discord_id}:${ping.reason}`;
    if (!groups.has(key)) {
      groups.set(key, {
        discordId: ping.discord_id,
        memberName: ping.member_name,
        reason: ping.reason,
        items: [],
      });
    }
    groups.get(key).items.push({ name: getItemName(ping.item_id), quantity: ping.quantity ?? 1 });
  }

  for (const group of groups.values()) {
    const isManual = group.reason === 'manual';
    const itemList = group.items
      .map((item) => (item.quantity > 1 ? `**${item.quantity.toLocaleString()} x ${item.name}**` : `**${item.name}**`))
      .join(', ');
    const text = isManual
      ? `📢 <@${group.discordId}> someone asked you to bank: ${itemList}`
      : `⚠️ <@${group.discordId}> you went offline holding: ${itemList} — go bank ${
          group.items.length === 1 ? 'it' : 'them'
        }!`;

    try {
      const image = await renderBankAlert(group.memberName, group.items, { manual: isManual });
      const attachment = new AttachmentBuilder(image, { name: 'bank-alert.png' });
      await channel.send({ content: text, files: [attachment] });
    } catch (err) {
      console.error(`[bankPings] Failed to send message: ${err.message}`);
    }
  }
}

function start(client) {
  const run = () => pollOnce(client).catch((err) => console.error(`[bankPings] poll failed: ${err.message}`));
  run();
  setInterval(run, POLL_INTERVAL_MS);
}

module.exports = { start };
