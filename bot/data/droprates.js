// Curated seed list of boss unique drop rates, for the dry-streak feature.
// Keyed by WOM's own boss metric key (https://wiseoldman.net) so it lines
// up directly with what /wom-boss-kc returns -- no separate name mapping
// needed. Rates verified against the OSRS Wiki's drop tables; not every
// boss in the game is covered here, just a starting set. Ask to add more.
//
// `rate` is the 1-in-N chance per kill for a *simple* independent roll.
// Some items don't actually work that way (pity timers, contribution-based
// scaling, etc.) -- those are marked with `note`, and the geometric-decay
// math should be treated as a rough approximation for them, not a real
// probability.
module.exports = {
  zulrah: {
    displayName: 'Zulrah',
    uniques: [
      { name: "Tanzanite fang", rate: 512 },
      { name: "Magic fang", rate: 512 },
      { name: "Serpentine visage", rate: 512 },
      { name: "Uncut onyx", rate: 512 },
    ],
  },
  vorkath: {
    displayName: 'Vorkath',
    uniques: [
      {
        name: "Vorkath's head",
        rate: 50,
        note: 'guaranteed by the 50th kill if not received earlier -- not a pure random roll',
      },
      { name: 'Draconic visage', rate: 5000 },
      { name: 'Skeletal visage', rate: 5000 },
      { name: 'Jar of decay', rate: 3000 },
      { name: 'Vorki', rate: 3000 },
      { name: 'Dragonbone necklace', rate: 1000 },
    ],
  },
  cerberus: {
    displayName: 'Cerberus',
    uniques: [
      { name: 'Primordial crystal', rate: 520 },
      { name: 'Pegasian crystal', rate: 520 },
      { name: 'Eternal crystal', rate: 520 },
      { name: 'Smouldering stone', rate: 520 },
    ],
  },
  alchemical_hydra: {
    displayName: 'Alchemical Hydra',
    uniques: [
      { name: "Hydra's eye", rate: 181.1 },
      { name: "Hydra's fang", rate: 181.1 },
      { name: "Hydra's heart", rate: 181.1 },
      { name: 'Hydra tail', rate: 513 },
      { name: 'Hydra leather', rate: 514 },
      { name: "Hydra's claw", rate: 1001 },
    ],
  },
  nex: {
    displayName: 'Nex',
    uniques: [
      { name: 'Ancient hilt', rate: 516 },
      { name: 'Nihil horn', rate: 258 },
      { name: 'Torva full helm (damaged)', rate: 258 },
      { name: 'Torva platebody (damaged)', rate: 258 },
      { name: 'Torva platelegs (damaged)', rate: 258 },
      { name: 'Zaryte vambraces', rate: 172 },
    ],
  },
  phosanis_nightmare: {
    displayName: "Phosani's Nightmare",
    uniques: [
      { name: "Inquisitor's great helm", rate: 700 },
      { name: "Inquisitor's hauberk", rate: 700 },
      { name: "Inquisitor's plateskirt", rate: 700 },
      { name: 'Eldritch orb', rate: 1600 },
      { name: 'Harmonised orb', rate: 1600 },
      { name: 'Volatile orb', rate: 1600 },
      { name: 'Little nightmare', rate: 1400 },
      { name: 'Jar of dreams', rate: 4000 },
    ],
  },
  yama: {
    displayName: 'Yama',
    uniques: [
      {
        name: 'Oathplate helm',
        rate: 600,
        note: 'contribution-scaled, not a flat per-kill roll -- treat this estimate loosely',
      },
      {
        name: 'Oathplate chest',
        rate: 600,
        note: 'contribution-scaled, not a flat per-kill roll -- treat this estimate loosely',
      },
      {
        name: 'Oathplate legs',
        rate: 600,
        note: 'contribution-scaled, not a flat per-kill roll -- treat this estimate loosely',
      },
      {
        name: 'Soulflame horn',
        rate: 300,
        note: 'contribution-scaled, not a flat per-kill roll -- treat this estimate loosely',
      },
    ],
  },
};
