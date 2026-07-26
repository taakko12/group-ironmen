// Announces changes to the group's "must bank" item list (tagged via the
// Items page's flag button, see must-bank-items.js on the site) as a
// RuneLite Bank Tags import string, so members can paste it in-game and get
// every required item bundled into one tag tab instead of re-tagging by hand.
//
// Format verified directly against RuneLite's current core Bank Tags plugin
// source (net.runelite.client.plugins.banktags.tabs.TabInterface,
// TAB_OP_EXPORT_TAB / importTag):
//   banktags,1,<tag name>,<icon item id>,<item id>,<item id>,...
// This is part of the default bundled client -- no Plugin Hub addon needed.
// Imported via the bank's tag-tab '+' button -> "Import tag tab", which reads
// straight from the clipboard. No "layout" section is included since grid
// position doesn't matter here, just having every item in one tab.
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { getItemName } = require('./itemData');

// Matches bankPings.js's own poll cadence -- a real push (server notifying
// the bot the instant a tag changes) would need a new HTTP endpoint on the
// bot for the server to call, which is more moving parts than this needs;
// checking this often is effectively instant for a human tagging an item.
const CHECK_INTERVAL_MS = 10 * 1000; // 10 seconds
const TAG_NAME = 'Must Bank';
// A real RuneLite export sets the tab's icon separately from its tagged
// items (they're distinct tokens) -- Coins is a fixed, always-valid icon so
// the tab's icon doesn't just become "whatever sorted first this time" and
// so that item doesn't need to be listed twice to both set the icon and get
// tagged.
const ICON_ITEM_ID = 995;
// Discord's plain-message content cap; fall back to a .txt attachment for
// unusually long lists instead of letting the send fail outright.
const MAX_INLINE_TAG_LENGTH = 1900;

let previousItemIds = null; // null until the first successful fetch

function buildBankTagString(itemIds) {
  return ['banktags', '1', TAG_NAME, String(ICON_ITEM_ID), ...itemIds.map(String)].join(',');
}

function setsEqual(a, b) {
  return a.size === b.size && [...a].every((id) => b.has(id));
}

async function checkOnce(client) {
  const channelId = process.env.MUST_BANK_ANNOUNCE_CHANNEL_ID || process.env.BANK_ALERT_CHANNEL_ID;
  if (!channelId) return;

  const response = await fetch(
    `${process.env.BACKEND_URL}/api/group/${process.env.GROUP_NAME}/must-bank-items`,
    { headers: { Authorization: process.env.GROUP_TOKEN } }
  );
  if (!response.ok) {
    console.error(`[mustBankAnnounce] must-bank-items GET returned ${response.status}`);
    return;
  }

  const itemIds = await response.json();
  const currentSet = new Set(itemIds);

  if (previousItemIds === null) {
    // First run after startup -- just record the baseline. The list didn't
    // "just change", we only just started watching it.
    previousItemIds = currentSet;
    return;
  }

  if (setsEqual(previousItemIds, currentSet)) return;

  const added = itemIds.filter((id) => !previousItemIds.has(id));
  const removed = [...previousItemIds].filter((id) => !currentSet.has(id));
  previousItemIds = currentSet;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    console.error(`[mustBankAnnounce] channel ${channelId} not found`);
    return;
  }

  if (itemIds.length === 0) {
    await channel.send('📋 The required-items (must bank) list is now empty.').catch(() => {});
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('📋 Required Items List Updated')
    .setColor(0xffa500)
    .setDescription(itemIds.map((id) => `• ${getItemName(id)}`).join('\n'))
    .addFields({
      name: 'How to import',
      value:
        "In-game: click the **+** next to your bank's tag tabs, choose **Import tag tab**, then paste the text below.",
    });

  if (added.length > 0) {
    embed.addFields({ name: 'Added', value: added.map((id) => getItemName(id)).join(', ') });
  }
  if (removed.length > 0) {
    embed.addFields({ name: 'Removed', value: removed.map((id) => getItemName(id)).join(', ') });
  }

  const tagString = buildBankTagString(itemIds);
  const messageOptions = { embeds: [embed] };
  if (tagString.length > MAX_INLINE_TAG_LENGTH) {
    embed.addFields({ name: 'Import string', value: 'Too long to inline -- see the attached file.' });
    messageOptions.files = [new AttachmentBuilder(Buffer.from(tagString, 'utf-8'), { name: 'must-bank-tag.txt' })];
  } else {
    messageOptions.content = `\`\`\`${tagString}\`\`\``;
  }

  await channel
    .send(messageOptions)
    .catch((err) => console.error(`[mustBankAnnounce] Failed to send message: ${err.message}`));
}

function start(client) {
  const run = () => checkOnce(client).catch((err) => console.error(`[mustBankAnnounce] run failed: ${err.message}`));
  run();
  setInterval(run, CHECK_INTERVAL_MS);
}

module.exports = { start };
