// Nightbot-style !commands.
//
// The five slash commands stay as they are -- they are structured lookups and
// Discord's own UI is better at those. This exists for the one thing slash
// genuinely cannot do: commands the group defines themselves. Every slash
// command has to be registered with Discord's API, is capped per guild, and
// is rate-limited to create; `!addcom` has to be instant and unlimited, which
// only works with a prefix.

const customCommands = require('./customCommands');
const commandLog = require('./commandLog');
const reminders = require('./reminders');
const watchdog = require('./watchdog');
const itemData = require('./itemData');
const { getGroupMembers } = require('./backendClient');
const { getRsnForDiscordId } = require('./memberCache');

const PREFIX = '!';
// Per command, per channel. Enough to stop one person spamming !price in a
// loop without getting in the way of normal use.
const COOLDOWN_MS = Number(process.env.COMMAND_COOLDOWN_MS ?? 5000);
const lastUsed = new Map();

const BACKEND_URL = process.env.BACKEND_URL;
const DPS_URL = process.env.DPS_URL || 'https://dps-production.up.railway.app';

// Both of these are group-wide and change slowly, and the bank one is the
// heavy get-group-data call the Supabase egress work went after -- so they are
// cached rather than fetched per message.
const cache = new Map();
async function cached(key, ttlMs, fetcher) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await fetcher();
  cache.set(key, { at: Date.now(), value });
  return value;
}

const gePrices = () =>
  cached('ge', 10 * 60 * 1000, async () => {
    const response = await fetch(`${BACKEND_URL}/api/ge-prices`);
    if (!response.ok) throw new Error(`ge-prices returned ${response.status}`);
    return response.json();
  });

const groupBanks = () =>
  cached('banks', 60 * 1000, async () => {
    const from = '2000-01-01T00:00:00Z';
    const response = await fetch(
      `${BACKEND_URL}/api/group/${process.env.GROUP_NAME}/get-group-data` +
        `?from_time=${from}&include_heavy=true&heavy_from_time=${from}`,
      { headers: { Authorization: process.env.GROUP_TOKEN } }
    );
    if (!response.ok) throw new Error(`get-group-data returned ${response.status}`);
    return response.json();
  });

/** [id, qty, id, qty, ...] as the backend stores it. */
function itemPairs(pairs) {
  const out = [];
  for (let i = 0; pairs && i < pairs.length; i += 2) if (pairs[i] > 0) out.push([pairs[i], pairs[i + 1]]);
  return out;
}

function short(n) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}b`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// Whoever asked, resolved to an RSN when they have one linked, so `!gear`
// and friends work with no arguments.
// Discord's own permission model rather than a role name of ours: it already
// knows who is trusted in this server, and a hardcoded name would rot.
function canManage(message) {
  return Boolean(message.member?.permissions?.has?.('ManageMessages'));
}

async function askerRsn(message) {
  try {
    return await getRsnForDiscordId(message.author.id);
  } catch {
    return null;
  }
}

const builtins = {
  async commands() {
    const custom = customCommands.list();
    const lines = [`**Built in:** ${Object.keys(builtins).map((c) => PREFIX + c).join(', ')}`];
    if (custom.length) lines.push(`**Custom:** ${custom.map((c) => PREFIX + c).join(', ')}`);
    else lines.push(`No custom commands yet -- add one with \`${PREFIX}addcom ${PREFIX}name response\``);
    return lines.join('\n');
  },

  async help() {
    return [
      `\`${PREFIX}price <item>\` -- GE price`,
      `\`${PREFIX}where <item>\` -- who has one, and whether it is banked or equipped`,
      `\`${PREFIX}gear <boss>\` -- best setup from your own bank`,
      `\`${PREFIX}remind 80m herb run\` -- nags you later; \`${PREFIX}reminders\` lists them`,
      `\`${PREFIX}status\` -- is anything broken right now`,
      `\`${PREFIX}addcom ${PREFIX}name response\` -- add a custom command`,
      `Variables in custom commands: \`$(user)\` \`$(touser)\` \`$(query)\` \`$(count)\` \`$(rsn)\``,
    ].join('\n');
  },

  async price(args) {
    if (!args) return `usage: \`${PREFIX}price <item>\``;
    const item = itemData.findItem(args);
    if (!item) return `never heard of "${args}"`;

    const prices = await gePrices();
    // Variants share a name but not a price row; an uncharged copy may be the
    // canonical id while only the charged one is listed.
    const price = item.ids.map((id) => prices[String(id)]).find((value) => value !== undefined);
    if (price === undefined) return `**${item.name}** has no GE price (untradeable?)`;
    return `**${item.name}** — ${price.toLocaleString()} gp (${short(price)})`;
  },

  async where(args) {
    if (!args) return `usage: \`${PREFIX}where <item>\` — fuzzy, so \`${PREFIX}where bgs\` works`;

    const matches = itemData.searchItems(args, 5);
    if (!matches.length) return `never heard of "${args}"`;

    const item = matches[0];
    const holders = [];
    for (const member of await groupBanks()) {
      const places = [];
      let total = 0;
      // Where it is matters as much as who has it: something in the bank is
      // a trip away, something equipped is on them right now.
      for (const [label, storage] of [
        ['equipped', member.equipment],
        ['inv', member.inventory],
        ['bank', member.bank],
      ]) {
        let quantity = 0;
        // Every id sharing the name: variants are separate ids, and the one
        // in someone's bank is often not the canonical one.
        for (const [id, qty] of itemPairs(storage)) if (item.ids.includes(id)) quantity += qty;
        if (quantity > 0) {
          total += quantity;
          places.push(label === 'bank' ? `bank x${short(quantity)}` : `${label} x${short(quantity)}`);
        }
      }
      if (total > 0) {
        const who = member.name === '@SHARED' ? 'shared storage' : member.name;
        holders.push(`${who} — ${places.join(', ')}`);
      }
    }

    // Say what it matched when the query was not the name, so a fuzzy hit on
    // the wrong item is obvious rather than quietly wrong.
    const header =
      item.name.toLowerCase() === args.trim().toLowerCase()
        ? `**${item.name}**`
        : `**${item.name}** (for "${args}")`;
    const alternatives =
      matches.length > 1 && holders.length === 0
        ? `\nalso matched: ${matches.slice(1).map((m) => m.name).join(', ')}`
        : '';

    return holders.length ? `${header}\n${holders.join('\n')}` : `${header} — nobody has one${alternatives}`;
  },

  async gear(args, message) {
    if (!args) return `usage: \`${PREFIX}gear <boss>\` — e.g. \`${PREFIX}gear vorkath\``;

    const rsn = await askerRsn(message);
    if (!rsn) return 'link your RSN on the site first (edit member -> discord id) so I know whose bank to use';

    const search = await fetch(`${DPS_URL}/monsters?q=${encodeURIComponent(args)}`, {
      headers: { Authorization: process.env.GROUP_TOKEN },
    });
    if (!search.ok) return `the planner is not answering (${search.status})`;
    const { matches } = await search.json();
    if (!matches.length) return `no boss matches "${args}"`;

    const target = { name: matches[0].name, version: matches[0].version };
    const response = await fetch(`${DPS_URL}/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: process.env.GROUP_TOKEN },
      body: JSON.stringify({ member: rsn, targets: [target], budget: 2, weapons: 10 }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return `planner said: ${result.error ?? response.status}`;

    const worn = Object.entries(result.plan.worn).map(([slot, item]) => `${slot}: ${item}`);
    const label = target.version ? `${target.name} [${target.version}]` : target.name;
    return [
      `**${rsn} vs ${label}** — ${result.plan.score.toFixed(2)} dps`,
      worn.join(', '),
      result.plan.carried.length ? `carry: ${result.plan.carried.map((c) => c.name).join(', ')}` : '',
      '_levels assumed maxed; mechanics not modelled_',
    ]
      .filter(Boolean)
      .join('\n');
  },

  async remind(args, message) {
    const [duration, ...rest] = args.split(/\s+/);
    const text = rest.join(' ');
    const ms = duration ? reminders.parseDuration(duration) : null;
    if (!ms || !text) {
      return `usage: \`${PREFIX}remind 80m herb run\` — s/m/h/d, bare numbers mean minutes`;
    }

    const reminder = reminders.add({ userId: message.author.id, channelId: message.channelId, text, ms });
    if (!reminder) return 'you already have too many reminders pending';
    return `ok, in ${reminders.formatDelay(ms)}: ${text}`;
  },

  async reminders(args, message) {
    const mine = reminders.listFor(message.author.id);
    if (!mine.length) return `nothing pending — set one with \`${PREFIX}remind 80m herb run\``;
    return mine
      .map((r) => `\`#${r.id}\` in ${reminders.formatDelay(r.dueAt - Date.now())} — ${r.text}`)
      .join('\n');
  },

  async unremind(args, message) {
    const id = parseInt(args, 10);
    if (!Number.isInteger(id)) return `usage: \`${PREFIX}unremind <id>\` — see \`${PREFIX}reminders\``;
    return reminders.remove(id, message.author.id) ? `cancelled #${id}` : `you have no reminder #${id}`;
  },

  // The same checks the watchdog runs on a timer, on demand -- "is it just me
  // or is the site broken" should be answerable in the channel.
  async status() {
    const checks = await watchdog.runChecks();
    const bad = checks.filter((check) => !check.ok);
    if (!bad.length) return `:white_check_mark: all ${checks.length} checks healthy`;
    return [
      `:rotating_light: ${bad.length} of ${checks.length} checks failing`,
      ...bad.map((c) => `**${c.name}** — ${c.detail ?? 'down'}`),
    ].join('\n');
  },

  async addcom(args, message) {
    const [name, ...rest] = args.split(/\s+/);
    const response = rest.join(' ');
    if (!name || !response) return `usage: \`${PREFIX}addcom ${PREFIX}name response\``;
    if (builtins[customCommands.normalise(name)]) return `${name} is a built-in, pick another name`;

    const replaced = customCommands.set(name, response, message.author.username);
    return `${replaced ? 'updated' : 'added'} \`${PREFIX}${customCommands.normalise(name)}\``;
  },

  // Deleting is the one action nobody can undo, so it needs a role the whole
  // server does not have. Adding and editing stay open -- that is the point
  // of custom commands.
  async delcom(args, message) {
    if (!canManage(message)) return 'only someone who can manage messages here can delete a command';
    if (!args) return `usage: \`${PREFIX}delcom ${PREFIX}name\``;
    return customCommands.remove(args.split(/\s+/)[0])
      ? `deleted \`${PREFIX}${customCommands.normalise(args)}\``
      : `no such command`;
  },
};

builtins.editcom = builtins.addcom;
builtins.who = builtins.where;

/** $(user) and friends, Nightbot-style. */
async function substitute(template, { name, args, message }) {
  const rsn = template.includes('$(rsn)') ? await askerRsn(message) : null;
  return template
    .replaceAll('$(user)', message.author.username)
    .replaceAll('$(touser)', args || message.author.username)
    .replaceAll('$(query)', args)
    .replaceAll('$(count)', String(customCommands.bumpCount(name)))
    .replaceAll('$(rsn)', rsn ?? message.author.username);
}

function onCooldown(key) {
  const now = Date.now();
  if (now - (lastUsed.get(key) ?? 0) < COOLDOWN_MS) return true;
  lastUsed.set(key, now);
  return false;
}

/** Returns true if the message was a command, handled or not. */
async function handle(message) {
  if (!message.content.startsWith(PREFIX)) return false;

  const [rawName, ...rest] = message.content.slice(PREFIX.length).split(/\s+/);
  const name = customCommands.normalise(rawName);
  const args = rest.join(' ').trim();
  if (!name) return false;

  const builtin = builtins[name];
  const custom = builtin ? null : customCommands.get(name);
  // Unknown commands stay silent on purpose: people type "!" mid-sentence,
  // and a bot that corrects them every time is worse than no bot.
  if (!builtin && !custom) return false;

  if (onCooldown(`${message.channelId}:${name}`)) return true;

  const started = Date.now();
  const entry = { command: name, args, user: message.author.username, userId: message.author.id, channelId: message.channelId };

  try {
    const reply = builtin ? await builtin(args, message) : await substitute(custom.response, { name, args, message });
    if (reply) await message.reply({ content: reply.slice(0, 1900), allowedMentions: { parse: [] } });
    commandLog.record({ ...entry, reply, ok: true, ms: Date.now() - started });
  } catch (err) {
    console.error(`[commands] ${name} failed: ${err.message}`);
    commandLog.record({ ...entry, reply: err.message, ok: false, ms: Date.now() - started });
    await message.reply(`that broke: ${err.message}`.slice(0, 1900)).catch(() => {});
  }
  return true;
}

module.exports = { handle, PREFIX, builtins };
