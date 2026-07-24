// Turns a direct @mention into a real query over the group's own data,
// instead of just replying off recent chat vibes (that's personality.js's
// job, for the random/ambient chime-in). Uses Groq's tool-calling so the
// model decides which backend data to pull before answering, rather than
// needing a hand-built slash command for every possible question.

const { SYSTEM_PROMPT } = require('./personality');
const { getLootData, getDeathData, getGroupMembers, getWomGains } = require('./backendClient');
const { buildLootLeaderboard, buildDeathLeaderboard } = require('./leaderboard');
const { getDryStreak } = require('./dryStreak');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const MAX_TOOL_ROUNDS = 4;
const SHARED_MEMBER_NAME = '@SHARED';

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

async function callGroqWithTools(messages) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      tools,
      tool_choice: 'auto',
      max_tokens: 400,
      temperature: 0.7,
    }),
  });
  if (!response.ok) {
    throw new Error(`Groq API returned ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function answerQuestion(question) {
  const messages = [
    {
      role: 'system',
      content: `${SYSTEM_PROMPT}\n\nYou can call tools to look up real group data before answering questions about loot, deaths, skill/boss gains, or dry streaks -- always use a tool for those instead of guessing. Once you have what you need, answer in a single short conversational reply.`,
    },
    { role: 'user', content: question },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const data = await callGroqWithTools(messages);
    const choice = data.choices?.[0]?.message;
    if (!choice) return null;

    if (!choice.tool_calls || choice.tool_calls.length === 0) {
      return choice.content ? choice.content.trim() : null;
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

  return "That took too many steps to figure out -- try asking something more specific.";
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
