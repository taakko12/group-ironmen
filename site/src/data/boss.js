// WOM's Boss metric enum (https://docs.wiseoldman.net/api/global-type-definitions).
// Keep in sync with server/src/wom.rs's WOM_BOSS_METRICS.
const BOSS_METRICS = [
  "abyssal_sire",
  "alchemical_hydra",
  "amoxliatl",
  "araxxor",
  "artio",
  "barrows_chests",
  "brutus",
  "bryophyta",
  "callisto",
  "calvarion",
  "cerberus",
  "chambers_of_xeric",
  "chambers_of_xeric_challenge_mode",
  "chaos_elemental",
  "chaos_fanatic",
  "commander_zilyana",
  "corporeal_beast",
  "crazy_archaeologist",
  "dagannoth_prime",
  "dagannoth_rex",
  "dagannoth_supreme",
  "deranged_archaeologist",
  "doom_of_mokhaiotl",
  "duke_sucellus",
  "general_graardor",
  "giant_mole",
  "grotesque_guardians",
  "hespori",
  "kalphite_queen",
  "king_black_dragon",
  "kraken",
  "kreearra",
  "kril_tsutsaroth",
  "lunar_chests",
  "mad_angel",
  "maggot_king",
  "mimic",
  "nex",
  "nightmare",
  "phosanis_nightmare",
  "obor",
  "phantom_muspah",
  "sarachnis",
  "scorpia",
  "scurrius",
  "shellbane_gryphon",
  "skotizo",
  "sol_heredit",
  "spindel",
  "tempoross",
  "the_gauntlet",
  "the_corrupted_gauntlet",
  "the_hueycoatl",
  "the_leviathan",
  "the_royal_titans",
  "the_whisperer",
  "theatre_of_blood",
  "theatre_of_blood_hard_mode",
  "thermonuclear_smoke_devil",
  "tombs_of_amascut",
  "tombs_of_amascut_expert",
  "tzkal_zuk",
  "tztok_jad",
  "vardorvis",
  "venenatis",
  "vetion",
  "vorkath",
  "wintertodt",
  "yama",
  "zalcano",
  "zulrah",
];

function bossDisplayName(metric) {
  return metric
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Same fight, just a harder/expert-mode variant -- WOM tracks these as
// separate metrics, but picking the base boss here combines both into one
// KC line instead of making you track the variant separately. Keyed by the
// metric that represents the pair in the boss picker; the array is every
// WOM metric whose KC gets summed together.
const BOSS_PAIRS = {
  nightmare: ["nightmare", "phosanis_nightmare"],
  chambers_of_xeric: ["chambers_of_xeric", "chambers_of_xeric_challenge_mode"],
  theatre_of_blood: ["theatre_of_blood", "theatre_of_blood_hard_mode"],
  tombs_of_amascut: ["tombs_of_amascut", "tombs_of_amascut_expert"],
  the_gauntlet: ["the_gauntlet", "the_corrupted_gauntlet"],
};
// The non-primary half of each pair (e.g. phosanis_nightmare) is dropped
// from the picker below -- selecting the primary already includes it.
const secondaryPairedMetrics = new Set(Object.values(BOSS_PAIRS).flatMap((group) => group.slice(1)));

function metricsForBoss(metric) {
  return BOSS_PAIRS[metric] ?? [metric];
}

function labelForBoss(metric) {
  const group = BOSS_PAIRS[metric];
  return group ? group.map(bossDisplayName).join(" + ") : bossDisplayName(metric);
}

const BOSSES = BOSS_METRICS.filter((metric) => !secondaryPairedMetrics.has(metric))
  .map((metric) => ({ metric, name: labelForBoss(metric) }))
  .sort((a, b) => a.name.localeCompare(b.name));

export { BOSS_METRICS, BOSSES, bossDisplayName, metricsForBoss, labelForBoss };
