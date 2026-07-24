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
  abyssal_sire: {
    displayName: 'Abyssal Sire',
    uniques: [
      { name: 'Unsired', rate: 100 },
      // The rest of the collection log page (abyssal head, bludgeon pieces,
      // jar of miasma, dagger, whip, orphan pet) come from exchanging an
      // Unsired at the Font of Consumption, not directly from the kill.
      // The wiki's stated per-reward weights didn't sum to a coherent total
      // when checked, so they're left out rather than guessed at -- ask to
      // have these re-sourced properly.
    ],
  },
  amoxliatl: {
    displayName: 'Amoxliatl',
    uniques: [
      { name: 'Moxi', rate: 3000 },
      { name: 'Glacial temotli', rate: 100 },
      { name: 'Pendant of ates (inert)', rate: 25 },
      // Frozen tear drops multiple at once on a weighted quantity roll, not
      // a simple presence/absence chance -- no single "rate" applies.
    ],
  },
  araxxor: {
    displayName: 'Araxxor',
    uniques: [
      { name: 'Nid', rate: 3000, note: 'rate doubles to 1/1,500 if destroying the corpse instead of looting it' },
      { name: 'Araxyte fang', rate: 600 },
      { name: 'Noxious point', rate: 200 },
      { name: 'Noxious blade', rate: 200 },
      { name: 'Noxious pommel', rate: 200 },
      { name: 'Araxyte head', rate: 250 },
      { name: 'Jar of venom', rate: 1500 },
      {
        name: 'Coagulated venom',
        rate: 1,
        note: 'guaranteed on a fast enough kill (under 1:15) the first time -- not a random roll',
      },
    ],
  },
  barrows_chests: {
    displayName: 'Barrows',
    uniques: [
      {
        name: "Dharok's platebody",
        rate: 350.14,
        note: 'Barrows uses a reward-potential system based on combat levels killed + brothers slain, not a flat per-chest roll -- this rate is only accurate at max reward potential (all 6 brothers, full crypt clear)',
      },
      {
        name: 'Bolt rack',
        rate: 8.1,
        note: 'reward-potential based (see above), only accurate near max potential',
      },
    ],
  },
  brutus: {
    displayName: 'Brutus',
    uniques: [
      { name: 'Beef', rate: 1000 },
      { name: 'Mooleta', rate: 30 },
      { name: 'Bottomless milk bucket (empty)', rate: 37.5 },
      { name: 'Cow slippers', rate: 150 },
    ],
  },
  bryophyta: {
    displayName: 'Bryophyta',
    uniques: [
      {
        name: "Bryophyta's essence",
        rate: 118,
        note: "obtained from Bryophyta's chest (needs a mossy key to enter), not a direct kill drop",
      },
    ],
  },
  callisto: {
    displayName: 'Callisto',
    uniques: [
      { name: 'Callisto cub', rate: 1500 },
      { name: 'Tyrannical ring', rate: 512 },
      { name: 'Dragon pickaxe', rate: 256 },
      { name: 'Dragon 2h sword', rate: 256 },
      { name: 'Claws of callisto', rate: 196 },
      { name: 'Voidwaker hilt', rate: 360 },
    ],
  },
  artio: {
    displayName: 'Artio',
    uniques: [
      { name: 'Callisto cub', rate: 2800 },
      { name: 'Tyrannical ring', rate: 716 },
      { name: 'Dragon pickaxe', rate: 358 },
      { name: 'Dragon 2h sword', rate: 358 },
      { name: 'Claws of callisto', rate: 618 },
      { name: 'Voidwaker hilt', rate: 912 },
    ],
  },
  commander_zilyana: {
    displayName: 'Commander Zilyana',
    uniques: [
      { name: 'Pet zilyana', rate: 5000 },
      { name: 'Armadyl crossbow', rate: 508 },
      { name: 'Saradomin hilt', rate: 508 },
      { name: 'Saradomin sword', rate: 127 },
      { name: "Saradomin's light", rate: 254 },
      { name: 'Godsword shard 1', rate: 762 },
      { name: 'Godsword shard 2', rate: 762 },
      { name: 'Godsword shard 3', rate: 762 },
    ],
  },
  corporeal_beast: {
    displayName: 'Corporeal Beast',
    uniques: [
      { name: 'Pet dark core', rate: 5000 },
      {
        name: 'Elysian sigil',
        rate: 4095,
        note: 'shared/contested loot -- only the player with top damage gets kill credit',
      },
      { name: 'Spectral sigil', rate: 1365, note: 'shared/contested loot -- only top damage gets kill credit' },
      { name: 'Arcane sigil', rate: 1365, note: 'shared/contested loot -- only top damage gets kill credit' },
      { name: 'Holy elixir', rate: 170.7 },
      { name: 'Spirit shield', rate: 64 },
      { name: 'Jar of spirits', rate: 1000 },
    ],
  },
  crazy_archaeologist: {
    displayName: 'Crazy Archaeologist',
    uniques: [
      { name: 'Odium shard 2', rate: 256 },
      { name: 'Malediction shard 2', rate: 256 },
      { name: 'Fedora', rate: 128 },
    ],
  },
  dagannoth_prime: {
    displayName: 'Dagannoth Prime',
    uniques: [
      { name: 'Pet dagannoth prime', rate: 5000 },
      { name: 'Seers ring', rate: 128 },
      { name: 'Mud battlestaff', rate: 128 },
    ],
  },
  dagannoth_rex: {
    displayName: 'Dagannoth Rex',
    uniques: [
      { name: 'Pet dagannoth rex', rate: 5000 },
      { name: 'Berserker ring', rate: 128 },
      { name: 'Warrior ring', rate: 128 },
      { name: 'Dragon axe', rate: 128 },
    ],
  },
  dagannoth_supreme: {
    displayName: 'Dagannoth Supreme',
    uniques: [
      { name: 'Pet dagannoth supreme', rate: 5000 },
      { name: 'Archers ring', rate: 128 },
      { name: 'Seercull', rate: 128 },
    ],
  },
  deranged_archaeologist: {
    displayName: 'Deranged Archaeologist',
    uniques: [{ name: 'Steel ring', rate: 43.7 }],
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
