import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";

const ALL_MEMBERS = "@ALL";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function ago(iso) {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

function uptime(seconds) {
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

function gp(n) {
  if (!n) return "";
  if (n >= 1000000000) return `${(n / 1000000000).toFixed(2)}b`;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}m`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export class JumanePage extends BaseElement {
  constructor() {
    super();
    this.view = "activity";
    this.member = ALL_MEMBERS;
    this.days = 7;
  }

  html() {
    return `{{jumane-page.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();

    this.tabs = [...this.querySelectorAll(".jumane-page__tab")];
    this.periodSelect = this.querySelector(".jumane-page__period");
    this.memberSelect = this.querySelector(".jumane-page__member-filter");
    this.error = this.querySelector(".jumane-page__error");
    this.output = this.querySelector(".jumane-page__output");

    for (const tab of this.tabs) {
      this.eventListener(tab, "click", () => {
        this.view = tab.dataset.view;
        for (const other of this.tabs) other.classList.toggle("active", other === tab);
        this.load();
      });
    }
    this.eventListener(this.periodSelect, "change", () => {
      this.days = Number(this.periodSelect.value);
      this.load();
    });
    this.eventListener(this.memberSelect, "change", () => {
      this.member = this.memberSelect.value;
      this.load();
    });
    this.eventListener(this.querySelector(".jumane-page__refresh"), "click", () => this.load());

    this.subscribe("members-updated", this.handleMembers.bind(this));
    // Same reason as every other page here: on a cold load straight to this
    // URL the api has no credentials yet.
    this.subscribeOnce("get-group-data", () => this.load());
  }

  handleMembers(members) {
    const selected = this.memberSelect.value;
    this.memberSelect.innerHTML =
      `<option value="${ALL_MEMBERS}">Everyone</option>` +
      members
        .map(
          (m) =>
            `<option value="${escapeHtml(m.name)}" ${m.name === selected ? "selected" : ""}>${escapeHtml(
              m.name
            )}</option>`
        )
        .join("");
  }

  async load() {
    this.error.innerHTML = "";
    this.output.innerHTML = `<div class="jumane-page__empty">Loading...</div>`;

    try {
      if (this.view === "activity") this.output.innerHTML = JumanePage.activityHtml(await this.fetchActivity());
      else if (this.view === "commands") this.output.innerHTML = JumanePage.commandsHtml(await api.getBotLog(200));
      else this.output.innerHTML = JumanePage.healthHtml(await api.getBotStatus());
    } catch (err) {
      console.error("Jumane page failed to load", err);
      this.output.innerHTML = "";
      this.error.innerHTML = escapeHtml(err.message);
    }
  }

  /**
   * One timeline out of four separately-shaped endpoints.
   *
   * Loot, deaths and pings arrive grouped by member; the storage log arrives
   * flat with the name inside each row. Flattening them into one shape here
   * is the whole job -- no new backend, nothing new stored.
   */
  async fetchActivity() {
    const since = new Date(Date.now() - this.days * 86400000).toISOString();
    const [loot, deaths, storage, pings] = await Promise.all([
      api.getLootData(since).catch(() => []),
      api.getDeathData(since).catch(() => []),
      api.getStorageLog(since).catch(() => []),
      api.getBankPingData().catch(() => []),
    ]);

    const events = [];
    for (const member of loot || []) {
      for (const drop of member.drops || []) {
        events.push({
          at: drop.time,
          member: member.name,
          kind: "loot",
          text: `${drop.item_name}${drop.gp_value ? ` (${gp(drop.gp_value)})` : ""}`,
          link: drop.message_link,
        });
      }
    }
    for (const member of deaths || []) {
      for (const death of member.deaths || []) {
        events.push({ at: death.time, member: member.name, kind: "death", text: "died", link: death.message_link });
      }
    }
    for (const entry of storage || []) {
      events.push({
        at: entry.time,
        member: entry.member_name,
        kind: entry.action === "deposit" ? "deposit" : "withdraw",
        text: `${entry.action} ${entry.quantity > 1 ? `${entry.quantity.toLocaleString()}x ` : ""}${entry.item_name}`,
      });
    }
    for (const member of pings || []) {
      for (const ping of member.pings || []) {
        events.push({ at: ping.time, member: member.name, kind: "ping", text: `bank ping (${ping.reason})` });
      }
    }

    // Trim by date here, not just per endpoint: get-bank-ping-data ignores a
    // window entirely and hands back the group's whole history, so without
    // this the timeline would be a thousand old pings with the day's real
    // activity buried under them.
    const cutoff = Date.parse(since);
    return events
      .filter((event) => Date.parse(event.at) >= cutoff)
      .filter((event) => this.member === ALL_MEMBERS || event.member === this.member)
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 300);
  }

  static activityHtml(events) {
    if (events.length === 0) {
      return `<div class="jumane-page__empty">Nothing in this period.</div>`;
    }

    const rows = events
      .map(
        (event) => `
<tr>
  <td class="jumane-page__when" title="${escapeHtml(new Date(event.at).toLocaleString())}">${ago(event.at)}</td>
  <td><span class="jumane-page__kind jumane-page__kind--${event.kind}">${event.kind}</span></td>
  <td>${escapeHtml(event.member === "@SHARED" ? "shared storage" : event.member)}</td>
  <td>${escapeHtml(event.text)}</td>
  <td>${event.link ? `<a href="${escapeHtml(event.link)}" target="_blank" rel="noreferrer">discord</a>` : ""}</td>
</tr>`
      )
      .join("");

    return `
<table class="jumane-page__table">
  <tr><th>When</th><th>What</th><th>Who</th><th></th><th></th></tr>
  ${rows}
</table>
<div class="jumane-page__note">${events.length} events, newest first.</div>`;
  }

  static commandsHtml({ entries, stats }) {
    if (!entries.length) {
      return `<div class="jumane-page__empty">No commands run yet. Try <code>!where bgs</code> in Discord.</div>`;
    }

    const rows = entries
      .map(
        (entry) => `
<tr class="${entry.ok ? "" : "jumane-page__row--failed"}">
  <td class="jumane-page__when" title="${escapeHtml(new Date(entry.at).toLocaleString())}">${ago(entry.at)}</td>
  <td><code>!${escapeHtml(entry.command)}</code> ${escapeHtml(entry.args || "")}</td>
  <td>${escapeHtml(entry.user)}</td>
  <td class="jumane-page__reply">${escapeHtml(entry.reply)}</td>
  <td>${entry.ms}ms</td>
</tr>`
      )
      .join("");

    const used = Object.entries(stats.byCommand)
      .map(([name, count]) => `<code>!${escapeHtml(name)}</code> ${count}`)
      .join(" &middot; ");

    return `
<div class="jumane-page__summary">
  ${stats.total} logged${
      stats.failures ? ` &middot; <span class="jumane-page__bad">${stats.failures} failed</span>` : ""
    }
  ${used ? `&middot; ${used}` : ""}
</div>
<table class="jumane-page__table">
  <tr><th>When</th><th>Command</th><th>Who</th><th>Replied</th><th></th></tr>
  ${rows}
</table>`;
  }

  static healthHtml(status) {
    const { discord, config, heartbeats, commands } = status;
    const row = (label, value, bad = false) =>
      `<tr><td>${escapeHtml(label)}</td><td class="${bad ? "jumane-page__bad" : ""}">${value}</td></tr>`;

    const beats = Object.entries(heartbeats || {})
      .map(([name, beat]) =>
        row(name, `${ago(beat.at)}${beat.pending !== undefined ? ` (${beat.pending} pending)` : ""}`)
      )
      .join("");

    return `
<div class="jumane-page__panels">
  <div class="jumane-page__panel rsborder-tiny rsbackground">
    <h3>Connection</h3>
    <table class="jumane-page__table">
      ${row("Status", discord.connected ? "connected" : "disconnected", !discord.connected)}
      ${row("Logged in as", escapeHtml(discord.user ?? "unknown"))}
      ${row("Discord ping", discord.pingMs === null ? "pending" : `${discord.pingMs}ms`)}
      ${row("Uptime", uptime(status.uptimeSeconds))}
      ${row("Slash commands", discord.slashCommands)}
    </table>
  </div>

  <div class="jumane-page__panel rsborder-tiny rsbackground">
    <h3>Settings</h3>
    <table class="jumane-page__table">
      ${row("Personality model", escapeHtml(config.personalityModel))}
      ${row("Tools model", escapeHtml(config.toolsModel))}
      ${row("Vision model", escapeHtml(config.visionModel))}
      ${row("Groq key", config.groqConfigured ? "set" : "missing", !config.groqConfigured)}
      ${row(
        "Ambient chat",
        config.ambientChatChance > 0 ? `${(config.ambientChatChance * 100).toFixed(1)}% of messages` : "off"
      )}
      ${row("Death roasts", `${(config.deathRoastChance * 100).toFixed(0)}% of deaths`)}
      ${row("Custom commands", config.customCommandCount)}
      ${row(
        "Command storage",
        config.commandsPersisted ? "on a volume" : "ephemeral -- lost on deploy",
        !config.commandsPersisted
      )}
    </table>
  </div>

  <div class="jumane-page__panel rsborder-tiny rsbackground">
    <h3>Last seen</h3>
    <table class="jumane-page__table">
      ${beats || `<tr><td colspan="2">nothing has reported yet</td></tr>`}
      ${row("Commands run", `${commands.total}${commands.failures ? ` (${commands.failures} failed)` : ""}`)}
    </table>
  </div>
</div>
<div class="jumane-page__note">
  Backend and bot service errors live in Railway, which already searches them &mdash; they are deliberately not mirrored here.
</div>`;
  }
}

customElements.define("jumane-page", JumanePage);
