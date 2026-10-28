// Occasionally reacts to a death screenshot with an LLM-generated,
// in-character roast, then @mentions the player in the death channel.
// Uses Groq's vision-capable model (separate from personality.js's
// text-only chat model) so it can actually look at the screenshot instead
// of just reacting to "X died". Fires rarely by design (DEATH_ROAST_CHANCE)
// since this is a bit, not the bot's job, and every fire burns a vision
// model request against the free tier.

const { SYSTEM_PROMPT } = require('./personality');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
// qwen3.6-27b was decommissioned; 3.8 is its successor and still the only
// model on Groq that takes an image (input_modalities: text, image).
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b';
const ROAST_CHANCE = Number(process.env.DEATH_ROAST_CHANCE ?? 0.3);

async function generateRoast(imageUrl, memberName) {
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
              // The name has to be in the prompt. Given only "a group member
              // died", the model picks one at random off the trait list in
              // SYSTEM_PROMPT -- which is how a Saint Bosh death got roasted
              // as "I see Nash tried to remember what a rune was". The same
              // failure is noted in assistant.js for the restyle pass.
              text:
                `${memberName} just died in-game, as shown in this screenshot. ` +
                `Roast ${memberName} for it, in character, in one short line. ` +
                `Do not name or blame any other member -- ${memberName} is the one who died. ` +
                `Do not start the line with their name; it is already shown.`,
            },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
      max_tokens: 120,
      temperature: 1.0,
      // qwen3.8 is a reasoning model and defaults to spending its output
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
    const roast = await generateRoast(death.image_url, death.member_name);
    if (!roast) return;

    await message.channel.send(`**${death.member_name}** ${roast}`);
  } catch (err) {
    console.error(`[deathRoast] Failed to roast death for "${death.member_name}": ${err.message}`);
  }
}

module.exports = { maybeRoastDeath, generateRoast };
