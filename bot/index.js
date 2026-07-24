require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { processLootMessage, processDeathMessage, processGroupStorageMessage } = require('./messageProcessor');
const { registerCommands } = require('./deploy-commands');
const itemData = require('./itemData');
const bankPings = require('./bankPings');
const personality = require('./personality');

const LOOT_CHANNEL_ID = process.env.LOOT_CHANNEL_ID;
const DEATH_CHANNEL_ID = process.env.DEATH_CHANNEL_ID;
const GROUP_STORAGE_CHANNEL_ID = process.env.GROUP_STORAGE_CHANNEL_ID;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
  for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
    const command = require(path.join(commandsPath, file));
    client.commands.set(command.data.name, command);
  }
}

client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag} (${client.commands.size} command(s) loaded)`);
  if (process.env.CLIENT_ID) {
    try {
      await registerCommands();
    } catch (err) {
      console.error(`[commands] Failed to register: ${err.message}`);
    }
  } else {
    console.warn('[commands] CLIENT_ID not set — skipping slash command registration');
  }

  itemData.start();
  bankPings.start(client);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`[command] /${interaction.commandName} failed: ${err.message}`);
    const reply = { content: '❌ Something went wrong running that command.', flags: 64 };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

client.on('messageCreate', async (message) => {
  // Dink posts via a Discord webhook, not a bot user account
  if (message.webhookId) {
    if (DEATH_CHANNEL_ID && message.channelId === DEATH_CHANNEL_ID) {
      await processDeathMessage(message, { roast: true });
    }

    if (LOOT_CHANNEL_ID && message.channelId === LOOT_CHANNEL_ID) {
      await processLootMessage(message);
    }

    if (GROUP_STORAGE_CHANNEL_ID && message.channelId === GROUP_STORAGE_CHANNEL_ID) {
      await processGroupStorageMessage(message);
    }
    return;
  }

  if (message.author.bot) return;
  await personality.maybeReply(message).catch((err) => console.error(`[personality] ${err.message}`));
});

client.login(process.env.DISCORD_TOKEN);
