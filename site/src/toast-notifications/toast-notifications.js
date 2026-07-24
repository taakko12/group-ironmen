import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";
import { Item } from "../data/item";

const POLL_INTERVAL_MS = 20000;
const AUTO_DISMISS_MS = 9000;
const MAX_VISIBLE_TOASTS = 6;
const CURSOR_STORAGE_KEY = "toast-notifications:cursor";
// If someone hasn't had the site open in this browser for longer than this,
// don't try to replay the full backlog since then -- just fast-forward to
// now so re-opening a long-stale tab doesn't burst-fire a huge pile of
// months-old toasts.
const MAX_CATCHUP_MS = 24 * 60 * 60 * 1000;

// Site-wide (mounted once, outside routing, alongside rs-tooltip/confirm-dialog)
// so a toast fires no matter which page is open. Since data only ever comes
// from polling REST endpoints (no push/websocket), "new" is detected by
// comparing each entry's timestamp against a cursor persisted in
// localStorage (not just in-memory) -- so if someone does something in-game
// and *then* loads/refreshes the site to check, it still toasts, instead of
// looking like pre-existing history to a freshly-reset in-memory baseline.
export class ToastNotifications extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{toast-notifications.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
    this.container = this.querySelector(".toast-notifications__container");

    this.seenLoot = new Set();
    this.seenDeaths = new Set();
    this.seenBankPings = new Set();
    this.seenStorageLog = new Set();
    this.cursor = this.loadCursor();

    this.subscribeOnce("get-group-data", this.start.bind(this));
  }

  loadCursor() {
    const stored = window.localStorage.getItem(CURSOR_STORAGE_KEY);
    const now = Date.now();
    if (stored) {
      const storedTime = new Date(stored).getTime();
      if (!isNaN(storedTime) && now - storedTime < MAX_CATCHUP_MS) {
        return storedTime;
      }
    }
    return now;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.pollInterval) {
      window.clearInterval(this.pollInterval);
    }
  }

  start() {
    if (this.pollInterval) return;
    this.poll();
    this.pollInterval = window.setInterval(this.poll.bind(this), POLL_INTERVAL_MS);
  }

  async poll() {
    try {
      const [lootData, deathData, bankPings, storageLog] = await Promise.all([
        api.getLootData(),
        api.getDeathData(),
        api.getRecentBankPings(),
        api.getStorageLog(),
      ]);
      // Held fixed for this whole poll so every entry is compared against
      // the same starting point, then becomes the new cursor once done.
      this.pendingCursor = this.cursor;
      this.processLoot(lootData);
      this.processDeaths(deathData);
      this.processBankPings(bankPings);
      this.processStorageLog(storageLog);
      this.cursor = this.pendingCursor;
      window.localStorage.setItem(CURSOR_STORAGE_KEY, new Date(this.cursor).toISOString());
    } catch (err) {
      console.error("[toast-notifications] poll failed", err);
    }
  }

  // True if `timeStr` is newer than the cursor as of the start of this poll
  // (so it should toast); always advances pendingCursor so the next poll's
  // cursor covers everything seen in this one, toasted or not.
  isNewSinceCursor(timeStr) {
    const t = new Date(timeStr).getTime();
    if (t > this.pendingCursor) this.pendingCursor = t;
    return t > this.cursor;
  }

  processLoot(lootData) {
    for (const member of lootData) {
      for (const drop of member.drops) {
        const key = `${member.name}|${drop.item_name}|${drop.gp_value}|${drop.time}`;
        if (this.seenLoot.has(key)) continue;
        this.seenLoot.add(key);
        if (this.isNewSinceCursor(drop.time)) this.showLootToast(member.name, drop);
      }
    }
  }

  processDeaths(deathData) {
    for (const member of deathData) {
      for (const death of member.deaths) {
        const key = `${member.name}|${death.time}`;
        if (this.seenDeaths.has(key)) continue;
        this.seenDeaths.add(key);
        if (this.isNewSinceCursor(death.time)) this.showDeathToast(member.name, death);
      }
    }
  }

  processBankPings(bankPings) {
    for (const ping of bankPings) {
      const key = `${ping.member_name}|${ping.item_id}|${ping.reason}|${ping.created_at}`;
      if (this.seenBankPings.has(key)) continue;
      this.seenBankPings.add(key);
      if (this.isNewSinceCursor(ping.created_at)) this.showBankPingToast(ping);
    }
  }

  processStorageLog(storageLog) {
    for (const entry of storageLog) {
      const key = `${entry.member_name}|${entry.item_name}|${entry.quantity}|${entry.action}|${entry.time}`;
      if (this.seenStorageLog.has(key)) continue;
      this.seenStorageLog.add(key);
      if (this.isNewSinceCursor(entry.time)) this.showStorageLogToast(entry);
    }
  }

  showLootToast(memberName, drop) {
    const imageUrl = drop.image_url || drop.screenshot_url;
    this.addToast({
      type: "loot",
      icon: imageUrl,
      title: `${memberName} received a drop!`,
      body: `${drop.item_name} (${drop.gp_value.toLocaleString()} gp)`,
      link: drop.message_link,
    });
  }

  showDeathToast(memberName, death) {
    this.addToast({
      type: "death",
      icon: death.image_url,
      title: `${memberName} has died!`,
      body: new Date(death.time).toLocaleString(),
      link: death.message_link,
    });
  }

  showBankPingToast(ping) {
    const itemName = Item.itemDetails?.[ping.item_id]?.name ?? `item #${ping.item_id}`;
    const reasonLabel = ping.reason === "manual" ? "was asked to bank" : "should bank";
    this.addToast({
      type: "bank",
      icon: null,
      title: `${ping.member_name} ${reasonLabel}`,
      body: itemName,
      link: null,
    });
  }

  showStorageLogToast(entry) {
    const isDeposit = entry.action === "deposit";
    const verb = isDeposit ? "deposited" : "withdrew";
    const preposition = isDeposit ? "into" : "from";
    const value = entry.gp_value ? ` (${entry.gp_value.toLocaleString()} gp)` : "";
    this.addToast({
      type: isDeposit ? "storage-deposit" : "storage-withdraw",
      icon: null,
      title: `${entry.member_name} ${verb} ${preposition} shared storage`,
      body: `${entry.quantity} x ${entry.item_name}${value}`,
      link: entry.message_link,
    });
  }

  addToast({ type, icon, title, body, link }) {
    const iconHtml = icon
      ? `<img class="toast-notifications__icon" src="${icon}" loading="lazy" onerror="this.remove()" />`
      : "";
    const linkContent = `
${iconHtml}
<div class="toast-notifications__text">
  <div class="toast-notifications__title">${title}</div>
  <div class="toast-notifications__body">${body}</div>
</div>
`;
    // Dismiss is a sibling of the link (not nested inside it) so it never
    // triggers the link's navigation when clicked.
    const linkHtml = link
      ? `<a class="toast-notifications__link" href="${link}" target="_blank" rel="noopener">${linkContent}</a>`
      : `<div class="toast-notifications__link">${linkContent}</div>`;

    const toastEl = document.createElement("div");
    toastEl.className = `toast-notifications__toast toast-notifications__toast--${type} rsborder rsbackground`;
    toastEl.innerHTML = `${linkHtml}<button type="button" class="toast-notifications__dismiss" title="Dismiss">✕</button>`;

    toastEl.querySelector(".toast-notifications__dismiss").addEventListener("click", () => {
      this.removeToast(toastEl);
    });

    this.container.prepend(toastEl);
    // removeToast() removal is delayed (fade-out), so take a static snapshot
    // rather than looping on the live (not-yet-shrunk) children collection.
    const toasts = [...this.container.children];
    for (let i = MAX_VISIBLE_TOASTS; i < toasts.length; i++) {
      this.removeToast(toasts[i]);
    }

    requestAnimationFrame(() => toastEl.classList.add("toast-notifications__toast--visible"));
    toastEl.dismissTimeout = window.setTimeout(() => this.removeToast(toastEl), AUTO_DISMISS_MS);
  }

  removeToast(toastEl) {
    if (!toastEl || toastEl.removing) return;
    toastEl.removing = true;
    window.clearTimeout(toastEl.dismissTimeout);

    toastEl.classList.remove("toast-notifications__toast--visible");
    window.setTimeout(() => toastEl.remove(), 300);
  }
}
customElements.define("toast-notifications", ToastNotifications);
