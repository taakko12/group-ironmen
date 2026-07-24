const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { getBankPingData } = require('../backendClient');
const { buildBankPingLeaderboard, periodLabel } = require('../leaderboard');
const { renderBankPingLeaderboard } = require('../leaderboardImage');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bank-ping-leaderboard')
    .setDescription("Show who's been pinged the most for not banking their stuff")
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

    const bankPingData = await getBankPingData();
    const rows = buildBankPingLeaderboard(bankPingData, period);
    if (rows.length === 0) {
      await interaction.editReply(`No bank pings recorded for ${periodLabel(period)}.`);
      return;
    }

    const image = await renderBankPingLeaderboard(rows, periodLabel(period));
    const attachment = new AttachmentBuilder(image, { name: 'bank-ping-leaderboard.png' });
    await interaction.editReply({ files: [attachment] });
  },
};
