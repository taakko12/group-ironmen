// Maintains a single, always-up-to-date Discord embed for the group's "must
// bank" item list (tagged via the Items page's flag button, see
// must-bank-items.js on the site), showing a RuneLite Bank Tags import
// string so members can paste it in-game and get every required item
// bundled into one tag tab instead of re-tagging by hand.
//
// Deliberately edits one message in place rather than posting a new one on
// every change -- the channel is meant to hold a single live status embed,
// not a running log. The message to edit isn't persisted anywhere; on
// startup (or if the tracked message vanishes) it's re-found by scanning
// recent channel history for the bot's own message with a matching embed
// title, so there's nothing to keep in sync with a database.
//
// Bank tag format verified directly against RuneLite's current core Bank
// Tags plugin source (net.runelite.client.plugins.banktags.tabs.
// TabInterface, TAB_OP_EXPORT_TAB / importTag):
//   banktags,1,<tag name>,<icon item id>,<item id>,<item id>,...
// This is part of the default bundled client -- no Plugin Hub addon needed.
// Imported via the bank's tag-tab '+' button -> "Import tag tab", which reads
// straight from the clipboard. No "layout" section is included since grid
// position doesn't matter here, just having every item in one tab.
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { getItemName } = require('./itemData');

const CHECK_INTERVAL_MS = 60 * 1000; // 1 minute
const TAG_NAME = 'Must Bank';
const EMBED_TITLE = '📋 Required Items';
// A real RuneLite export sets the tab's icon separately from its tagged
// items (they're distinct tokens) -- Coins is a fixed, always-valid icon so
// the tab's icon doesn't just become "whatever sorted first this time" and
// so that item doesn't need to be listed twice to both set the icon and get
// tagged.
const ICON_ITEM_ID = 995;
// Embed description cap is 4096; fall back to a .txt attachment for
// unusually long lists instead of letting the whole embed get rejected.
const MAX_INLINE_TAG_LENGTH = 3800;
// Field value cap is 1024 -- truncate rather than risk the send failing.
const MAX_FIELD_LENGTH = 1024;

let previousItemIds = null; // null until the first successful fetch
let trackedMessageId = null; // resolved lazily, cached for the process's lifetime

function buildBankTagString(itemIds) {
  return ['banktags', '1', TAG_NAME, String(ICON_ITEM_ID), ...itemIds.map(String)].join(',');
}

function setsEqual(a, b) {
  return a.size === b.size && [...a].every((id) => b.has(id));
}

function joinTruncated(names, limit) {
  const joined = names.join(', ');
  return joined.length <= limit ? joined : `${joined.slice(0, limit - 1)}…`;
}

// Just the net change, not the whole (potentially long) list -- Added/
// Removed is enough to tell what happened at a glance. Returns { embed,
// file }, where file is only set when the tag string is too long to inline.
function buildEmbedContent(itemIds, added, removed) {
  const embed = new EmbedBuilder().setTitle(EMBED_TITLE).setColor(0xffa500);

  if (itemIds.length === 0) {
    embed.setDescription('The required items list is currently empty.');
    return { embed, file: null };
  }

  if (added.length > 0) {
    embed.addFields({ name: 'Added', value: joinTruncated(added.map(getItemName), MAX_FIELD_LENGTH) });
  }
  if (removed.length > 0) {
    embed.addFields({ name: 'Removed', value: joinTruncated(removed.map(getItemName), MAX_FIELD_LENGTH) });
  }

  const tagString = buildBankTagString(itemIds);
  const instructions = "In-game: click the **+** next to your bank's tag tabs, choose **Import tag tab**, then paste";
  if (tagString.length <= MAX_INLINE_TAG_LENGTH) {
    embed.setDescription(`${instructions} this:\n\`\`\`${tagString}\`\`\``);
    return { embed, file: null };
  }

  embed.setDescription(`${instructions} the text from the attached file.`);
  const file = new AttachmentBuilder(Buffer.from(tagString, 'utf-8'), { name: 'must-bank-tag.txt' });
  return { embed, file };
}

async function findExistingMessage(channel, botUserId) {
  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!messages) return null;
  return messages.find((m) => m.author.id === botUserId && m.embeds[0]?.title === EMBED_TITLE) ?? null;
}

// Edits the previously-tracked message if we have one (re-discovering it
// from channel history if this is a fresh process), falling back to
// sending a new message only if none exists or it's been deleted.
async function upsertMessage(client, channel, embed, file) {
  const messageOptions = { embeds: [embed], files: file ? [file] : [] };

  if (trackedMessageId === null) {
    const existing = await findExistingMessage(channel, client.user.id);
    if (existing) trackedMessageId = existing.id;
  }

  if (trackedMessageId) {
    const message = await channel.messages.fetch(trackedMessageId).catch(() => null);
    if (message) {
      // attachments:[] clears any previously-attached .txt file on edit --
      // otherwise it'd linger once the list shrinks back under the inline
      // threshold. Not meaningful (and not needed) on a fresh send below.
      await message
        .edit({ ...messageOptions, attachments: [] })
        .catch((err) => console.error(`[mustBankAnnounce] Failed to edit message: ${err.message}`));
      return;
    }
    trackedMessageId = null; // deleted or inaccessible -- fall through to send a fresh one
  }

  const sent = await channel.send(messageOptions).catch((err) => {
    console.error(`[mustBankAnnounce] Failed to send message: ${err.message}`);
    return null;
  });
  if (sent) trackedMessageId = sent.id;
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

  const { embed, file } = buildEmbedContent(itemIds, added, removed);
  await upsertMessage(client, channel, embed, file);
}

function start(client) {
  const run = () => checkOnce(client).catch((err) => console.error(`[mustBankAnnounce] run failed: ${err.message}`));
  run();
  setInterval(run, CHECK_INTERVAL_MS);
}

module.exports = { start };
