// Thin client for the group-ironmen Rust backend, authenticating the same
// way the site/plugin do: a shared per-group token in the Authorization
// header (raw token, no "Bearer" prefix).

const BACKEND_URL = process.env.BACKEND_URL;
const GROUP_NAME = process.env.GROUP_NAME;
const GROUP_TOKEN = process.env.GROUP_TOKEN;

async function post(path, body) {
  const response = await fetch(`${BACKEND_URL}/api/group/${GROUP_NAME}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: GROUP_TOKEN,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${await response.text()}`);
  }
}

function postLootDrop(drop) {
  return post('/loot-drop', drop);
}

function postDeath(death) {
  return post('/death', death);
}

function postStorageLog(entry) {
  return post('/storage-log', entry);
}

module.exports = { postLootDrop, postDeath, postStorageLog };
