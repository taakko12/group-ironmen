// HTTP front for the planner. No framework: it is three routes.
//
//   GET  /health
//   GET  /monsters?q=vork          -> name lookup, because names must be exact
//   POST /plan                     -> { member, targets, budget, lock?, curve? }
//
// Callers present the group token in Authorization, the same one the site
// already holds. The service uses its own copy to read group data, so the
// browser never has to ship a bank across the wire to get a plan.
import http from "node:http";
import { Prayer } from "@/enums/Prayer";
import { AttackStyle, equipmentById, findMonster } from "./engine";
import { budgetCurve, fewestSwitchesFor, MonsterTarget, planSwitches } from "./switches";

const PORT = Number(process.env.PORT ?? 8080);
const { BACKEND_URL, GROUP_NAME, GROUP_TOKEN } = process.env;

// A plan reads every member's full bank. That request is the single heaviest
// thing this service does, and it was a real cost problem for the group
// before (see the Supabase egress work), so one fetch is shared by every
// plan for a minute rather than one per click.
const GROUP_TTL_MS = 60_000;
let groupCache: { at: number; data: Member[] } | null = null;

interface Member {
  name: string;
  bank?: number[];
  equipment?: number[];
  inventory?: number[];
}

function itemIds(pairs: number[] | null | undefined): number[] {
  const ids: number[] = [];
  for (let i = 0; pairs && i < pairs.length; i += 2) if (pairs[i] > 0) ids.push(pairs[i]);
  return ids;
}

async function groupData(): Promise<Member[]> {
  if (groupCache && Date.now() - groupCache.at < GROUP_TTL_MS) return groupCache.data;

  const from = "2000-01-01T00:00:00Z";
  const response = await fetch(
    `${BACKEND_URL}/api/group/${GROUP_NAME}/get-group-data` +
      `?from_time=${from}&include_heavy=true&heavy_from_time=${from}`,
    { headers: { Authorization: GROUP_TOKEN as string } }
  );
  if (!response.ok) throw new Error(`get-group-data returned ${response.status}`);

  const data = (await response.json()) as Member[];
  groupCache = { at: Date.now(), data };
  return data;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

async function readJson(request: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw new HttpError(413, "body too large");
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new HttpError(400, "body is not JSON");
  }
}

async function handlePlan(body: Record<string, unknown>) {
  const memberName = String(body.member ?? "");
  const targetNames = Array.isArray(body.targets) ? (body.targets as unknown[]) : [];
  if (!memberName) throw new HttpError(400, "member is required");
  if (targetNames.length === 0) throw new HttpError(400, "at least one target is required");

  const group = await groupData();
  const member = group.find((m) => m.name.toLowerCase() === memberName.toLowerCase());
  if (!member) throw new HttpError(404, `no member "${memberName}"`);

  const heldBy = (m: Member) =>
    new Set([...itemIds(m.bank), ...itemIds(m.equipment), ...itemIds(m.inventory)]);

  const mine = heldBy(member);

  // A group ironman's gear is shared in practice -- the scythe lives in
  // whoever's bank it dropped in -- so planning against one person's bank
  // understates what the team can actually field. `pool: "group"` unions
  // everyone, and `owners` records who holds what so the answer can say where
  // to go and get it rather than listing gear the asker has never seen.
  //
  // What this does NOT model: two people cannot wear the same scythe. These
  // are plans for one person at a time, so that only bites if the whole team
  // plans off a single borrowed item.
  const owners = new Map<number, string[]>();
  if (body.pool === "group") {
    for (const other of group) {
      for (const id of heldBy(other)) {
        if (!owners.has(id)) owners.set(id, []);
        owners.get(id)!.push(other.name);
      }
    }
  }

  const owned = owners.size ? [...owners.keys()] : [...mine];

  const targets: MonsterTarget[] = targetNames.map((entry) => {
    const spec =
      typeof entry === "string"
        ? { name: entry }
        : (entry as { name: string; version?: string; weight?: number; styles?: AttackStyle[] });
    const monster = findMonster(spec.name, spec.version);
    if (!monster) throw new HttpError(400, `unknown monster "${spec.name}"`);

    const styles = (spec.styles ?? []).filter((s) => ["melee", "ranged", "magic"].includes(s));
    if (spec.styles?.length && styles.length === 0) {
      throw new HttpError(400, `styles must be melee, ranged or magic`);
    }
    return { monster, weight: spec.weight, styles: styles.length ? styles : undefined };
  });

  // Locks arrive as names: ids are not something anyone types by hand.
  const lockedIds = (Array.isArray(body.lock) ? (body.lock as string[]) : []).map((name) => {
    const match = owned.find((id) => equipmentById(id)?.name.toLowerCase() === String(name).toLowerCase());
    if (!match) {
      const whose = owners.size ? "the group owns" : `${member.name} owns`;
      throw new HttpError(400, `"${name}" is not equipment ${whose}`);
    }
    return match;
  });

  const budget = Math.max(0, Math.min(Number(body.budget ?? 4), 12));
  const options = {
    maxSwitches: budget,
    lockedIds,
    // All three go in together: the calculator applies only the one matching
    // the loadout's style, so this means "best prayer for whatever this is".
    // Without Augury, magic loadouts were scored unprayed while melee and
    // ranged got theirs, which quietly biased every comparison against magic.
    prayers: [Prayer.RIGOUR, Prayer.PIETY, Prayer.AUGURY],
    maxWeapons: Math.max(1, Math.min(Number(body.weapons ?? 12), 40)),
    candidatesPerMonster: 6,
  };

  const caveats = [
    "Skill levels are assumed maxed.",
    "Raid mechanics and positioning are not modelled.",
  ];

  /** Gear in the plan that the asker does not hold, and who does. */
  const borrowedFor = (plan: { wornIds: Record<string, number>; carried: { itemId: number }[] }) => {
    const ids = new Set([...Object.values(plan.wornIds), ...plan.carried.map((c) => c.itemId)]);
    return [...ids]
      .filter((id) => !mine.has(id))
      .map((id) => ({
        name: equipmentById(id)?.name ?? String(id),
        // The holder is never the asker here, so an empty list cannot happen
        // for a group pool -- but filter anyway so a self-plan stays sane.
        from: (owners.get(id) ?? []).filter((who) => who !== member.name),
      }));
  };

  if (body.curve) {
    const steps = budgetCurve(owned, targets, options);
    const fewest = fewestSwitchesFor(steps);
    return {
      member: member.name,
      poolSize: owned.length,
      curve: steps.map((s) => ({ budget: s.budget, score: s.plan.score, marginal: s.marginal })),
      recommendedBudget: fewest.budget,
      plan: fewest.plan,
      borrowed: borrowedFor(fewest.plan),
      caveats,
    };
  }

  const plan = planSwitches(owned, targets, options);
  return { member: member.name, poolSize: owned.length, plan, borrowed: borrowedFor(plan), caveats };
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
  const send = (status: number, payload: unknown) => {
    const body = JSON.stringify(payload);
    response.writeHead(status, {
      "Content-Type": "application/json",
      // The site is on a different origin to this service, exactly as it is
      // to the Rust backend.
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    });
    response.end(body);
  };

  try {
    if (request.method === "OPTIONS") return send(204, {});
    if (url.pathname === "/health") return send(200, { ok: true });

    if (!GROUP_TOKEN || request.headers.authorization !== GROUP_TOKEN) {
      return send(401, { error: "bad or missing group token" });
    }

    if (url.pathname === "/monsters") {
      const query = (url.searchParams.get("q") ?? "").toLowerCase();
      if (query.length < 2) return send(400, { error: "q must be at least 2 characters" });
      const { getMonsters } = await import("@/lib/Monsters");
      const matches = getMonsters()
        .filter((m) => m.name.toLowerCase().includes(query))
        .slice(0, 50)
        .map((m) => ({ name: m.name, version: m.version, hp: m.skills.hp }));
      return send(200, { matches });
    }

    if (url.pathname === "/plan" && request.method === "POST") {
      return send(200, await handlePlan(await readJson(request)));
    }

    return send(404, { error: "no such route" });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "unknown error";
    if (status === 500) console.error(error);
    send(status, { error: message });
  }
});

for (const [name, value] of Object.entries({ BACKEND_URL, GROUP_NAME, GROUP_TOKEN })) {
  if (!value) {
    console.error(`${name} is not set`);
    process.exit(1);
  }
}

server.listen(PORT, () => console.log(`dps service listening on ${PORT}`));
