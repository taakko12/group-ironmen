const { SlashCommandBuilder } = require('discord.js');
const { dateToSnowflake, fetchAllMessages } = require('../dinkParser');
const { processLootMessage, processDeathMessage, processGroupStorageMessage } = require('../messageProcessor');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('scrape')
    .setDescription('Scrape channel history and import missed loot/deaths (duplicates are skipped automatically)')
    .addStringOption((opt) =>
      opt
        .setName('period')
        .setDescription('How far back to scan (default: all time)')
        .addChoices(
          { name: 'Last 24 hours', value: '1d' },
          { name: 'Last 7 days', value: '7d' },
          { name: 'Last 30 days', value: '30d' },
          { name: 'All time', value: 'all' }
        )
    ),

  async execute(interaction) {
    const period = interaction.options.getString('period') ?? 'all';
    let afterSnowflake = null;
    if (period !== 'all') {
      const days = parseInt(period, 10);
      afterSnowflake = dateToSnowflake(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
    }
    const periodLabel = period === 'all' ? 'all time' : `last ${period}`;

    await interaction.deferReply();
    await interaction.editReply(`⏳ Scraping channel history (${periodLabel})... this may take a while.`);

    let lootMessageCount = 0;
    let lootRecorded = 0;
    let deathMessageCount = 0;
    let deathRecorded = 0;
    let storageMessageCount = 0;
    let storageRecorded = 0;

    if (process.env.LOOT_CHANNEL_ID) {
      const channel = await interaction.client.channels.fetch(process.env.LOOT_CHANNEL_ID).catch(() => null);
      if (channel) {
        const messages = await fetchAllMessages(channel, afterSnowflake);
        lootMessageCount = messages.length;
        for (const message of messages) {
          if (!message.webhookId) continue;
          lootRecorded += await processLootMessage(message);
        }
      }
    }

    if (process.env.DEATH_CHANNEL_ID) {
      const channel = await interaction.client.channels.fetch(process.env.DEATH_CHANNEL_ID).catch(() => null);
      if (channel) {
        const messages = await fetchAllMessages(channel, afterSnowflake);
        deathMessageCount = messages.length;
        for (const message of messages) {
          if (!message.webhookId) continue;
          deathRecorded += await processDeathMessage(message);
        }
      }
    }

    if (process.env.GROUP_STORAGE_CHANNEL_ID) {
      const channel = await interaction.client.channels.fetch(process.env.GROUP_STORAGE_CHANNEL_ID).catch(() => null);
      if (channel) {
        const messages = await fetchAllMessages(channel, afterSnowflake);
        storageMessageCount = messages.length;
        for (const message of messages) {
          if (!message.webhookId) continue;
          storageRecorded += await processGroupStorageMessage(message);
        }
      }
    }

    await interaction.editReply(
      `✅ Scrape complete (${periodLabel}) — scanned ${lootMessageCount.toLocaleString()} loot messages (${lootRecorded} drops), ${deathMessageCount.toLocaleString()} death messages (${deathRecorded} deaths), and ${storageMessageCount.toLocaleString()} group storage messages (${storageRecorded} transactions). Duplicates are skipped automatically.`
    );
  },
};
