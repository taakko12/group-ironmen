// Occasionally reacts to a death screenshot with an LLM-generated,
// in-character roast, then @mentions the player in the death channel.
// Uses Groq's vision-capable model (separate from personality.js's
// text-only chat model) so it can actually look at the screenshot instead
// of just reacting to "X died". Fires rarely by design (DEATH_ROAST_CHANCE)
// since this is a bit, not the bot's job, and every fire burns a vision
// model request against the free tier.

const { SYSTEM_PROMPT } = require('./personality');
const { getGroupMembers } = require('./backendClient');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b';
const ROAST_CHANCE = Number(process.env.DEATH_ROAST_CHANCE ?? 0.3);

const MEMBERS_CACHE_MS = 5 * 60 * 1000;
let membersCache = null;
let membersCacheAt = 0;

async function getDiscordId(memberName) {
  if (!membersCache || Date.now() - membersCacheAt > MEMBERS_CACHE_MS) {
    membersCache = await getGroupMembers();
    membersCacheAt = Date.now();
  }
  return membersCache.find((member) => member.name === memberName)?.discord_id ?? null;
}

async function generateRoast(imageUrl) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_VISION_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'This screenshot shows a group member who just died in-game. Roast them for it, in character, in one short line.',
            },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
      max_tokens: 120,
      temperature: 1.0,
      // qwen3.6 is a reasoning model and defaults to spending its output
      // budget on a <think> block instead of the actual line -- turn
      // thinking off entirely, and hide/strip any reasoning that slips
      // through anyway so message.content is just the roast.
      reasoning_effort: 'none',
      reasoning_format: 'hidden',
    }),
  });
  if (!response.ok) {
    throw new Error(`Groq vision API returned ${response.status}: ${await response.text()}`);
  }
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  return text ? text.trim() : null;
}

async function maybeRoastDeath(message, death) {
  if (!GROQ_API_KEY) return;
  if (!death.image_url) return;
  if (Math.random() >= ROAST_CHANCE) return;

  try {
    const [roast, discordId] = await Promise.all([
      generateRoast(death.image_url),
      getDiscordId(death.member_name).catch(() => null),
    ]);
    if (!roast) return;

    const who = discordId ? `<@${discordId}>` : `**${death.member_name}**`;
    await message.channel.send(`${who} ${roast}`);
  } catch (err) {
    console.error(`[deathRoast] Failed to roast death for "${death.member_name}": ${err.message}`);
  }
}

module.exports = { maybeRoastDeath };
