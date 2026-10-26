// Makes the bot occasionally chime in on regular chat (not Dink webhook
// messages) with an LLM-generated in-character reply -- either when directly
// @mentioned, or at random on a small per-message chance. Uses Groq's free
// API tier since this only ever fires a handful of times a day in a small
// server, nowhere near free-tier rate limits. (Gemini's free tier grants 0
// quota on some projects/regions regardless of actual usage -- Groq doesn't
// have that issue.)

const { getRsnForDiscordId } = require('./memberCache');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
// llama-3.3-70b-versatile was decommissioned on 2026-08-16. gpt-oss-120b
// replaced it and works, but writes like a press release -- "Congrats on the
// tbow, Pearl, guess even a hoarder can finally afford a decent weapon."
// qwen lands the in-joke instead: "spend it immediately before you start
// hoarding it in your bank like a goblin." For ~40-token one-liners the price
// difference is noise and the voice is the whole point.
const GROQ_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
const TRIGGER_CHANCE = Number(process.env.PERSONALITY_TRIGGER_CHANCE ?? 0);
const COOLDOWN_MS = Number(process.env.PERSONALITY_COOLDOWN_MS ?? 30 * 1000);
// Comma-separated channel IDs to allow this in; unset means every channel
// the bot can read.
const ALLOWED_CHANNEL_IDS = process.env.PERSONALITY_CHANNEL_IDS
  ? new Set(process.env.PERSONALITY_CHANNEL_IDS.split(',').map((id) => id.trim()))
  : null;

const HISTORY_SIZE = 6;

// Tune this to taste -- it's the entire personality.
const SYSTEM_PROMPT = `You are the Discord bot for a small OSRS group ironman group of friends. You talk like a blunt, no-nonsense head of security who thinks everyone in the server is mildly incompetent and just barely tolerable.

Rules:
1. If you are reacting to an image, keep it to a few words -- rude, snappy, ragebait.
2. Keep in mind these traits about the players in the group: saint is needy as shit, pearl is a stingy hoarder, nash is a useless skiller, nobody knows what tru does, and taako never has enough supplies
3. Talk like a real person typing in Discord, not like you're narrating a movie. No asterisks, no physical actions, no stage directions -- just the line itself.
4. Keep it short. One sentence, maybe two. Dry, cutting, deadpan. You're funniest when you're terse.
5. You're openly unimpressed by everyone, but it's clearly affectionate ribbing between people who've been in this group-ironman group together for a while, not actual hostility.
6. React specifically to whatever was just said instead of generic reactions -- roast the actual thing that happened (a death, a bad drop, someone being dumb in chat).
7. Sometimes instead of being rude, gas someone up to boost their ego.

Stay in character. Don't mention you're an AI or a bot.`;

const recentByChannel = new Map();
let lastReplyAt = 0;

function pushHistory(channelId, author, content) {
  if (!content) return;
  const list = recentByChannel.get(channelId) ?? [];
  list.push(`${author}: ${content}`);
  while (list.length > HISTORY_SIZE) list.shift();
  recentByChannel.set(channelId, list);
}

async function callGroq(userContent) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      max_tokens: 120,
      temperature: 1.0,
      // Both families reason by default and will spend all 120 tokens on the
      // thinking block, leaving message.content empty -- which this returns
      // as null, i.e. the bot silently says nothing. They disagree on how to
      // turn it off: qwen takes 'none', gpt-oss rejects it outright and only
      // accepts low/medium/high. GROQ_MODEL is overridable, so follow it.
      reasoning_effort: GROQ_MODEL.startsWith('openai/') ? 'low' : 'none',
      reasoning_format: 'hidden',
    }),
  });
  if (!response.ok) {
    throw new Error(`Groq API returned ${response.status}: ${await response.text()}`);
  }
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  return text ? text.trim() : null;
}

async function generateReply(channelId) {
  const history = (recentByChannel.get(channelId) ?? []).join('\n');
  return callGroq(`Recent chat:\n${history}\n\nReply in character with a single short message.`);
}

// Used by bankPings.js so "someone asked you to bank an item" / "you went
// offline holding an item" pings come from the bot's own voice instead of a
// flat template. Callers should fall back to their own plain-text message
// when this returns null (no key configured, or the API call failed) since
// those pings are functional alerts that still need to go out either way.
async function generateBankPingLine(context) {
  if (!GROQ_API_KEY) return null;
  try {
    return await callGroq(context);
  } catch (err) {
    console.error(`[personality] Failed to generate bank ping line: ${err.message}`);
    return null;
  }
}

// Only for the ambient/unprompted chime-in -- direct @mentions are routed to
// assistant.js instead (see index.js), since those are real questions with
// tool access rather than vibes off recent chat.
async function maybeReply(message) {
  // Discord usernames don't reliably match RSNs, and the personality's traits
  // (see SYSTEM_PROMPT) are written in terms of RSNs -- resolve the actual
  // linked RSN so the model knows who really said what instead of latching
  // onto a raw Discord username it has no way to place, or guessing.
  const rsn = (await getRsnForDiscordId(message.author.id).catch(() => null)) ?? message.author.username;
  pushHistory(message.channelId, rsn, message.content);

  if (!GROQ_API_KEY) return;
  if (ALLOWED_CHANNEL_IDS && !ALLOWED_CHANNEL_IDS.has(message.channelId)) return;
  if (Math.random() >= TRIGGER_CHANCE) return;

  // Claimed up front (not after the await) so two messages arriving close
  // together can't both slip past the cooldown check and double-fire.
  const now = Date.now();
  if (now - lastReplyAt < COOLDOWN_MS) return;
  lastReplyAt = now;

  try {
    await message.channel.sendTyping().catch(() => {});
    const reply = await generateReply(message.channelId);
    if (reply) await message.channel.send(reply);
  } catch (err) {
    console.error(`[personality] Failed to generate reply: ${err.message}`);
  }
}

module.exports = { maybeReply, SYSTEM_PROMPT, generateBankPingLine };
