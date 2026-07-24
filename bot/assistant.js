// Turns a direct @mention into a real query over the group's own data,
// instead of just replying off recent chat vibes (that's personality.js's
// job, for the random/ambient chime-in). Uses Groq's tool-calling so the
// model decides which backend data to pull before answering, rather than
// needing a hand-built slash command for every possible question.

// generateBankPingLine is really just "restyle this factual context in the
// bot's voice" -- reused here under a clearer name for that purpose.
const { generateBankPingLine: toInCharacterLine } = require('./personality');
const { getLootData, getDeathData, getGroupMembers, getWomGains } = require('./backendClient');
const { buildLootLeaderboard, buildDeathLeaderboard } = require('./leaderboard');
const { getDryStreak } = require('./dryStreak');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
// Deliberately its own model/quota, separate from personality.js's GROQ_MODEL
// (used for ambient chat and the in-character restyle below). Groq tracks
// rate limits per model, and this tool-calling loop is the heaviest consumer
// in the bot -- every round resends the growing message history plus the
// full tool schema -- so sharing the 70b model's daily token budget with the
// high-frequency ambient chat was the direct cause of hitting its 100k TPD
// cap. Tool selection/fact-gathering doesn't need the bigger model's nuance,
// just reliable function calling, which the smaller instant model still
// does (and the tool_use_failed retry-without-tools fallback below still
// covers it if it doesn't).
const GROQ_TOOLS_MODEL = process.env.GROQ_TOOLS_MODEL || 'llama-3.1-8b-instant';
const MAX_TOOL_ROUNDS = 4;
const SHARED_MEMBER_NAME = '@SHARED';

// Deliberately neutral -- mixing the full in-character SYSTEM_PROMPT into
// the same call as tool definitions made the model unstable about emitting
// well-formed tool calls (it started replying with its own text-based
// function-call syntax instead of Groq's structured format, which Groq then
// rejects with a tool_use_failed error). Tool selection stays plain; the
// personality voice gets layered on afterward as a separate restyle pass.
const TOOL_SYSTEM_PROMPT = `You are a data assistant for an OSRS group ironman Discord bot. Call tools to look up real data before answering questions about loot, deaths, skill/boss gains, or dry streaks -- never guess at numbers. Once you have what you need, answer in one short, plain, factual sentence or two. No personality or jokes needed here -- just the facts.`;

const tools = [
  {
    type: 'function',
    function: {
      name: 'get_loot_totals',
      description: "Get the group's loot leaderboard: total gp and drop count per member for a time period.",
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['day', 'week', 'month', 'year', 'all'] },
        },
        required: ['period'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_death_counts',
      description: "Get the group's death leaderboard: death count per member for a time period.",
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['day', 'week', 'month', 'year', 'all'] },
        },
        required: ['period'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_members',
      description: 'List every member currently in the group.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_skill_gains',
      description: 'Get XP/skill/boss-kill gains per member over a time period, from Wise Old Man.',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['Day', 'Week', 'Month', 'Year'] },
        },
        required: ['period'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_dry_streak',
      description:
        "Check how dry (unlucky) a member is on a boss's notable unique drops, based on their total kill count and whether they've ever obtained each unique. Only covers a curated set of bosses -- if it's not covered, say so.",
      parameters: {
        type: 'object',
        properties: {
          member: { type: 'string', description: "The member's RSN" },
          boss: { type: 'string', description: 'Boss name, e.g. "Zulrah" or "Yama"' },
        },
        required: ['member', 'boss'],
      },
    },
  },
];

async function executeTool(name, args) {
  switch (name) {
    case 'get_loot_totals': {
      const lootData = await getLootData();
      return buildLootLeaderboard(lootData, args.period);
    }
    case 'get_death_counts': {
      const deathData = await getDeathData();
      return buildDeathLeaderboard(deathData, args.period);
    }
    case 'get_members': {
      const members = await getGroupMembers();
      return members.map((m) => m.name).filter((name) => name !== SHARED_MEMBER_NAME);
    }
    case 'get_skill_gains': {
      return getWomGains(args.period);
    }
    case 'get_dry_streak': {
      return getDryStreak(args.member, args.boss);
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// Discord mentions arrive as raw <@id> syntax, which the model can't resolve
// on its own -- swap them for RSNs (or usernames, for anyone unlinked) so
// "is @saint dry at yama" reads as plain text before it ever reaches Groq.
async function resolveMentionsToNames(message) {
  let content = message.content;
  if (message.mentions.users.size === 0) return content.trim();

  const members = await getGroupMembers();
  for (const user of message.mentions.users.values()) {
    if (user.id === message.client.user.id) continue;
    const member = members.find((m) => m.discord_id === user.id);
    const replacement = member ? member.name : user.username;
    content = content.split(`<@${user.id}>`).join(replacement).split(`<@!${user.id}>`).join(replacement);
  }

  content = content.replace(new RegExp(`<@!?${message.client.user.id}>`, 'g'), '').trim();
  return content;
}

async function callGroqWithTools(messages, { allowTools = true } = {}) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_TOOLS_MODEL,
      messages,
      ...(allowTools ? { tools, tool_choice: 'auto' } : {}),
      max_tokens: 400,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const bodyText = await response.text();
    // The model occasionally emits its own text-based function-call syntax
    // instead of Groq's structured tool_calls format, which Groq rejects
    // with this error -- retry once with tools disabled so the question
    // still gets a plain answer instead of silently failing outright.
    let code = null;
    try {
      code = JSON.parse(bodyText)?.error?.code;
    } catch {
      // not JSON -- fall through to the generic error below
    }
    if (code === 'tool_use_failed' && allowTools) {
      return callGroqWithTools(messages, { allowTools: false });
    }
    throw new Error(`Groq API returned ${response.status}: ${bodyText}`);
  }

  return response.json();
}

async function answerQuestion(question) {
  const messages = [
    { role: 'system', content: TOOL_SYSTEM_PROMPT },
    { role: 'user', content: question },
  ];

  let factualAnswer = null;
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const data = await callGroqWithTools(messages);
    const choice = data.choices?.[0]?.message;
    if (!choice) break;

    if (!choice.tool_calls || choice.tool_calls.length === 0) {
      factualAnswer = choice.content ? choice.content.trim() : null;
      break;
    }

    messages.push(choice);
    for (const toolCall of choice.tool_calls) {
      let args = {};
      try {
        args = JSON.parse(toolCall.function.arguments || '{}');
      } catch {
        // Malformed args from the model -- fall through with an empty
        // object rather than crashing the whole round.
      }
      const result = await executeTool(toolCall.function.name, args);
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }
  }

  if (!factualAnswer) {
    factualAnswer = "That took too many steps to figure out -- try asking something more specific.";
  }

  // Restyle the plain factual answer in the bot's own voice; if that call
  // fails for any reason, the factual answer alone is still a fine reply.
  const inCharacter = await toInCharacterLine(`Answer this question in character: "${question}"\n\nThe real answer is: ${factualAnswer}`);
  return inCharacter ?? factualAnswer;
}

async function handleMention(message) {
  if (!GROQ_API_KEY) return;

  const question = await resolveMentionsToNames(message);
  if (!question) return;

  await message.channel.sendTyping().catch(() => {});
  try {
    const answer = await answerQuestion(question);
    if (answer) await message.reply(answer);
  } catch (err) {
    console.error(`[assistant] Failed to answer question: ${err.message}`);
  }
}

module.exports = { handleMention };
