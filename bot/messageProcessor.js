// Shared message-processing logic used by both the live messageCreate
// listener (index.js) and the /scrape command — same parsing + POST path
// regardless of whether the message came from a live event or channel history.

const {
  isLootEmbed,
  parseLootItems,
  parseLootImage,
  parseLootPlayer,
  parseDeathMessage,
  parseDeathImage,
} = require('./dinkParser');
const { postLootDrop, postDeath } = require('./backendClient');

async function processDeathMessage(message) {
  const memberName = parseDeathMessage(message);
  if (!memberName) return 0;

  try {
    await postDeath({
      member_name: memberName,
      image_url: parseDeathImage(message),
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

    for (const { item, gpValue } of parseLootItems(embed)) {
      try {
        await postLootDrop({
          member_name: memberName,
          item_name: item,
          gp_value: gpValue,
          image_url: imageUrl,
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

module.exports = { processDeathMessage, processLootMessage };
