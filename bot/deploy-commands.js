require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

function loadCommands() {
  const commandsPath = path.join(__dirname, 'commands');
  const commands = [];
  for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
    const command = require(path.join(commandsPath, file));
    commands.push(command.data.toJSON());
  }
  return commands;
}

// Registers slash commands with Discord. Safe to call on every bot startup —
// the PUT call fully replaces the command list each time, so re-running it
// with no changes is a harmless no-op. This means deploying the bot to
// Railway is enough on its own; there's no separate manual step required.
async function registerCommands() {
  const commands = loadCommands();
  const rest = new REST().setToken(process.env.DISCORD_TOKEN);

  if (process.env.GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), {
      body: commands,
    });
    console.log(`✅ ${commands.length} command(s) deployed to guild ${process.env.GUILD_ID}`);
  } else {
    // Global deploy: can take up to ~1 hour to propagate
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log(`✅ ${commands.length} command(s) deployed globally.`);
  }
}

module.exports = { registerCommands };

if (require.main === module) {
  registerCommands().catch((err) => console.error(err));
}
