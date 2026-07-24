// Makes the bot occasionally chime in on regular chat (not Dink webhook
// messages) with an LLM-generated in-character reply -- either when directly
// @mentioned, or at random on a small per-message chance. Uses Gemini's free
// API tier since this only ever fires a handful of times a day in a small
// server, nowhere near free-tier rate limits.

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const TRIGGER_CHANCE = Number(process.env.PERSONALITY_TRIGGER_CHANCE ?? 0.07);
const COOLDOWN_MS = Number(process.env.PERSONALITY_COOLDOWN_MS ?? 30 * 1000);
// Comma-separated channel IDs to allow this in; unset means every channel
// the bot can read.
const ALLOWED_CHANNEL_IDS = process.env.PERSONALITY_CHANNEL_IDS
  ? new Set(process.env.PERSONALITY_CHANNEL_IDS.split(',').map((id) => id.trim()))
  : null;

const HISTORY_SIZE = 6;

// Tune this to taste -- it's the entire personality.
const SYSTEM_PROMPT = `You are the mascot of a small OSRS group ironman clan's Discord server. \
You're witty, a little sarcastic, and clearly enjoy watching your friends grind skills and die \
to avoidable things. Keep replies short -- one or two sentences, casual chat style, no emojis \
unless it really lands, no quotation marks around the reply itself.`;

const recentByChannel = new Map();
let lastReplyAt = 0;

function pushHistory(channelId, author, content) {
  if (!content) return;
  const list = recentByChannel.get(channelId) ?? [];
  list.push(`${author}: ${content}`);
  while (list.length > HISTORY_SIZE) list.shift();
  recentByChannel.set(channelId, list);
}

async function generateReply(channelId) {
  const history = (recentByChannel.get(channelId) ?? []).join('\n');
  const prompt = `${SYSTEM_PROMPT}\n\nRecent chat:\n${history}\n\nReply in character with a single short message.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 120, temperature: 1.0 },
      }),
    }
  );
  if (!response.ok) {
    throw new Error(`Gemini API returned ${response.status}: ${await response.text()}`);
  }
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return text ? text.trim() : null;
}

async function maybeReply(message) {
  pushHistory(message.channelId, message.author.username, message.content);

  if (!GEMINI_API_KEY) return;
  if (ALLOWED_CHANNEL_IDS && !ALLOWED_CHANNEL_IDS.has(message.channelId)) return;

  const mentioned = message.mentions.has(message.client.user);
  if (!mentioned && Math.random() >= TRIGGER_CHANCE) return;

  // Claimed up front (not after the await) so two messages arriving close
  // together can't both slip past the cooldown check and double-fire.
  const now = Date.now();
  if (now - lastReplyAt < COOLDOWN_MS) return;
  lastReplyAt = now;

  try {
    await message.channel.sendTyping().catch(() => {});
    const reply = await generateReply(message.channelId);
    if (reply) await message.reply(reply);
  } catch (err) {
    console.error(`[personality] Failed to generate reply: ${err.message}`);
  }
}

module.exports = { maybeReply };
