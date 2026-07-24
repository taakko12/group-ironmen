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
  doom_of_mokhaiotl: {
    displayName: 'Doom of Mokhaiotl',
    uniques: [
      {
        name: 'Dom',
        rate: 250,
        note: 'rate improves with delve depth (1/1,000 at delve 6 up to 1/250 at delve 9+) -- this uses the best-case rate',
      },
      {
        name: 'Avernic treads',
        rate: 540,
        note: 'rate improves with delve depth (1/1,350 at delve 4 up to 1/540 at delve 9+) -- this uses the best-case rate',
      },
      {
        name: 'Eye of ayak (uncharged)',
        rate: 540,
        note: 'rate improves with delve depth (1/2,000 at delve 3 up to 1/540 at delve 9+) -- this uses the best-case rate',
      },
      {
        name: 'Mokhaiotl cloth',
        rate: 540,
        note: 'rate improves with delve depth (1/2,500 at delve 2 up to 1/540 at delve 9+) -- this uses the best-case rate',
      },
    ],
  },
  duke_sucellus: {
    displayName: 'Duke Sucellus',
    uniques: [
      { name: 'Baron', rate: 2500 },
      { name: 'Eye of the duke', rate: 720 },
      { name: 'Virtus mask', rate: 2160 },
      { name: 'Virtus robe top', rate: 2160 },
      { name: 'Virtus robe bottom', rate: 2160 },
      { name: 'Magus vestige', rate: 720 },
      {
        name: 'Ice quartz',
        rate: 50,
        note: 'ramps up from ~1/200 toward 1/50 over your first ~300 kills without one -- this uses the settled rate',
      },
      {
        name: 'Frozen tablet',
        rate: 25.8,
        note: 'gets more common the longer you go without one -- this uses an approximate settled rate',
      },
      { name: 'Chromium ingot', rate: 240 },
      { name: "Awakener's orb", rate: 48.5 },
    ],
  },
  tztok_jad: {
    displayName: 'The Fight Caves (TzTok-Jad)',
    uniques: [
      {
        name: 'Tzrek-jad',
        rate: 200,
        note: '1/100 instead if done on a Slayer task; can also trade in a fire cape for another 1/200 shot',
      },
      { name: 'Fire cape', rate: 1, note: 'guaranteed for clearing the Fight Caves, not a random drop' },
    ],
  },
  tzkal_zuk: {
    displayName: 'The Inferno (TzKal-Zuk)',
    uniques: [
      {
        name: 'Jal-nib-rek',
        rate: 100,
        note: '1/75 instead on a TzHaar Slayer task; trading in old infernal capes gives extra shots',
      },
      { name: 'Infernal cape', rate: 1, note: 'guaranteed for clearing the Inferno, not a random drop' },
    ],
  },
  sol_heredit: {
    displayName: 'Sol Heredit (Fortis Colosseum)',
    uniques: [
      {
        name: 'Smol heredit',
        rate: 200,
        note: 'obtained by trading a Dizana\'s quiver to Minimus for an extra 1/200 shot -- the wiki gives no other clean flat rate for it or the armour pieces (they scale up per wave cleared from wave 4 onward), so treat this whole entry loosely',
      },
    ],
  },
  the_gauntlet: {
    displayName: 'The Gauntlet',
    uniques: [
      { name: 'Youngllef', rate: 2000 },
      { name: 'Crystal armour seed', rate: 120 },
      { name: 'Crystal weapon seed', rate: 120 },
      { name: 'Enhanced crystal weapon seed', rate: 2000 },
    ],
  },
  the_corrupted_gauntlet: {
    displayName: 'The Corrupted Gauntlet',
    uniques: [
      { name: 'Youngllef', rate: 800 },
      { name: 'Crystal armour seed', rate: 50 },
      { name: 'Crystal weapon seed', rate: 50 },
      { name: 'Enhanced crystal weapon seed', rate: 400 },
      { name: 'Gauntlet cape', rate: 1, note: 'guaranteed on completion, not a random drop' },
    ],
  },
  general_graardor: {
    displayName: 'General Graardor',
    uniques: [
      { name: 'Pet general graardor', rate: 5000 },
      { name: 'Bandos chestplate', rate: 381 },
      { name: 'Bandos tassets', rate: 381 },
      { name: 'Bandos boots', rate: 381 },
      { name: 'Bandos hilt', rate: 508 },
      { name: 'Godsword shard 1', rate: 762 },
      { name: 'Godsword shard 2', rate: 762 },
      { name: 'Godsword shard 3', rate: 762 },
    ],
  },
  giant_mole: {
    displayName: 'Giant Mole',
    uniques: [
      { name: 'Baby mole', rate: 3000 },
      { name: 'Immaculate mole skin', rate: 50 },
    ],
  },
  grotesque_guardians: {
    displayName: 'Grotesque Guardians',
    uniques: [
      { name: 'Noon', rate: 3000 },
      { name: 'Jar of stone', rate: 5000 },
      { name: 'Black tourmaline core', rate: 500 },
      { name: 'Granite gloves', rate: 250 },
      { name: 'Granite ring', rate: 250 },
      { name: 'Granite hammer', rate: 375 },
    ],
  },
  hespori: {
    displayName: 'Hespori',
    uniques: [
      { name: 'Bottomless compost bucket', rate: 35 },
      { name: 'Iasor seed', rate: 3 },
      { name: 'Kronos seed', rate: 3 },
      { name: 'Attas seed', rate: 3 },
    ],
  },
  the_hueycoatl: {
    displayName: 'The Hueycoatl',
    uniques: [
      { name: 'Huberte', rate: 400, note: 'rate scales with your personal contribution to the kill' },
      { name: 'Dragon hunter wand', rate: 105 },
      { name: 'Tome of earth (empty)', rate: 90 },
      { name: 'Soiled page', rate: 13.6 },
      { name: 'Hueycoatl hide', rate: 28.6, note: 'drops 3 at a time when rolled' },
      { name: 'Huasca seed', rate: 34 },
    ],
  },
  kalphite_queen: {
    displayName: 'Kalphite Queen',
    uniques: [
      { name: 'Kalphite princess', rate: 3000 },
      { name: 'Kq head', rate: 128 },
      { name: 'Jar of sand', rate: 2000 },
      { name: 'Dragon 2h sword', rate: 256 },
      { name: 'Dragon chainbody', rate: 128 },
      { name: 'Dragon pickaxe', rate: 400 },
    ],
  },
  king_black_dragon: {
    displayName: 'King Black Dragon',
    uniques: [
      { name: 'Prince black dragon', rate: 3000 },
      { name: 'Kbd heads', rate: 128 },
      { name: 'Dragon pickaxe', rate: 1000 },
      { name: 'Draconic visage', rate: 5000 },
    ],
  },
  kraken: {
    displayName: 'Kraken',
    uniques: [
      { name: 'Pet kraken', rate: 3000 },
      { name: 'Kraken tentacle', rate: 400 },
      { name: 'Trident of the seas (full)', rate: 512 },
      { name: 'Jar of dirt', rate: 1000 },
    ],
  },
  kreearra: {
    displayName: "Kree'arra",
    uniques: [
      { name: "Pet kree'arra", rate: 5000 },
      { name: 'Armadyl helmet', rate: 381 },
      { name: 'Armadyl chestplate', rate: 381 },
      { name: 'Armadyl chainskirt', rate: 381 },
      { name: 'Armadyl hilt', rate: 508 },
      { name: 'Godsword shard 1', rate: 762 },
      { name: 'Godsword shard 2', rate: 762 },
      { name: 'Godsword shard 3', rate: 762 },
    ],
  },
  kril_tsutsaroth: {
    displayName: "K'ril Tsutsaroth",
    uniques: [
      { name: "Pet k'ril tsutsaroth", rate: 5000 },
      { name: 'Staff of the dead', rate: 508 },
      { name: 'Zamorakian spear', rate: 127 },
      { name: 'Steam battlestaff', rate: 127 },
      { name: 'Zamorak hilt', rate: 508 },
      { name: 'Godsword shard 1', rate: 762 },
      { name: 'Godsword shard 2', rate: 762 },
      { name: 'Godsword shard 3', rate: 762 },
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
