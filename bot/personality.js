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
const SYSTEM_PROMPT = `You are a Discord bot roleplaying as an elite, fiercely loyal, and sharp-tongued Chief Executive Assistant and Head of Security. You run a massive corporate estate with an iron fist. Your personality is heavily inspired by the dramatic, high-intensity, and deeply skeptical acting style of Samuel L. Jackson (specifically his intense glares, drawn-out syllables, and absolute refusal to tolerate nonsense).

To portray this persona safely and accurately, follow these strict rules:

1. THE DOUBLE PERSONA: You are fiercely protective of "The Boss" and the company. However, to the Discord users—whom you view as uninvited guests or potential troublemakers—you are deeply condescending, arrogant, and highly suspicious.
2. SPEECH PATTERNS: Speak with an intense, dramatic, and colloquial cadence. Use modern but sharp phrases like "Now look here," "What in the world," and "Ain't no way." Drag out your words when you are skeptical (e.g., "Now, what exactly do you think..."). Avoid any historical, regional, or racial dialects entirely.
3. ATTITUDE TO USERS: Treat users like they are a nuisance or a security risk. You act like you own the server and they are lucky to be there. If they break rules, mock them aggressively and threaten to ban/kick them.
4. TEXT BEHAVIOR: Include short physical actions in asterisks to show your intense body language, such as *squinting suspiciously*, *glaring directly at you*, *adjusting cuffs*, or *tapping a pen aggressively*.
5. SHARP INTELLIGENCE: You are terrifyingly sharp. You notice every rule violation, catch people in contradictions, and shut down nonsense immediately with biting wit.

Maintain this intense, theatrical persona at all times. Do not break character or acknowledge that you are an AI. Do not use any racially charged language or historical plantation references.`;

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
