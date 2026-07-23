// Parses Dink RuneLite plugin webhook messages (loot drops and deaths) posted
// to Discord. Ported from Torta bot's utils/dropStorage.js / index.js, which
// validated these heuristics in production against real Dink embeds.

function normalizeName(name) {
  return name.replace(/\s+/gu, ' ').trim();
}

function isLootEmbed(embed) {
  const text = `${embed.title ?? ''} ${embed.description ?? ''}`;
  return /loot|looted|received a drop|drop:/i.test(text);
}

function parseGpString(str) {
  if (!str) return null;
  const clean = str.replace(/,/g, '').trim();
  const match = clean.match(/^([\d.]+)\s*([KMBkmb])?/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  const suffix = (match[2] ?? '').toUpperCase();
  if (suffix === 'B') return Math.round(num * 1_000_000_000);
  if (suffix === 'M') return Math.round(num * 1_000_000);
  if (suffix === 'K') return Math.round(num * 1_000);
  return Math.round(num);
}

function parseLootEmbed(embed) {
  for (const field of embed.fields ?? []) {
    if (/total\s*value/i.test(field.name)) {
      const gp = parseGpString(field.value.replace(/\s*gp/i, '').trim());
      if (gp != null) return gp;
    }
  }
  const desc = embed.description ?? '';
  const allMatches = [...desc.matchAll(/\(([\d.,]+[KMBkmb]?)\)/g)];
  if (allMatches.length > 0) {
    const values = allMatches.map((m) => parseGpString(m[1]) ?? 0);
    return Math.max(...values);
  }
  const gpMatch = desc.match(/([\d.,]+[KMBkmb]?)\s*gp/i);
  if (gpMatch) return parseGpString(gpMatch[1]);
  return null;
}

function parseLootItem(embed) {
  const desc = embed.description ?? '';

  // Best source: "N x Item Name (value)" line in description (Dink format)
  const itemMatch = desc.match(/\d+\s*x\s+(.+?)\s*\(/);
  if (itemMatch) {
    const raw = itemMatch[1].trim();
    return raw.startsWith('[') ? raw.replace(/^\[([^\]]+)\].*$/, '$1') : raw;
  }

  const title = embed.title ?? '';
  if (title) {
    const stripped = title.replace(/^(valuable\s+drop|loot\s+drop|loot|drop)\s*:?\s*/i, '').trim();
    if (stripped && !/^(drop|loot)$/i.test(stripped)) return stripped;
  }

  const firstLine = desc.split('\n')[0];
  return firstLine.replace(/\([\d.,]+[KMBkmb]?\)/g, '').replace(/has looted/i, '').trim() || 'Unknown item';
}

// Parses every "N x Item Name (value)" line from a Dink embed description
// (multi-item drops are bundled into one embed). Falls back to single-item
// parsing for embeds that don't use the line format.
function parseLootItems(embed) {
  const desc = embed.description ?? '';
  const items = [];

  for (const line of desc.split('\n')) {
    const m = line.trim().match(/^(\d+)\s*x\s+(.+)\s+\(([\d.,]+[KMBkmb]?)\)$/);
    if (!m) continue;
    const value = parseGpString(m[3]);
    // Dink hyperlinks item names as [Item Name](url); extract just the bracket text.
    const raw = m[2].trim();
    const itemText = raw.startsWith('[') ? raw.replace(/^\[([^\]]+)\].*$/, '$1') : raw;
    if (value != null && value > 0) items.push({ item: itemText, gpValue: value });
  }

  if (items.length > 0) return items;

  const gpValue = parseLootEmbed(embed);
  const item = parseLootItem(embed);
  if (gpValue && gpValue > 0) return [{ item, gpValue }];
  return [];
}

function parseLootImage(embed) {
  return embed.thumbnail?.url ?? null; // OSRS wiki item sprite
}

function parseLootPlayer(embed, content) {
  if (embed) {
    const authorName = embed.author?.name ?? '';
    if (authorName) return normalizeName(authorName);
    const desc = embed.description ?? '';
    const descMatch = desc.match(/^(.+?)\s+has looted/i);
    if (descMatch) return normalizeName(descMatch[1]);
  }
  if (content) {
    const match = content.match(/^(.+?)\s+has looted/i);
    if (match) return normalizeName(match[1]);
  }
  return null;
}

function parseDeathImage(message) {
  // Dink sends the screenshot as an embed image/thumbnail or a message attachment
  for (const embed of message.embeds ?? []) {
    if (embed.image?.url) return embed.image.url;
    if (embed.thumbnail?.url) return embed.thumbnail.url;
  }
  return message.attachments?.first()?.url ?? null;
}

function parseDeathMessage(message) {
  if (message.embeds.length > 0) {
    for (const embed of message.embeds) {
      const title = embed.title ?? '';
      const desc = embed.description ?? '';
      const authorName = embed.author?.name ?? '';

      const isDeathEmbed =
        /death/i.test(title) || /has died/i.test(desc) || /has just been pked/i.test(desc);

      if (isDeathEmbed) {
        const match = desc.match(/^(.+?) has (?:died|just been pked)/i);
        if (match) return normalizeName(match[1]);
        if (authorName) return normalizeName(authorName);
        break;
      }
    }
  }

  if (message.content) {
    const match = message.content.match(/^(.+?) has (?:died|just been pked)/i);
    if (match) return normalizeName(match[1]);
  }

  return null;
}

module.exports = {
  isLootEmbed,
  parseLootItems,
  parseLootImage,
  parseLootPlayer,
  parseDeathMessage,
  parseDeathImage,
};
