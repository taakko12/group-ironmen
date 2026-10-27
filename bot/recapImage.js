// Renders the daily recap as a PNG in the same visual language as the
// loot/death leaderboards (see leaderboardImage.js) -- RuneScape chat font,
// OSRS orange accent, and the site's own skill icons rather than a redraw --
// so the morning post reads as an official group-ironmen graphic instead of a
// Discord embed table.

const { createCanvas, loadImage } = require('@napi-rs/canvas');
require('./fonts');
const { SITE_URL } = require('./itemData');

const WIDTH = 760;
const PADDING = 24;
const HEADER_HEIGHT = 84;
const ROW_HEIGHT = 92;
// A member with nothing to report draws only a name line, so reserving the
// full row leaves an obvious dead gap under them.
const QUIET_ROW_HEIGHT = 52;
const FOOTER_HEIGHT = 34;

// Same reasoning as the leaderboards: Discord downscales the inline preview,
// which softens pixel fonts badly. Draw at 2x in 760-wide logical
// coordinates and let its resizer work from a sharper source.
const SCALE = 2;

function createScaledCanvas(width, height) {
  const canvas = createCanvas(width * SCALE, height * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  return { canvas, ctx };
}

const COLOR_BACKGROUND = '#000000';
const COLOR_BORDER = '#ff981f';
const COLOR_HEADER = '#ff981f';
const COLOR_NAME = '#ffffff';
const COLOR_VALUE = '#ffff00';
const COLOR_SUBTEXT = '#d8d8d8';
const COLOR_MUTED = '#8a8a8a';
const COLOR_DIVIDER = 'rgba(255, 255, 255, 0.08)';

// Ported from Skill.getIcon in site/src/data/skill.js -- the bot cannot import
// from site/, and these are the site's own sprites served off /ui.
const SKILL_ICONS = {
  Attack: '197-0',
  Strength: '198-0',
  Defence: '199-0',
  Ranged: '200-0',
  Prayer: '201-0',
  Magic: '202-0',
  Hitpoints: '203-0',
  Agility: '204-0',
  Herblore: '205-0',
  Thieving: '206-0',
  Crafting: '207-0',
  Fletching: '208-0',
  Mining: '209-0',
  Smithing: '210-0',
  Fishing: '211-0',
  Cooking: '212-0',
  Firemaking: '213-0',
  Woodcutting: '214-0',
  Runecraft: '215-0',
  Slayer: '216-0',
  Farming: '217-0',
  Hunter: '220-0',
  Construction: '221-0',
  Sailing: '228-0',
};

const iconCache = new Map();

// Comma-grouped XP is unreadable at pixel-font sizes, so abbreviate the way
// OSRS trackers conventionally do -- same helper shape as the leaderboards.
function formatXp(value) {
  const abs = Math.abs(value);
  if (abs >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
  if (abs >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toLocaleString();
}

// Some RSNs carry zero-width characters (a trick for a name that displays
// identically to a taken one). Discord treats them as zero-width but this
// font gives them real advance width, which shows up as odd gaps.
const ZERO_WIDTH_CHARS = /[​‌‍﻿⁠­]/g;
function sanitizeName(name) {
  return name
    .replace(ZERO_WIDTH_CHARS, '')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function getSkillIcon(skillName) {
  const id = SKILL_ICONS[skillName];
  if (!id) return null;
  if (iconCache.has(id)) return iconCache.get(id);

  const promise = (async () => {
    try {
      // fetch, not loadImage(url): SITE_URL 307-redirects and fetch follows
      // it. A failed icon returns null and the row still draws.
      const res = await fetch(`${SITE_URL}/ui/${id}.png`);
      if (!res.ok) return null;
      return await loadImage(Buffer.from(await res.arrayBuffer()));
    } catch {
      return null;
    }
  })();
  iconCache.set(id, promise);
  return promise;
}

function drawFrame(ctx, width, height, title, subtitle) {
  ctx.fillStyle = COLOR_BACKGROUND;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.fillRect(0, 0, width, HEADER_HEIGHT);

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = COLOR_HEADER;
  ctx.font = '30px rsbold';
  ctx.fillText(title, width / 2, HEADER_HEIGHT / 2 - 12);
  ctx.fillStyle = COLOR_SUBTEXT;
  ctx.font = '18px rssmall';
  ctx.fillText(subtitle, width / 2, HEADER_HEIGHT / 2 + 18);

  ctx.strokeStyle = COLOR_BORDER;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, width - 4, height - 4);
}

function drawDivider(ctx, y, width) {
  ctx.strokeStyle = COLOR_DIVIDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PADDING, y);
  ctx.lineTo(width - PADDING, y);
  ctx.stroke();
}

/** Boss kills, as text chips on the row's second line. */
function drawBosses(ctx, bosses, x, y) {
  if (!bosses.length) return;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '16px rssmall';

  let cursor = x;
  for (const boss of bosses.slice(0, 3)) {
    const label = `${boss.name} ${boss.kills}`;
    const width = ctx.measureText(label).width + 16;
    if (cursor + width > WIDTH - PADDING) break;

    ctx.fillStyle = 'rgba(255, 152, 31, 0.12)';
    ctx.fillRect(cursor, y - 11, width, 22);
    ctx.strokeStyle = 'rgba(255, 152, 31, 0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cursor + 0.5, y - 10.5, width - 1, 21);

    ctx.fillStyle = COLOR_HEADER;
    ctx.fillText(label, cursor + 8, y + 1);
    cursor += width + 8;
  }
}

function isQuiet(member) {
  return member.xpGained <= 0 && !member.bosses.length;
}

function rowHeight(member) {
  return isQuiet(member) ? QUIET_ROW_HEIGHT : ROW_HEIGHT;
}

async function drawMemberRow(ctx, member, top) {
  const nameY = isQuiet(member) ? top + QUIET_ROW_HEIGHT / 2 : top + 26;
  const skillsY = top + 58;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLOR_NAME;
  ctx.font = '24px rsbold';
  ctx.fillText(sanitizeName(member.name), PADDING, nameY);

  ctx.textAlign = 'right';
  ctx.fillStyle = member.xpGained > 0 ? COLOR_VALUE : COLOR_MUTED;
  ctx.font = '22px rsbold';
  ctx.fillText(member.xpGained > 0 ? `${formatXp(member.xpGained)} xp` : 'quiet day', WIDTH - PADDING, nameY);

  // A member with nothing still gets a row: dropping them would read as the
  // data being broken rather than as a day off.
  if (isQuiet(member)) return;

  ctx.textAlign = 'left';
  let cursor = PADDING;
  for (const skill of member.skills.slice(0, 3)) {
    const icon = await getSkillIcon(skill.name);
    if (icon) {
      ctx.drawImage(icon, cursor, skillsY - 12, 24, 24);
      cursor += 28;
    }
    ctx.fillStyle = COLOR_SUBTEXT;
    ctx.font = '17px rssmall';
    const label = formatXp(skill.xp);
    ctx.fillText(label, cursor, skillsY + 1);
    cursor += ctx.measureText(label).width + 22;
  }

  drawBosses(ctx, member.bosses, cursor, skillsY);
}

/**
 * @param members [{ name, xpGained, skills: [{name, xp}], bosses: [{name, kills}] }]
 *   already sorted by whatever order should appear.
 */
async function renderDailyRecap(members, subtitle) {
  const bodyHeight = members.reduce((sum, member) => sum + rowHeight(member), 0);
  const height = HEADER_HEIGHT + bodyHeight + FOOTER_HEIGHT;
  const { canvas, ctx } = createScaledCanvas(WIDTH, height);

  drawFrame(ctx, WIDTH, height, 'Daily Recap', subtitle);

  let y = HEADER_HEIGHT;
  for (const member of members) {
    await drawMemberRow(ctx, member, y);
    y += rowHeight(member);
    if (y < HEADER_HEIGHT + bodyHeight) drawDivider(ctx, y, WIDTH);
  }

  const total = members.reduce((sum, member) => sum + member.xpGained, 0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLOR_MUTED;
  ctx.font = '16px rssmall';
  ctx.fillText(`${formatXp(total)} xp across the group`, WIDTH / 2, height - FOOTER_HEIGHT / 2);

  return canvas.encode('png');
}

module.exports = { renderDailyRecap, formatXp, SKILL_ICONS };
