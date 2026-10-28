// Draws a DPS plan the way the game shows gear: an inventory grid of what to
// carry beside an equipment panel of what to wear.
//
// A worn/carry word list makes you translate it in your head. This is the
// same slot geometry the site's player-equipment panel uses, with the site's
// own item icons, so a plan reads as a setup rather than as a table.

const { createCanvas, loadImage } = require('@napi-rs/canvas');
require('./fonts');
const { SITE_URL } = require('./itemData');

const PADDING = 20;
const HEADER_HEIGHT = 74;
const CELL = 36;
const INV_COLS = 4;
const INV_ROWS = 7;
const INV_GAP = 4;
const INV_WIDTH = INV_COLS * CELL + (INV_COLS - 1) * INV_GAP;
const INV_HEIGHT = INV_ROWS * CELL + (INV_ROWS - 1) * INV_GAP;
const EQUIP_WIDTH = 175;
const EQUIP_HEIGHT = 200;
const COLUMN_GAP = 46;
const WIDTH = PADDING * 2 + INV_WIDTH + COLUMN_GAP + EQUIP_WIDTH;

// Same reasoning as the other renderers: Discord downscales the inline
// preview and softens pixel fonts, so draw at 2x.
const SCALE = 2;

const COLOR_BACKGROUND = '#000000';
const COLOR_BORDER = '#ff981f';
const COLOR_HEADER = '#ff981f';
const COLOR_NAME = '#ffffff';
const COLOR_VALUE = '#ffff00';
const COLOR_SUBTEXT = '#d8d8d8';
const COLOR_MUTED = '#8a8a8a';
const COLOR_SLOT = 'rgba(255, 255, 255, 0.05)';
const COLOR_SLOT_EDGE = 'rgba(255, 255, 255, 0.10)';

// Lifted from site/src/player-equipment/player-equipment.css so the panel sits
// exactly where the website draws it.
const EQUIP_SLOTS = {
  head: [70, 0],
  cape: [29, 39],
  neck: [70, 39],
  ammo: [111, 39],
  weapon: [14, 78],
  body: [70, 78],
  shield: [126, 78],
  legs: [70, 120],
  hands: [14, 162],
  feet: [70, 162],
  ring: [126, 162],
};

const iconCache = new Map();

async function getItemIcon(itemId) {
  if (itemId == null) return null;
  if (iconCache.has(itemId)) return iconCache.get(itemId);

  const promise = (async () => {
    try {
      // fetch then decode: SITE_URL 307-redirects and loadImage(url) would
      // not follow it. A missing icon returns null and the slot still draws.
      const res = await fetch(`${SITE_URL}/icons/items/${itemId}.webp`);
      if (!res.ok) return null;
      return await loadImage(Buffer.from(await res.arrayBuffer()));
    } catch {
      return null;
    }
  })();
  iconCache.set(itemId, promise);
  return promise;
}

function drawCell(ctx, x, y) {
  ctx.fillStyle = COLOR_SLOT;
  ctx.fillRect(x, y, CELL, CELL);
  ctx.strokeStyle = COLOR_SLOT_EDGE;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
}

function drawIcon(ctx, icon, x, y) {
  if (!icon) return;
  // Item sprites are not square; fit them inside the cell rather than
  // stretching, which is what makes a longbow look like a club.
  const scale = Math.min((CELL - 4) / icon.width, (CELL - 4) / icon.height, 1);
  const w = icon.width * scale;
  const h = icon.height * scale;
  ctx.drawImage(icon, x + (CELL - w) / 2, y + (CELL - h) / 2, w, h);
}

function drawLabel(ctx, text, x, y) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLOR_MUTED;
  ctx.font = '15px rssmall';
  ctx.fillText(text, x, y);
}

async function drawInventory(ctx, carried, left, top) {
  drawLabel(ctx, `CARRY — ${carried.length} slot${carried.length === 1 ? '' : 's'}`, left, top - 12);

  for (let index = 0; index < INV_COLS * INV_ROWS; index += 1) {
    const x = left + (index % INV_COLS) * (CELL + INV_GAP);
    const y = top + Math.floor(index / INV_COLS) * (CELL + INV_GAP);
    drawCell(ctx, x, y);

    const item = carried[index];
    if (item) drawIcon(ctx, await getItemIcon(item.itemId), x, y);
  }

  // The empty cells are the point: they are the food and brews the switches
  // are competing with, so the grid is always drawn full size.
}

async function drawEquipment(ctx, wornIds, left, top) {
  drawLabel(ctx, 'WEAR', left, top - 12);

  for (const [slot, [dx, dy]] of Object.entries(EQUIP_SLOTS)) {
    const x = left + dx;
    const y = top + dy;
    drawCell(ctx, x, y);
    const itemId = wornIds[slot];
    if (itemId != null) drawIcon(ctx, await getItemIcon(itemId), x, y);
  }
}

function drawHeader(ctx, width, height, title, subtitle) {
  ctx.fillStyle = COLOR_BACKGROUND;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.fillRect(0, 0, width, HEADER_HEIGHT);

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = COLOR_HEADER;
  ctx.font = '22px rsbold';
  ctx.fillText(title, width / 2, HEADER_HEIGHT / 2 - 11);
  ctx.fillStyle = COLOR_VALUE;
  ctx.font = '17px rsbold';
  ctx.fillText(subtitle, width / 2, HEADER_HEIGHT / 2 + 14);

  ctx.strokeStyle = COLOR_BORDER;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, width - 4, height - 4);
}

function drawPerFight(ctx, perMonster, top) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  let y = top;
  for (const fight of perMonster.slice(0, 6)) {
    ctx.fillStyle = COLOR_SUBTEXT;
    ctx.font = '15px rssmall';
    ctx.fillText(fight.monster, PADDING, y);

    ctx.textAlign = 'right';
    ctx.fillStyle = COLOR_VALUE;
    ctx.fillText(`${fight.dps.toFixed(2)} dps`, WIDTH - PADDING, y);
    ctx.textAlign = 'left';
    y += 19;
  }
  return y;
}

/**
 * @param plan the `plan` object from the dps service's /plan response
 * @param meta { member, label } who this is for and what they are fighting
 */
async function renderGearPlan(plan, { member, label }) {
  const panelTop = HEADER_HEIGHT + 30;
  const panelsHeight = Math.max(INV_HEIGHT, EQUIP_HEIGHT);
  const fightsHeight = Math.min(plan.perMonster.length, 6) * 19 + 14;
  const height = panelTop + panelsHeight + 18 + fightsHeight + 26;

  const canvas = createCanvas(WIDTH * SCALE, height * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  drawHeader(
    ctx,
    WIDTH,
    height,
    `${member} vs ${label}`,
    `${plan.score.toFixed(2)} avg dps · ${plan.switches} inventory slot${plan.switches === 1 ? '' : 's'}`
  );

  await drawInventory(ctx, plan.carried ?? [], PADDING, panelTop);
  await drawEquipment(ctx, plan.wornIds ?? {}, PADDING + INV_WIDTH + COLUMN_GAP, panelTop);

  const fightsTop = panelTop + panelsHeight + 26;
  const afterFights = drawPerFight(ctx, plan.perMonster ?? [], fightsTop);

  ctx.textAlign = 'center';
  ctx.fillStyle = COLOR_MUTED;
  ctx.font = '13px rssmall';
  ctx.fillText('levels assumed maxed · mechanics not modelled', WIDTH / 2, afterFights + 4);

  return canvas.encode('png');
}

module.exports = { renderGearPlan };
