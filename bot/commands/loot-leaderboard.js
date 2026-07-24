const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { getLootData } = require('../backendClient');
const { buildLootLeaderboard, periodLabel } = require('../leaderboard');
const { renderLootLeaderboard } = require('../leaderboardImage');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('loot-leaderboard')
    .setDescription('Show the group loot leaderboard')
    .addStringOption((opt) =>
      opt
        .setName('period')
        .setDescription('Time range (default: last 24 hours)')
        .addChoices(
          { name: 'Last 24 hours', value: 'day' },
          { name: 'Last 7 days', value: 'week' },
          { name: 'Last 30 days', value: 'month' },
          { name: 'Last year', value: 'year' },
          { name: 'All time', value: 'all' }
        )
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const period = interaction.options.getString('period') ?? 'day';

    const lootData = await getLootData();
    const rows = buildLootLeaderboard(lootData, period);
    if (rows.length === 0) {
      await interaction.editReply(`No loot recorded for ${periodLabel(period)}.`);
      return;
    }

    const image = await renderLootLeaderboard(rows, periodLabel(period));
    const attachment = new AttachmentBuilder(image, { name: 'loot-leaderboard.png' });
    await interaction.editReply({ files: [attachment] });
  },
};
