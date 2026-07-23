// Shared message-processing logic used by both the live messageCreate
// listener (index.js) and the /scrape command — same parsing + POST path
// regardless of whether the message came from a live event or channel history.

const {
  isLootEmbed,
  parseLootItems,
  parseLootImage,
  parseLootScreenshot,
  parseLootPlayer,
  parseDeathMessage,
  parseDeathImage,
  isGroupStorageEmbed,
  parseGroupStorageEmbed,
} = require('./dinkParser');
const { postLootDrop, postDeath, postStorageLog } = require('./backendClient');
const { getItemId } = require('./itemData');

function messageLink(message) {
  return `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`;
}

async function processDeathMessage(message) {
  const memberName = parseDeathMessage(message);
  if (!memberName) return 0;

  try {
    await postDeath({
      member_name: memberName,
      image_url: parseDeathImage(message),
      message_link: messageLink(message),
      discord_message_id: message.id,
      time: message.createdAt.toISOString(),
    });
    console.log(`[death] Recorded death for "${memberName}"`);
    return 1;
  } catch (err) {
    console.error(`[death] Failed to record death for "${memberName}": ${err.message}`);
    return 0;
  }
}

async function processLootMessage(message) {
  let recorded = 0;
  let embedIndex = 0;
  for (const embed of message.embeds) {
    if (!isLootEmbed(embed)) continue;
    const memberName = parseLootPlayer(embed, message.content);
    if (!memberName) continue;
    const imageUrl = parseLootImage(embed);
    const screenshotUrl = parseLootScreenshot(embed, message);

    for (const { item, gpValue } of parseLootItems(embed)) {
      try {
        await postLootDrop({
          member_name: memberName,
          item_name: item,
          gp_value: gpValue,
          image_url: imageUrl,
          screenshot_url: screenshotUrl,
          message_link: messageLink(message),
          discord_message_id: message.id,
          embed_index: embedIndex,
          time: message.createdAt.toISOString(),
        });
        console.log(`[loot] Recorded ${gpValue.toLocaleString()} gp (${item}) for "${memberName}"`);
        recorded++;
      } catch (err) {
        console.error(`[loot] Failed to record drop for "${memberName}": ${err.message}`);
      }
      embedIndex++;
    }
  }
  return recorded;
}

// One message can bundle multiple deposits and withdrawals into a single
// embed, so each item gets its own entry_index within the message for
// dedup purposes (mirrors processLootMessage's embedIndex).
async function processGroupStorageMessage(message) {
  let recorded = 0;
  let entryIndex = 0;
  for (const embed of message.embeds) {
    if (!isGroupStorageEmbed(embed)) continue;
    const { player, deposits, withdrawals } = parseGroupStorageEmbed(embed);
    if (!player) continue;

    const items = [
      ...deposits.map((d) => ({ ...d, action: 'deposit' })),
      ...withdrawals.map((w) => ({ ...w, action: 'withdraw' })),
    ];

    for (const { item, quantity, gpValue, action } of items) {
      try {
        await postStorageLog({
          member_name: player,
          item_id: getItemId(item),
          item_name: item,
          quantity,
          action,
          gp_value: gpValue,
          message_link: messageLink(message),
          discord_message_id: message.id,
          entry_index: entryIndex,
          time: message.createdAt.toISOString(),
        });
        console.log(`[storage] Recorded ${action} of ${quantity} x ${item} for "${player}"`);
        recorded++;
      } catch (err) {
        console.error(`[storage] Failed to record ${action} for "${player}": ${err.message}`);
      }
      entryIndex++;
    }
  }
  return recorded;
}

module.exports = { processDeathMessage, processLootMessage, processGroupStorageMessage };
