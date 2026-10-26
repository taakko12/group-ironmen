// A read-only window into the bot, so the site can show what Jumane has been
// doing without anyone opening Railway.
//
// The bot is a Discord client, not a service, so it had no HTTP surface at
// all -- which is why its command log and health were invisible to the site.
// Three routes on node:http is the whole addition; nothing here mutates
// anything, and everything but /health needs the group token.
//
// Deliberately not a log shipper for the Rust backend. Those are Railway's
// job, they are searchable there, and piping raw stderr to a browser is how
// tokens and SQL end up in a page.

const http = require('node:http');
const commandLog = require('./commandLog');
const customCommands = require('./customCommands');

const PORT = Number(process.env.PORT ?? 8080);
const GROUP_TOKEN = process.env.GROUP_TOKEN;
const startedAt = Date.now();

// Whatever the rest of the bot wants to report. Modules push their last-run
// timestamps in here rather than this file reaching into each of them.
const heartbeats = new Map();
function beat(name, detail) {
  heartbeats.set(name, { at: new Date().toISOString(), ...detail });
}

function health(client) {
  return {
    ok: true,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    discord: {
      connected: Boolean(client?.ws?.status === 0),
      // discord.js reports -1 before the first heartbeat completes.
      pingMs: client?.ws?.ping >= 0 ? Math.round(client.ws.ping) : null,
      user: client?.user?.tag ?? null,
      slashCommands: client?.commands?.size ?? 0,
    },
    config: {
      // Named, never valued: these are the settings people ask about, and
      // none of them are secrets. Tokens and keys are reported as set/unset
      // only, because this endpoint is reachable from a browser.
      personalityModel: process.env.GROQ_MODEL || 'qwen/qwen3.8-27b',
      toolsModel: process.env.GROQ_TOOLS_MODEL || 'openai/gpt-oss-20b',
      visionModel: process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b',
      groqConfigured: Boolean(process.env.GROQ_API_KEY),
      ambientChatChance: Number(process.env.PERSONALITY_TRIGGER_CHANCE ?? 0),
      deathRoastChance: Number(process.env.DEATH_ROAST_CHANCE ?? 0.3),
      commandsPersisted: Boolean(process.env.COMMANDS_FILE),
      customCommandCount: customCommands.list().length,
    },
    heartbeats: Object.fromEntries(heartbeats),
    commands: commandLog.stats(),
  };
}

function start(client) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
    const send = (status, payload) => {
      response.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      });
      response.end(JSON.stringify(payload));
    };

    try {
      if (request.method === 'OPTIONS') return send(204, {});
      // Unauthenticated on purpose so Railway's healthcheck can reach it; it
      // reports no configuration and no history.
      if (url.pathname === '/health') return send(200, { ok: true, uptimeSeconds: health(client).uptimeSeconds });

      if (!GROUP_TOKEN || request.headers.authorization !== GROUP_TOKEN) {
        return send(401, { error: 'bad or missing group token' });
      }

      if (url.pathname === '/status') return send(200, health(client));

      if (url.pathname === '/log') {
        const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), commandLog.MAX_ENTRIES);
        return send(200, { entries: commandLog.recent(limit), stats: commandLog.stats() });
      }

      return send(404, { error: 'no such route' });
    } catch (err) {
      console.error(`[http] ${err.message}`);
      send(500, { error: err.message });
    }
  });

  server.listen(PORT, () => console.log(`[http] listening on ${PORT}`));
  return server;
}

module.exports = { start, beat };
