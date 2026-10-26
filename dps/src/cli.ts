// Run a plan from the command line, against the group's real gear.
//
//   npm run plan -- --find vork
//   npm run plan -- --member "T aak" --targets "Vorkath,Zulrah" --budget 4
//   npm run plan -- --member "T aak" --targets "Vorkath,Zulrah" --curve
//   npm run plan -- --member "T aak" --targets "..." --lock "Crystal body,Crystal legs"
//
// Needs BACKEND_URL, GROUP_NAME and GROUP_TOKEN, which are the same values the
// bot runs on. Put them in dps/.env (gitignored) or pass them in the
// environment.
import fs from "node:fs";
import path from "node:path";
import { Prayer } from "@/enums/Prayer";
import { equipmentById, findMonster } from "./engine";
import { budgetCurve, fewestSwitchesFor, MonsterTarget, planSwitches, SwitchPlan } from "./switches";

function loadEnv() {
  const file = path.resolve(import.meta.dirname, "../.env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const has = (name: string) => process.argv.includes(`--${name}`);

/** [id, qty, id, qty, ...] as stored in members.equipment/inventory/bank. */
function itemIds(pairs: number[] | null | undefined): number[] {
  const ids: number[] = [];
  for (let i = 0; pairs && i < pairs.length; i += 2) if (pairs[i] > 0) ids.push(pairs[i]);
  return ids;
}

async function fetchGroup() {
  const { BACKEND_URL, GROUP_NAME, GROUP_TOKEN } = process.env;
  if (!BACKEND_URL || !GROUP_NAME || !GROUP_TOKEN) {
    throw new Error("set BACKEND_URL, GROUP_NAME and GROUP_TOKEN (dps/.env or the environment)");
  }

  const from = "2000-01-01T00:00:00Z";
  const url =
    `${BACKEND_URL}/api/group/${GROUP_NAME}/get-group-data` +
    `?from_time=${from}&include_heavy=true&heavy_from_time=${from}`;
  const response = await fetch(url, { headers: { Authorization: GROUP_TOKEN } });
  if (!response.ok) throw new Error(`get-group-data returned ${response.status}`);
  return (await response.json()) as { name: string; bank?: number[]; equipment?: number[]; inventory?: number[] }[];
}

function printPlan(plan: SwitchPlan) {
  console.log(`\n  ${plan.score.toFixed(3)} avg dps, gear takes ${plan.switches} inventory slot(s)\n`);
  console.log("  WEAR");
  for (const [slot, name] of Object.entries(plan.worn)) console.log(`    ${slot.padEnd(7)} ${name}`);
  console.log(`\n  CARRY  ${plan.carried.map((c) => c.name).join(", ") || "nothing"}\n`);
  console.log("  PER FIGHT");
  for (const fight of plan.perMonster) {
    const swap = fight.swapsFromWorn.length ? `  swap: ${fight.swapsFromWorn.join(", ")}` : "";
    console.log(`    ${fight.monster.padEnd(20)} ${fight.dps.toFixed(2).padStart(6)} dps  ${fight.weapon}${swap}`);
  }
}

async function main() {
  loadEnv();

  // --find is a lookup, not a plan: monster names have to match the wiki's
  // exactly, and guessing them is the first thing that goes wrong.
  const find = arg("find");
  if (find) {
    const { getMonsters } = await import("@/lib/Monsters");
    const matches = getMonsters().filter((m) => m.name.toLowerCase().includes(find.toLowerCase()));
    if (matches.length === 0) console.log(`nothing matches "${find}"`);
    for (const m of matches.slice(0, 40)) {
      console.log(`  ${m.name}${m.version ? `  [${m.version}]` : ""}  hp ${m.skills.hp}`);
    }
    if (matches.length > 40) console.log(`  ... and ${matches.length - 40} more`);
    return;
  }

  const memberName = arg("member");
  const targetNames = (arg("targets") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!memberName || targetNames.length === 0) {
    console.log("usage: npm run plan -- --member <name> --targets <a,b,c> [--budget 4] [--curve] [--lock <names>]");
    console.log("       npm run plan -- --find <monster>");
    process.exitCode = 1;
    return;
  }

  const group = await fetchGroup();
  const member = group.find((m) => m.name.toLowerCase() === memberName.toLowerCase());
  if (!member) throw new Error(`no member "${memberName}" -- have: ${group.map((m) => m.name).join(", ")}`);

  const owned = [
    ...new Set([...itemIds(member.bank), ...itemIds(member.equipment), ...itemIds(member.inventory)]),
  ];

  const targets: MonsterTarget[] = targetNames.map((name) => {
    const monster = findMonster(name);
    if (!monster) throw new Error(`unknown monster "${name}" -- try: npm run plan -- --find ${name.split(" ")[0]}`);
    return { monster };
  });

  // Locks are given by name because nobody knows item ids by heart.
  const lockedIds = (arg("lock") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => {
      const match = owned.find((id) => equipmentById(id)?.name.toLowerCase() === name.toLowerCase());
      if (!match) throw new Error(`"${name}" is not equipment ${member.name} owns`);
      return match;
    });

  const budget = Number(arg("budget") ?? 4);
  const options = {
    maxSwitches: budget,
    lockedIds,
    prayers: [Prayer.RIGOUR, Prayer.PIETY, Prayer.AUGURY],
    maxWeapons: Number(arg("weapons") ?? 12),
    candidatesPerMonster: 6,
  };

  console.log(
    `\n${member.name}: ${owned.length} owned ids, ${targets.length} target(s)` +
      `${lockedIds.length ? `, locking ${lockedIds.map((id) => equipmentById(id)!.name).join(", ")}` : ""}`
  );
  console.log("NOTE: levels are assumed maxed, and nothing here knows about raid mechanics or positioning.");

  if (has("curve")) {
    const steps = budgetCurve(owned, targets, options);
    console.log("\n  switches | avg dps | this slot buys | carrying");
    for (const step of steps) {
      const sign = step.marginal >= 0 ? "+" : "";
      console.log(
        `     ${String(step.budget).padStart(2)}    |  ${step.plan.score.toFixed(3)}  |     ${sign}${step.marginal.toFixed(3)}     | ` +
          `${step.plan.carried.map((c) => c.name).join(", ") || "-"}`
      );
    }
    const fewest = fewestSwitchesFor(steps);
    console.log(`\n  fewest worth taking: ${fewest.budget}`);
    printPlan(fewest.plan);
    return;
  }

  printPlan(planSwitches(owned, targets, options));
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
