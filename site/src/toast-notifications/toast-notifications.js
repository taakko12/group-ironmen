import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";
import { Item } from "../data/item";

const POLL_INTERVAL_MS = 2000;
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

  // Dink bundles an entire deposit/withdrawal transaction's line items into
  // one Discord message, but we log one storage_log row per item -- group
  // them back into one toast per transaction (by message_link, since every
  // item from the same message shares it) instead of one toast per item.
  processStorageLog(storageLog) {
    const newEntries = [];
    for (const entry of storageLog) {
      const key = `${entry.member_name}|${entry.item_name}|${entry.quantity}|${entry.action}|${entry.time}`;
      if (this.seenStorageLog.has(key)) continue;
      this.seenStorageLog.add(key);
      if (this.isNewSinceCursor(entry.time)) newEntries.push(entry);
    }
    if (newEntries.length === 0) return;

    const groups = new Map();
    for (const entry of newEntries) {
      const groupKey = entry.message_link || `${entry.member_name}|${entry.action}|${entry.time}`;
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey).push(entry);
    }
    for (const entries of groups.values()) {
      this.showStorageLogToast(entries);
    }
  }

  showLootToast(memberName, drop) {
    this.addToast({
      type: "loot",
      // Prefer the real gameplay screenshot over the item's wiki sprite,
      // rendered bigger as a banner rather than a small icon.
      screenshot: drop.screenshot_url,
      icon: drop.screenshot_url ? null : drop.image_url,
      title: `${memberName} received a drop!`,
      body: `${drop.item_name} (${drop.gp_value.toLocaleString()} gp)`,
      link: drop.message_link,
    });
  }

  showDeathToast(memberName, death) {
    this.addToast({
      type: "death",
      screenshot: death.image_url,
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

  showStorageLogToast(entries) {
    const MAX_LINES = 6;
    const first = entries[0];
    const deposits = entries.filter((e) => e.action === "deposit");
    const withdrawals = entries.filter((e) => e.action === "withdraw");

    const lineHtml = (entry, sign, modifier) => {
      const value = entry.gp_value ? ` (${entry.gp_value.toLocaleString()} gp)` : "";
      return `<div class="toast-notifications__line toast-notifications__line--${modifier}">${sign} ${entry.quantity} x ${entry.item_name}${value}</div>`;
    };

    const listHtml = (list, sign, modifier) => {
      const shown = list.slice(0, MAX_LINES).map((entry) => lineHtml(entry, sign, modifier));
      if (list.length > MAX_LINES) {
        shown.push(
          `<div class="toast-notifications__line toast-notifications__line--${modifier}">+${
            list.length - MAX_LINES
          } more</div>`
        );
      }
      return shown.join("");
    };

    const hasDeposits = deposits.length > 0;
    const hasWithdrawals = withdrawals.length > 0;
    const type = hasDeposits && !hasWithdrawals ? "storage-deposit" : !hasDeposits && hasWithdrawals ? "storage-withdraw" : "storage-mixed";
    const verb = hasDeposits && hasWithdrawals ? "updated" : hasDeposits ? "deposited into" : "withdrew from";

    this.addToast({
      type,
      icon: null,
      title: `${first.member_name} ${verb} shared storage`,
      body: `${listHtml(deposits, "+", "deposit")}${listHtml(withdrawals, "−", "withdraw")}`,
      link: first.message_link,
    });
  }

  addToast({ type, icon, screenshot, title, body, link }) {
    const mediaHtml = screenshot
      ? `<img class="toast-notifications__screenshot" src="${screenshot}" loading="lazy" onerror="this.remove()" />`
      : icon
      ? `<img class="toast-notifications__icon" src="${icon}" loading="lazy" onerror="this.remove()" />`
      : "";
    const linkContent = `
${mediaHtml}
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
    this.scheduleEviction();

    requestAnimationFrame(() => toastEl.classList.add("toast-notifications__toast--visible"));
    toastEl.dismissTimeout = window.setTimeout(() => this.removeToast(toastEl), AUTO_DISMISS_MS);
  }

  // Several toasts can be added synchronously in one poll (e.g. a multi-item
  // batch, or several people getting drops at once). Checking the cap after
  // every single addition would evict most of that same burst before it's
  // even rendered, so this coalesces to a single eviction pass per frame,
  // after all of this poll's toasts have been added.
  scheduleEviction() {
    if (this.evictionScheduled) return;
    this.evictionScheduled = true;
    requestAnimationFrame(() => {
      this.evictionScheduled = false;
      // removeToast() removal is delayed (fade-out), so take a static
      // snapshot rather than looping on the live (not-yet-shrunk) collection.
      const toasts = [...this.container.children];
      for (let i = MAX_VISIBLE_TOASTS; i < toasts.length; i++) {
        this.removeToast(toasts[i]);
      }
    });
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
