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
const quotes = require('./quotes');
const watchdog = require('./watchdog');
const itemData = require('./itemData');
const { getGroupMembers } = require('./backendClient');
const { getRsnForDiscordId } = require('./memberCache');
const { renderGearPlan } = require('./gearImage');
const { AttachmentBuilder } = require('discord.js');
const { renderMarkdown, looksLikeDocument } = require('./markdownEmbed');

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

// A monster's "versions" are two unrelated things wearing one field, and the
// calculator's data does not say which is which:
//
//   phases you meet in a single kill   -- Zulrah Magma/Serpentine/Tanzanite,
//                                         Great Olm head/left claw/right claw
//   encounters you pick between        -- Vorkath Dragon Slayer II/Post-quest,
//                                         The Leviathan Quest/Post-quest/Awakened
//
// Planning switches across all of them is right for the first and wrong for
// the second: you never fight quest Vorkath and post-quest Vorkath in one
// trip, so budgeting an inventory slot for it costs a real switch.
//
// ponytail: name-matching, because the data offers no flag. The test is run
// over the whole version list rather than per version, since a monster never
// mixes the two kinds -- so one recognisable variant marker ("Post-quest")
// makes its siblings variants too, which is what classifies Vorkath's
// "Dragon Slayer II" correctly without needing to know it is a quest name.
const VARIANT_VERSION = /quest|awakened|challenge mode|entry mode|hard mode/i;

// Switch slots the planner may spend when nobody says otherwise. Enough for a
// real multi-phase setup without eating the inventory; override per call.
const DEFAULT_SWITCHES = 6;

function phasesOf(name, matches) {
  const versions = matches.filter((m) => m.name === name);
  const areVariants = versions.some((m) => VARIANT_VERSION.test(m.version ?? ''));

  // Variants are fought one at a time, so pick the encounter the group is
  // actually at: the post-quest version, not the quest fight or its awakened
  // version.
  const chosen = areVariants
    ? [versions.find((m) => /post-quest/i.test(m.version ?? '')) ?? versions[0]]
    : versions;
  return chosen.map((m) => ({ name: m.name, version: m.version }));
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
      `\`${PREFIX}addquote\` (as a reply) and \`${PREFIX}quote [search|#id]\` -- the quote book`,
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
    if (!args) return `usage: \`${PREFIX}gear <boss> [switches]\` — e.g. \`${PREFIX}gear vorkath 4\``;

    const rsn = await askerRsn(message);
    if (!rsn) return 'link your RSN on the site first (edit member -> discord id) so I know whose bank to use';

    // A trailing bare number is the switch budget: "gear zulrah 4". Bosses are
    // named with words, and the versions that carry digits ("Ocellus P1") keep
    // them glued to a letter, so a standalone number is unambiguous.
    // "mine" plans off your own bank; the default pools the group's gear,
    // because a group ironman's scythe lives wherever it dropped.
    const mineOnly = /(^|\s)mine$/i.test(args);
    const rest = args.replace(/(^|\s)mine$/i, '').trim();

    const budgetMatch = rest.match(/^(.*?)\s+(\d{1,2})$/);
    const query = (budgetMatch?.[1] ?? rest).trim();
    const budget = budgetMatch ? Number(budgetMatch[2]) : DEFAULT_SWITCHES;
    // The planner clamps at 12, so a bigger number would be silently ignored.
    if (budget > 12) return 'the planner tops out at 12 switches';

    const search = await fetch(`${DPS_URL}/monsters?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: process.env.GROUP_TOKEN },
    });
    if (!search.ok) return `the planner is not answering (${search.status})`;
    const { matches } = await search.json();
    if (!matches.length) return `no boss matches "${query}"`;

    const targets = phasesOf(matches[0].name, matches);
    const label =
      targets.length > 1
        ? `${targets[0].name} (${targets.length} phases)`
        : targets[0].version
          ? `${targets[0].name} [${targets[0].version}]`
          : targets[0].name;

    // The group's pool is roughly three times one bank, and the weapon cap is
    // not a preference but a correctness floor here: at 10, the extra weapons
    // displace good ones during ranking and a group plan scored WORSE than
    // the same person's own bank. 20 is where that stops (7.87 vs 6.93 at
    // Zulrah) and more buys nothing.
    const weapons = mineOnly ? 10 : 20;

    // That search runs about a minute on the group pool. A command that sits
    // silent that long reads as broken, so say what is happening and replace
    // it with the picture when it lands.
    const pending = await message
      .reply({
        content: `planning ${label} across ${mineOnly ? 'your bank' : "the group's gear"}…`,
        allowedMentions: { parse: [] },
      })
      .catch(() => null);

    const response = await fetch(`${DPS_URL}/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: process.env.GROUP_TOKEN },
      body: JSON.stringify({ member: rsn, targets, budget, weapons, pool: mineOnly ? 'mine' : 'group' }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const why = `planner said: ${result.error ?? response.status}`;
      if (pending) return void (await pending.edit({ content: why }));
      return why;
    }

    // Drawn rather than listed: a worn/carry word list makes you translate it
    // in your head, and the equipment panel is how the game already shows it.
    try {
      const png = await renderGearPlan(result.plan, { member: rsn, label, borrowed: result.borrowed ?? [] });
      const payload = {
        content: '',
        files: [new AttachmentBuilder(png, { name: 'gear.png' })],
        allowedMentions: { parse: [] },
      };
      if (pending) await pending.edit(payload);
      else await message.reply(payload);
      return null;
    } catch (err) {
      // Said out loud rather than only to stderr: Railway's logs scroll, and
      // a silent fall back to text is indistinguishable from the image
      // feature never having shipped -- which is exactly how this went
      // unnoticed the first time.
      console.error(`[commands] could not draw the gear plan: ${err.stack ?? err.message}`);
      const worn = Object.entries(result.plan.worn).map(([slot, item]) => `${slot}: ${item}`);
      const borrow = (result.borrowed ?? []).filter((b) => b.from.length);
      const text = [
        `**${rsn} vs ${label}** — ${result.plan.score.toFixed(2)} dps`,
        worn.join(', '),
        result.plan.carried.length ? `carry: ${result.plan.carried.map((c) => c.name).join(', ')}` : '',
        borrow.length ? `borrow: ${borrow.map((b) => `${b.name} (${b.from[0]})`).join(', ')}` : '',
        `_(could not draw the image: ${err.message})_`,
      ]
        .filter(Boolean)
        .join('\n');

      // Replace the placeholder rather than leaving it stranded above a
      // second message.
      if (pending) return void (await pending.edit({ content: text.slice(0, 1900) }));
      return text;
    }
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

  // Reply to a message with !addquote to save it; otherwise the text after
  // the command is taken as the quote.
  async addquote(args, message) {
    let text = args;
    let said = message.author.username;
    let saidId = message.author.id;
    let link = message.url;

    const replyTo = message.reference?.messageId;
    if (replyTo) {
      try {
        const target = await message.channel.messages.fetch(replyTo);
        text = args || target.content;
        said = target.author.username;
        saidId = target.author.id;
        link = target.url;
      } catch {
        return 'could not read the message you replied to';
      }
    }

    if (!text) return `reply to a message with \`${PREFIX}addquote\`, or \`${PREFIX}addquote <text>\``;

    const quote = quotes.add({ text, said, saidId, addedBy: message.author.username, messageLink: link });
    if (!quote) return 'nothing to quote there';
    if (quote.duplicate) return `already saved that one as #${quote.id}`;
    return `saved #${quote.id}: "${quote.text}" — ${quote.said}`;
  },

  async quote(args) {
    if (!quotes.count()) return `no quotes yet — reply to something with \`${PREFIX}addquote\``;

    // A bare number is ambiguous: "!quote 500" could mean quote #500 or the
    // one about 500 kc. Try the id, then fall back to searching, so a number
    // that is not an id still finds the line people meant. An explicit "#2"
    // is only ever an id, and says so when it is missing.
    const search = args.trim();
    const explicitId = /^#(\d+)$/.exec(search);
    if (explicitId) {
      const found = quotes.byId(Number(explicitId[1]));
      return found
        ? `**#${found.id}** "${found.text}" — ${found.said}, ${new Date(found.at).toLocaleDateString()}`
        : `no quote #${explicitId[1]}`;
    }

    const bareId = /^(\d+)$/.exec(search);
    const quote = (bareId && quotes.byId(Number(bareId[1]))) || quotes.random(search || undefined);
    if (!quote) return search ? `nothing matches "${search}"` : 'no quotes yet';

    const when = new Date(quote.at).toLocaleDateString();
    return `**#${quote.id}** "${quote.text}" — ${quote.said}, ${when}`;
  },

  async delquote(args, message) {
    if (!canManage(message)) return 'only someone who can manage messages here can delete a quote';
    const id = parseInt(args, 10);
    if (!Number.isInteger(id)) return `usage: \`${PREFIX}delquote <id>\``;
    return quotes.remove(id) ? `deleted #${id}` : `no quote #${id}`;
  },

  async addcom(args, message) {
    // Split the name off the first whitespace and keep the rest verbatim.
    // The old split(/\s+/) + join(' ') flattened every newline, which quietly
    // turned a structured note into one unreadable line.
    const match = args.match(/^(\S+)\s*([\s\S]*)$/);
    const name = match?.[1];
    let response = match?.[2] ?? '';

    // A Discord message caps at 2000 characters including the command itself,
    // so a note of any real length cannot be typed inline. Take it from an
    // attached file instead.
    const file = message.attachments?.find?.((a) => /\.(md|txt)$/i.test(a.name ?? ''));
    if (file) {
      const fetched = await fetch(file.url);
      if (!fetched.ok) return `could not read ${file.name} (${fetched.status})`;
      response = await fetched.text();
    }

    if (!name || !response.trim()) {
      return `usage: \`${PREFIX}addcom ${PREFIX}name response\` — or attach a .md file for a long one`;
    }
    if (builtins[customCommands.normalise(name)]) return `${name} is a built-in, pick another name`;

    const replaced = customCommands.set(name, response, message.author.username);
    const how = looksLikeDocument(response) ? ', posts as an embed' : '';
    return `${replaced ? 'updated' : 'added'} \`${PREFIX}${customCommands.normalise(name)}\`${how}`;
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

  // Take the name off the front and leave the rest exactly as typed. Splitting
  // on /\s+/ and rejoining with ' ' collapsed every newline before any command
  // could see it, so a pasted markdown note arrived as one line and its
  // headings and rules ended up mid-paragraph, rendering literally. Commands
  // that want words still split `args` themselves.
  const match = message.content.slice(PREFIX.length).match(/^(\S+)([\s\S]*)$/);
  if (!match) return false;
  const name = customCommands.normalise(match[1]);
  const args = match[2].trim();
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
    if (reply && looksLikeDocument(reply)) {
      const { embeds, overflow } = renderMarkdown(reply, { title: `${PREFIX}${name}` });
      await message.reply({
        embeds,
        // Nothing is dropped silently: what a message cannot hold comes back
        // as a file, which is also how it went in.
        files: overflow ? [new AttachmentBuilder(Buffer.from(overflow, 'utf8'), { name: `${name}.md` })] : [],
        allowedMentions: { parse: [] },
      });
    } else if (reply) {
      await message.reply({ content: reply.slice(0, 1900), allowedMentions: { parse: [] } });
    }
    commandLog.record({ ...entry, reply, ok: true, ms: Date.now() - started });
  } catch (err) {
    console.error(`[commands] ${name} failed: ${err.message}`);
    commandLog.record({ ...entry, reply: err.message, ok: false, ms: Date.now() - started });
    await message.reply(`that broke: ${err.message}`.slice(0, 1900)).catch(() => {});
  }
  return true;
}

module.exports = { handle, PREFIX, builtins };
