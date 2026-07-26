// Refreshes expiring Discord CDN attachment URLs stored for loot/death
// screenshots (server/src/db.rs's loot_drops.screenshot_url and
// deaths.image_url). Discord signs these URLs with an `ex` (expiry) query
// param -- once that time passes the URL 403s, and since
// dashboard-page.js's <img> just hides itself on error, an expired
// screenshot silently disappears instead of showing a broken-image icon.
//
// Fixed via Discord's own attachments/refresh-urls endpoint, which mints a
// fresh signed URL for the same underlying attachment without needing the
// original message. The backend owns the "which URLs exist" and "write the
// refreshed ones back" halves (server/src/db.rs get_attachment_urls /
// update_attachment_urls) -- this is purely the Discord I/O + scheduling.
const { REST } = require('discord.js');

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const REFRESH_MARGIN_MS = 12 * 60 * 60 * 1000; // refresh anything expiring within 12h (or already expired)
const DISCORD_BATCH_SIZE = 25; // Discord's own cap per refresh-urls call
const BACKEND_BATCH_SIZE = 100; // matches server's MAX_BATCH_ATTACHMENT_UPDATES

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

// Discord CDN URLs carry `ex` as a hex unix-seconds timestamp, e.g.
// ...?ex=6683a1b0&is=...&hm=...
function expiresAt(url) {
  const match = url.match(/[?&]ex=([0-9a-fA-F]+)/);
  if (!match) return null;
  const seconds = parseInt(match[1], 16);
  return Number.isNaN(seconds) ? null : seconds * 1000;
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function refreshOnce() {
  const response = await fetch(
    `${process.env.BACKEND_URL}/api/group/${process.env.GROUP_NAME}/attachment-urls`,
    { headers: { Authorization: process.env.GROUP_TOKEN } }
  );
  if (!response.ok) {
    console.error(`[attachmentRefresh] attachment-urls GET returned ${response.status}`);
    return;
  }

  const attachments = await response.json();
  const now = Date.now();
  // No `ex` param at all (older rows, or a non-Discord URL) is left alone --
  // nothing to refresh it against.
  const due = attachments.filter((a) => {
    const expiry = expiresAt(a.url);
    return expiry !== null && expiry - now < REFRESH_MARGIN_MS;
  });

  if (due.length === 0) return;

  const updates = [];
  for (const batch of chunk(due, DISCORD_BATCH_SIZE)) {
    try {
      const result = await rest.post('/attachments/refresh-urls', {
        body: { attachment_urls: batch.map((a) => a.url) },
      });
      const refreshedByOriginal = new Map((result.refreshed_urls ?? []).map((r) => [r.original, r.refreshed]));
      for (const attachment of batch) {
        const refreshed = refreshedByOriginal.get(attachment.url);
        if (refreshed) {
          updates.push({ id: attachment.id, kind: attachment.kind, url: refreshed });
        }
      }
    } catch (err) {
      console.error(`[attachmentRefresh] Discord refresh call failed: ${err.message}`);
    }
  }

  if (updates.length === 0) return;

  for (const batch of chunk(updates, BACKEND_BATCH_SIZE)) {
    const putResponse = await fetch(
      `${process.env.BACKEND_URL}/api/group/${process.env.GROUP_NAME}/attachment-urls`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: process.env.GROUP_TOKEN },
        body: JSON.stringify({ updates: batch }),
      }
    );
    if (!putResponse.ok) {
      console.error(`[attachmentRefresh] attachment-urls PUT returned ${putResponse.status}`);
    }
  }

  console.log(`[attachmentRefresh] Refreshed ${updates.length}/${due.length} due attachment URL(s)`);
}

function start() {
  const run = () => refreshOnce().catch((err) => console.error(`[attachmentRefresh] run failed: ${err.message}`));
  run();
  setInterval(run, CHECK_INTERVAL_MS);
}

module.exports = { start };
