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

const BOSSES = BOSS_METRICS.map((metric) => ({ metric, name: bossDisplayName(metric) })).sort((a, b) =>
  a.name.localeCompare(b.name)
);

export { BOSS_METRICS, BOSSES, bossDisplayName };
