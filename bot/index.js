require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const {
  isLootEmbed,
  parseLootItems,
  parseLootImage,
  parseLootPlayer,
  parseDeathMessage,
  parseDeathImage,
} = require('./dinkParser');
const { postLootDrop, postDeath } = require('./backendClient');

const LOOT_CHANNEL_ID = process.env.LOOT_CHANNEL_ID;
const DEATH_CHANNEL_ID = process.env.DEATH_CHANNEL_ID;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  // Dink posts via a Discord webhook, not a bot user account
  if (!message.webhookId) return;

  if (DEATH_CHANNEL_ID && message.channelId === DEATH_CHANNEL_ID) {
    const memberName = parseDeathMessage(message);
    if (memberName) {
      try {
        await postDeath({
          member_name: memberName,
          image_url: parseDeathImage(message),
          discord_message_id: message.id,
        });
        console.log(`[death] Recorded death for "${memberName}"`);
      } catch (err) {
        console.error(`[death] Failed to record death for "${memberName}": ${err.message}`);
      }
    }
  }

  if (LOOT_CHANNEL_ID && message.channelId === LOOT_CHANNEL_ID) {
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
          });
          console.log(`[loot] Recorded ${gpValue.toLocaleString()} gp (${item}) for "${memberName}"`);
        } catch (err) {
          console.error(`[loot] Failed to record drop for "${memberName}": ${err.message}`);
        }
        embedIndex++;
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
