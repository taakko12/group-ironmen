// Renders a batch of bank-ping items (everything one member needs to bank,
// for one reason -- auto "logged off holding it" vs manual "someone asked
// you to") as a single canvas graphic, styled like the loot/death
// leaderboards. This replaces sending one Discord message per item.

const { createCanvas, loadImage } = require('@napi-rs/canvas');
require('./fonts');
const { getItemId, SITE_URL } = require('./itemData');

const WIDTH = 560;
const PADDING = 24;
const HEADER_HEIGHT = 76;
const ROW_HEIGHT = 56;
const SCALE = 2;

const COLOR_BACKGROUND = '#000000';
const COLOR_BORDER = '#ff981f';
const COLOR_HEADER = '#ff981f';
const COLOR_NAME = '#ffffff';
const COLOR_SUBTEXT = '#d8d8d8';
const COLOR_DIVIDER = 'rgba(255, 255, 255, 0.08)';

function createScaledCanvas(width, height) {
  const canvas = createCanvas(width * SCALE, height * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  return { canvas, ctx };
}

const iconCache = new Map();
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

async function renderBankAlert(memberName, itemNames, { manual = false } = {}) {
  const icons = await Promise.all(itemNames.map(getItemIcon));

  const height = HEADER_HEIGHT + itemNames.length * ROW_HEIGHT + PADDING;
  const { canvas, ctx } = createScaledCanvas(WIDTH, height);

  ctx.fillStyle = COLOR_BACKGROUND;
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.fillRect(0, 0, WIDTH, HEADER_HEIGHT);

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = COLOR_HEADER;
  ctx.font = '26px rsbold';
  ctx.fillText(manual ? 'BANK REQUEST' : 'UNBANKED ITEMS', WIDTH / 2, HEADER_HEIGHT / 2 - 12);
  ctx.fillStyle = COLOR_NAME;
  ctx.font = '17px rssmall';
  ctx.fillText(memberName, WIDTH / 2, HEADER_HEIGHT / 2 + 17);

  ctx.strokeStyle = COLOR_BORDER;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, WIDTH - 4, height - 4);

  itemNames.forEach((name, i) => {
    const y = HEADER_HEIGHT + i * ROW_HEIGHT;
    if (i > 0) {
      ctx.strokeStyle = COLOR_DIVIDER;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PADDING, y);
      ctx.lineTo(WIDTH - PADDING, y);
      ctx.stroke();
    }

    const centerY = y + ROW_HEIGHT / 2;
    let x = PADDING;
    if (icons[i]) {
      ctx.drawImage(icons[i], x, centerY - 16, 32, 32);
      x += 40;
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = icons[i] ? COLOR_NAME : COLOR_SUBTEXT;
    ctx.font = '22px rsbold';
    ctx.fillText(name, x, centerY);
  });

  return canvas.toBuffer('image/png');
}

module.exports = { renderBankAlert };
