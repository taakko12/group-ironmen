import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/data/api";
import { pubsub } from "../src/data/pubsub";
import { groupData } from "../src/data/group-data";
import { exampleData } from "../src/data/example-data";

// jsdom doesn't implement EventSource, so /live needs a stand-in. Tests
// trigger server pushes via `instance.emit("message", jsonString)`.
class FakeEventSource {
  constructor(url) {
    this.url = url;
    this.listeners = {};
    FakeEventSource.instances.push(this);
  }
  addEventListener(type, handler) {
    (this.listeners[type] ??= []).push(handler);
  }
  emit(type, data) {
    for (const handler of this.listeners[type] || []) {
      handler({ data });
    }
  }
  close() {
    this.closed = true;
  }
}

describe("api", () => {
  beforeEach(() => {
    api.enabled = false;
    api.exampleDataEnabled = false;
    api.groupName = undefined;
    api.groupToken = undefined;
    api.getGroupInterval = undefined;
    api.liveSource = undefined;
    api.heavyDataEnabled = false;

    groupData.members = new Map();
    groupData.groupItems = {};
    groupData.filters = ["existing"];

    globalThis.fetch = vi.fn();
    FakeEventSource.instances = [];
    globalThis.EventSource = FakeEventSource;
  });

  it("sets credentials and exposes group-scoped urls", () => {
    api.setCredentials("iron-team", "secret-token");

    expect(api.groupName).toBe("iron-team");
    expect(api.groupToken).toBe("secret-token");
    expect(api.getGroupDataUrl).toContain("/group/iron-team/get-group-data");
    expect(api.addMemberUrl).toContain("/group/iron-team/add-group-member");
    expect(api.deleteMemberUrl).toContain("/group/iron-team/delete-group-member");
    expect(api.renameMemberUrl).toContain("/group/iron-team/rename-group-member");
    expect(api.amILoggedInUrl).toContain("/group/iron-team/am-i-logged-in");
    expect(api.skillDataUrl).toContain("/group/iron-team/get-skill-data");
  });

  it("enable waits for data-load events, checks auth once, then connects live", async () => {
    const waitForAllEventsSpy = vi.spyOn(pubsub, "waitForAllEvents").mockResolvedValue();
    globalThis.fetch.mockResolvedValue({ ok: true });

    await api.enable("gim", "token");

    expect(waitForAllEventsSpy).toHaveBeenCalledWith("item-data-loaded", "quest-data-loaded");
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/group/gim/am-i-logged-in", {
      headers: { Authorization: "token" },
    });
    expect(api.enabled).toBe(true);
    expect(api.groupName).toBe("gim");
    expect(api.groupToken).toBe("token");
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe("/api/group/gim/live?token=token&heavy=false");
    expect(api.liveSource).toBe(FakeEventSource.instances[0]);
  });

  it("enable redirects to login instead of connecting live when the auth check fails", async () => {
    vi.spyOn(pubsub, "waitForAllEvents").mockResolvedValue();
    const pushStateSpy = vi.spyOn(window.history, "pushState");
    const publishSpy = vi.spyOn(pubsub, "publish");
    globalThis.fetch.mockResolvedValue({ ok: false, status: 401 });

    await api.enable("gim", "token");

    expect(FakeEventSource.instances).toHaveLength(0);
    expect(pushStateSpy).toHaveBeenCalledWith("", "", "/login");
    expect(publishSpy).toHaveBeenCalledWith("get-group-data");
    expect(api.enabled).toBe(false);
    expect(api.groupName).toBeUndefined();
  });

  it("reconnects live with heavy=true when the items page becomes active, and back when it leaves", async () => {
    vi.spyOn(pubsub, "waitForAllEvents").mockResolvedValue();
    globalThis.fetch.mockResolvedValue({ ok: true });
    await api.enable("gim", "token");
    const original = FakeEventSource.instances[0];

    const itemsRoute = { getAttribute: () => "items-page" };
    api.handleRouteActivated(itemsRoute);

    expect(original.closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(FakeEventSource.instances[1].url).toBe("/api/group/gim/live?token=token&heavy=true");

    const dashboardRoute = { getAttribute: () => "dashboard-page" };
    api.handleRouteActivated(dashboardRoute);

    expect(FakeEventSource.instances).toHaveLength(3);
    expect(FakeEventSource.instances[2].url).toBe("/api/group/gim/live?token=token&heavy=false");
  });

  it("does not reconnect live when route-activated fires but the items page isn't newly (in)active", async () => {
    vi.spyOn(pubsub, "waitForAllEvents").mockResolvedValue();
    globalThis.fetch.mockResolvedValue({ ok: true });
    await api.enable("gim", "token");

    const dashboardRoute = { getAttribute: () => "dashboard-page" };
    api.handleRouteActivated(dashboardRoute);
    api.handleRouteActivated(dashboardRoute);

    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("disable closes the live connection, clears credentials, and clears group caches", async () => {
    vi.spyOn(pubsub, "waitForAllEvents").mockResolvedValue();
    globalThis.fetch.mockResolvedValue({ ok: true });
    await api.enable("gim", "token");
    const source = FakeEventSource.instances[0];
    groupData.members = new Map([["Alice", {}]]);
    groupData.groupItems = { 4151: { id: 4151, quantity: 1 } };

    await api.disable();

    expect(source.closed).toBe(true);
    expect(api.liveSource).toBeUndefined();
    expect(api.enabled).toBe(false);
    expect(api.groupName).toBeUndefined();
    expect(api.groupToken).toBeUndefined();
    expect(groupData.members.size).toBe(0);
    expect(groupData.groupItems).toEqual({});
    expect(groupData.filters).toEqual([""]);
  });

  it("disable clears the demo-mode polling interval", async () => {
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    api.groupName = "gim";
    api.groupToken = "token";
    api.enabled = true;
    api.getGroupInterval = Promise.resolve(99);

    await api.disable();

    expect(clearIntervalSpy).toHaveBeenCalledWith(99);
  });

  it("handleLiveMessage applies a full snapshot via groupData.update", async () => {
    vi.spyOn(pubsub, "waitForAllEvents").mockResolvedValue();
    globalThis.fetch.mockResolvedValue({ ok: true });
    await api.enable("gim", "token");

    const payload = [{ name: "Alice" }];
    const updateSpy = vi.spyOn(groupData, "update").mockReturnValue(new Date("2026-03-30T00:00:05.000Z"));
    const publishSpy = vi.spyOn(pubsub, "publish");

    FakeEventSource.instances[0].emit("message", JSON.stringify({ kind: "full", members: payload }));

    expect(updateSpy).toHaveBeenCalledWith(payload);
    expect(publishSpy).toHaveBeenCalledWith("get-group-data", groupData);
  });

  it("handleLiveMessage applies a delta via groupData.updatePartial", async () => {
    vi.spyOn(pubsub, "waitForAllEvents").mockResolvedValue();
    globalThis.fetch.mockResolvedValue({ ok: true });
    await api.enable("gim", "token");

    const payload = [{ name: "Alice", stats: [1, 2, 3] }];
    const updatePartialSpy = vi.spyOn(groupData, "updatePartial").mockReturnValue(new Date());

    FakeEventSource.instances[0].emit("message", JSON.stringify({ kind: "delta", members: payload }));

    expect(updatePartialSpy).toHaveBeenCalledWith(payload);
  });

  it("handleLiveMessage ignores unparsable or unknown-kind messages", async () => {
    vi.spyOn(pubsub, "waitForAllEvents").mockResolvedValue();
    globalThis.fetch.mockResolvedValue({ ok: true });
    await api.enable("gim", "token");

    const updateSpy = vi.spyOn(groupData, "update");
    const updatePartialSpy = vi.spyOn(groupData, "updatePartial");

    FakeEventSource.instances[0].emit("message", "not json");
    FakeEventSource.instances[0].emit("message", JSON.stringify({ kind: "unknown", members: [] }));

    expect(updateSpy).not.toHaveBeenCalled();
    expect(updatePartialSpy).not.toHaveBeenCalled();
  });

  it("uses example data path for group and skill data when enabled", async () => {
    api.exampleDataEnabled = true;

    const groupPayload = [{ name: "Example" }];
    const skillPayload = [{ name: "Example", skill_data: [] }];
    vi.spyOn(exampleData, "getGroupData").mockReturnValue(groupPayload);
    vi.spyOn(exampleData, "getSkillData").mockReturnValue(skillPayload);
    const updateSpy = vi.spyOn(groupData, "update").mockReturnValue(new Date("2026-03-30T00:00:01.000Z"));
    const publishSpy = vi.spyOn(pubsub, "publish");

    await api.getGroupData();
    const skillData = await api.getSkillData("week");

    expect(updateSpy).toHaveBeenCalledWith(groupPayload);
    expect(publishSpy).toHaveBeenCalledWith("get-group-data", groupData);
    expect(skillData).toBe(skillPayload);
    expect(exampleData.getSkillData).toHaveBeenCalledWith("week", groupData);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("sends expected request shapes for member and auth helper endpoints", async () => {
    api.setCredentials("gim", "token");

    const response = { ok: true, json: vi.fn().mockResolvedValue({ enabled: true }) };
    globalThis.fetch.mockResolvedValue(response);

    await api.createGroup("new-group", ["Alice", "Bob"], "captcha-token");
    await api.addMember("Charlie");
    await api.removeMember("Charlie");
    await api.renameMember("Charlie", "Charlotte");
    await api.amILoggedIn();
    await api.getGePrices();
    await api.getCaptchaEnabled();

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      "/api/create-group",
      {
        body: JSON.stringify({
          name: "new-group",
          member_names: ["Alice", "Bob"],
          captcha_response: "captcha-token",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/group/gim/add-group-member",
      {
        body: JSON.stringify({ name: "Charlie" }),
        headers: { "Content-Type": "application/json", Authorization: "token" },
        method: "POST",
      },
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      3,
      "/api/group/gim/delete-group-member",
      {
        body: JSON.stringify({ name: "Charlie" }),
        headers: { "Content-Type": "application/json", Authorization: "token" },
        method: "DELETE",
      },
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      4,
      "/api/group/gim/rename-group-member",
      {
        body: JSON.stringify({ original_name: "Charlie", new_name: "Charlotte" }),
        headers: { "Content-Type": "application/json", Authorization: "token" },
        method: "PUT",
      },
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(5, "/api/group/gim/am-i-logged-in", {
      headers: { Authorization: "token" },
    });
    expect(globalThis.fetch).toHaveBeenNthCalledWith(6, "/api/ge-prices");
    expect(globalThis.fetch).toHaveBeenNthCalledWith(7, "/api/captcha-enabled");
  });

  it("restart re-enables with existing credentials", async () => {
    api.setCredentials("gim", "token");
    const enableSpy = vi.spyOn(api, "enable").mockResolvedValue();

    await api.restart();

    expect(enableSpy).toHaveBeenCalledWith("gim", "token");
  });
});
