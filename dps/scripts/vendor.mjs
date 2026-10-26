// Pulls the OSRS Wiki calculator's math into vendor/ so this service can use
// it without reimplementing the combat formulas, which are a swamp of special
// cases and get patched every time Jagex touches the game.
//
// Only src/lib, src/types, src/enums and src/utils.ts come across -- the
// Next.js/React app on top is the part we throw away. Those files are almost
// framework-free already; the exceptions are handled by substituting their
// imports rather than deleting the code that uses them, so an upstream
// refactor doesn't silently chop out half a file:
//
//   next/image         -> a local `type StaticImageData = unknown`
//   @/public/img/*.png -> a local `const Name: unknown = undefined`
//
// PotionMap and PrayerMap keep their shape, just with undefined icons, which
// nothing in the DPS path reads.
//
// UPSTREAM is pinned deliberately. Their main branch moves daily and the
// formulas change with game updates, so a float that shifts under us should
// be a visible version bump with the validation suite re-run, never a
// surprise on a Tuesday.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const UPSTREAM = "https://github.com/weirdgloop/osrs-dps-calc.git";
const PINNED = "c446f2e1027a5d0f7ced0d961f3e5ee22fecf2e7";
const COPY = ["src/lib", "src/types", "src/enums", "src/utils.ts", "src/tests"];
const DATA = ["equipment.json", "monsters.json", "equipment_aliases.json", "spells.json"];

const root = path.resolve(import.meta.dirname, "..");
const vendor = path.join(root, "vendor");
// cdn/json, not data/: the vendored lib imports these by relative path
// ('../../cdn/json/equipment.json'), so the layout has to match upstream's.
const data = path.join(root, "cdn/json");
const checkout = path.join(root, ".calc-checkout");

function run(cmd, args, cwd) {
  execFileSync(cmd, args, { cwd, stdio: "inherit" });
}

// A fixed commit means a shallow clone is not enough; fetch just that object.
if (!fs.existsSync(checkout)) {
  fs.mkdirSync(checkout, { recursive: true });
  run("git", ["init", "-q"], checkout);
  run("git", ["remote", "add", "origin", UPSTREAM], checkout);
}
run("git", ["fetch", "-q", "--depth", "1", "origin", PINNED], checkout);
run("git", ["checkout", "-q", "FETCH_HEAD"], checkout);

function patch(source) {
  return (
    source
      .replace(/^import\s*\{\s*StaticImageData\s*\}\s*from\s*'next\/image';?$/gm, "type StaticImageData = unknown;")
      .replace(/^import\s+(\w+)\s+from\s+'@\/public\/[^']*';?$/gm, "const $1: unknown = undefined;")
      // Upstream's claws.test.ts puts a bare expect() inside a describe with
      // no test() around it. Jest runs that at collection and reports nothing;
      // vitest runs it too but errors on the empty suite. Promoting it to a
      // real test keeps the assertion and makes it actually count.
      .replace(/\bdescribe\((['"])max melee max hit\1/, "test($1max melee max hit$1")
  );
}

function copyInto(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (fs.statSync(from).isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from)) copyInto(path.join(from, entry), path.join(to, entry));
    return;
  }
  const body = from.endsWith(".ts") ? patch(fs.readFileSync(from, "utf8")) : fs.readFileSync(from);
  fs.writeFileSync(to, body);
}

fs.rmSync(vendor, { recursive: true, force: true });
for (const target of COPY) copyInto(path.join(checkout, target), path.join(vendor, target.replace(/^src\//, "")));

// Upstream's test utils import generateEmptyPlayer from '@/state' -- the one
// file we cannot take, because it is the mobx store. Pointing it at our own
// defaults instead means their suite validates the Player we actually build.
fs.writeFileSync(
  path.join(vendor, "state.ts"),
  `// Written by scripts/vendor.mjs -- see src/playerDefaults.ts.\nexport { generateEmptyPlayer } from "../src/playerDefaults";\n`
);

fs.mkdirSync(data, { recursive: true });
for (const file of DATA) fs.copyFileSync(path.join(checkout, "cdn/json", file), path.join(data, file));

// Anything still reaching for the Next app is a file we should not have taken.
const leaks = [];
for (const file of fs.readdirSync(vendor, { recursive: true })) {
  const full = path.join(vendor, file);
  if (!file.endsWith(".ts") || !fs.statSync(full).isFile()) continue;
  const body = fs.readFileSync(full, "utf8");
  for (const bad of ["next/image", "@/public/", "react", "mobx"]) {
    if (body.includes(`'${bad}`) || body.includes(`"${bad}`)) leaks.push(`${file}: ${bad}`);
  }
}
if (leaks.length) {
  console.error("Framework imports survived vendoring:\n  " + leaks.join("\n  "));
  process.exit(1);
}

const counts = fs.readdirSync(vendor, { recursive: true }).filter((f) => f.endsWith(".ts")).length;
console.log(`vendored ${counts} files from osrs-dps-calc@${PINNED.slice(0, 9)} + ${DATA.length} data files`);
