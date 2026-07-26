const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getDryStreak } = require('../dryStreak');
const { getGroupMembers } = require('../backendClient');
const droprates = require('../data/droprates');

const SHARED_MEMBER_NAME = '@SHARED';
const MAX_AUTOCOMPLETE_CHOICES = 25;
const MAX_EMBED_FIELDS = 25;

const bossChoices = Object.values(droprates).map((boss) => boss.displayName);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dry-streak')
    .setDescription("Check how dry a member is on a boss's notable unique drops")
    .addStringOption((opt) =>
      opt.setName('member').setDescription('Group member RSN').setRequired(true).setAutocomplete(true)
    )
    .addStringOption((opt) =>
      opt.setName('boss').setDescription('Boss name').setRequired(true).setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    let choices = [];
    if (focused.name === 'member') {
      const members = await getGroupMembers().catch(() => []);
      choices = members.map((m) => m.name).filter((name) => name !== SHARED_MEMBER_NAME);
    } else if (focused.name === 'boss') {
      choices = bossChoices;
    }

    const filtered = choices
      .filter((choice) => choice.toLowerCase().includes(focused.value.toLowerCase()))
      .slice(0, MAX_AUTOCOMPLETE_CHOICES);
    await interaction.respond(filtered.map((choice) => ({ name: choice, value: choice }))).catch(() => {});
  },

  async execute(interaction) {
    await interaction.deferReply();
    const member = interaction.options.getString('member');
    const boss = interaction.options.getString('boss');

    const result = await getDryStreak(member, boss);
    if (result.error) {
      await interaction.editReply(result.error);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`${result.member} at ${result.boss}`)
      .setDescription(`${result.kc.toLocaleString()} kills`)
      .setColor(0xffa500);

    const notes = [];
    for (const item of result.items.slice(0, MAX_EMBED_FIELDS)) {
      const value = item.obtained
        ? '✅ Obtained'
        : `❌ Still dry -- ~${item.probabilityStillDryPercent}% chance of this at current KC (1/${item.rate.toLocaleString()})`;
      embed.addFields({ name: item.note ? `${item.item} *` : item.item, value });
      if (item.note) notes.push(`*${item.item}: ${item.note}`);
    }
    if (notes.length > 0) {
      embed.setFooter({ text: notes.join(' | ') });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
