// Renders loot/death leaderboards as PNG images styled after the site's own
// look (RuneScape chat font + OSRS orange accent) so they read as "official"
// group-ironmen graphics instead of a plain Discord embed table. Item icons
// are pulled from the site's own /icons/items/{id}.webp so the artwork is
// literally the website's assets, not a redraw.

const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas');
const path = require('path');
const { getItemId, SITE_URL } = require('./itemData');

GlobalFonts.registerFromPath(path.join(__dirname, 'assets/fonts/RuneScape-Chat-07.ttf'), 'rssmall');
GlobalFonts.registerFromPath(path.join(__dirname, 'assets/fonts/RuneScape-Chat-Bold-07.ttf'), 'rsbold');

const WIDTH = 720;
const PADDING = 24;
const HEADER_HEIGHT = 84;
const ROW_HEIGHT = 78;
const MAX_ROWS = 10;

// Discord generates a downscaled thumbnail for the inline chat preview
// (the full-res image only shows once you click to expand it), and that
// downscale softens small text badly. Rendering at 2x and letting Discord's
// resizer downsample from a sharper source fixes the blurry-preview look
// without changing any of the draw calls below, which stay in 720-wide
// logical coordinates.
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
const COLOR_DIVIDER = 'rgba(255, 255, 255, 0.08)';
const RANK_COLORS = ['#ffd700', '#c0c0c0', '#e0954f'];

const iconCache = new Map();

// Long comma-grouped numbers (billions of gp) get hard to read at pixel-font
// sizes, so abbreviate the same way OSRS loot trackers conventionally do.
function formatGp(value) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

async function getItemIcon(itemName) {
  if (!itemName) return null;
  const id = getItemId(itemName);
  if (id == null) return null;
  if (iconCache.has(id)) return iconCache.get(id);

  const promise = (async () => {
    try {
      const res = await fetch(`${SITE_URL}/icons/items/${id}.webp`);
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
  ctx.fillStyle = COLOR_NAME;
  ctx.font = '18px rssmall';
  ctx.fillText(subtitle, width / 2, HEADER_HEIGHT / 2 + 18);

  ctx.strokeStyle = COLOR_BORDER;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, width - 4, height - 4);
}

function drawRowDivider(ctx, y, width) {
  ctx.strokeStyle = COLOR_DIVIDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PADDING, y);
  ctx.lineTo(width - PADDING, y);
  ctx.stroke();
}

function drawRank(ctx, rank, centerY) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = RANK_COLORS[rank - 1] ?? COLOR_NAME;
  ctx.font = '26px rsbold';
  ctx.fillText(`#${rank}`, PADDING, centerY);
}

function drawName(ctx, name, centerY) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLOR_NAME;
  ctx.font = '26px rsbold';
  ctx.fillText(name, 78, centerY);
}

function drawValue(ctx, text, centerY, width) {
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLOR_VALUE;
  ctx.font = '26px rsbold';
  ctx.fillText(text, width - PADDING, centerY);
}

function drawSubtext(ctx, icon, text, centerY) {
  let x = 78;
  if (icon) {
    ctx.drawImage(icon, x, centerY - 14, 28, 28);
    x += 36;
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLOR_SUBTEXT;
  ctx.font = '19px rssmall';
  ctx.fillText(text, x, centerY);
}

async function renderLootLeaderboard(rows, periodLabel) {
  const top = rows.slice(0, MAX_ROWS);
  const icons = await Promise.all(top.map((row) => getItemIcon(row.mostRecent?.item_name)));

  const height = HEADER_HEIGHT + top.length * ROW_HEIGHT + PADDING;
  const { canvas, ctx } = createScaledCanvas(WIDTH, height);
  drawFrame(ctx, WIDTH, height, 'LOOT LEADERBOARD', periodLabel);

  top.forEach((row, i) => {
    const y = HEADER_HEIGHT + i * ROW_HEIGHT;
    if (i > 0) drawRowDivider(ctx, y, WIDTH);
    const mainY = y + 26;
    const subY = y + 50;
    drawRank(ctx, i + 1, mainY);
    drawName(ctx, row.name, mainY);
    drawValue(ctx, `${formatGp(row.total)} gp`, mainY, WIDTH);
    const subtext = row.mostRecent ? `${row.mostRecent.item_name} (${formatGp(row.mostRecent.gp_value)} gp)` : '';
    drawSubtext(ctx, icons[i], subtext, subY);
  });

  return canvas.toBuffer('image/png');
}

async function renderDeathLeaderboard(rows, periodLabel) {
  const top = rows.slice(0, MAX_ROWS);

  const height = HEADER_HEIGHT + top.length * ROW_HEIGHT + PADDING;
  const { canvas, ctx } = createScaledCanvas(WIDTH, height);
  drawFrame(ctx, WIDTH, height, 'DEATH LEADERBOARD', periodLabel);

  top.forEach((row, i) => {
    const y = HEADER_HEIGHT + i * ROW_HEIGHT;
    if (i > 0) drawRowDivider(ctx, y, WIDTH);
    const mainY = y + 26;
    const subY = y + 50;
    drawRank(ctx, i + 1, mainY);
    drawName(ctx, row.name, mainY);
    drawValue(ctx, `${row.count} ${row.count === 1 ? 'death' : 'deaths'}`, mainY, WIDTH);
    const subtext = row.mostRecent ? `Most recent: ${new Date(row.mostRecent.time).toLocaleString()}` : '';
    drawSubtext(ctx, null, subtext, subY);
  });

  return canvas.toBuffer('image/png');
}

module.exports = { renderLootLeaderboard, renderDeathLeaderboard };
