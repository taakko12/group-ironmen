const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { getDeathData } = require('../backendClient');
const { buildDeathLeaderboard, periodLabel } = require('../leaderboard');
const { renderDeathLeaderboard } = require('../leaderboardImage');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('death-leaderboard')
    .setDescription('Show the group death leaderboard')
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

    const deathData = await getDeathData();
    const rows = buildDeathLeaderboard(deathData, period);
    if (rows.length === 0) {
      await interaction.editReply(`No deaths recorded for ${periodLabel(period)}.`);
      return;
    }

    const image = await renderDeathLeaderboard(rows, periodLabel(period));
    const attachment = new AttachmentBuilder(image, { name: 'death-leaderboard.png' });
    await interaction.editReply({ files: [attachment] });
  },
};
