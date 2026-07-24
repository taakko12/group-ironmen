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
  the_leviathan: {
    displayName: 'The Leviathan',
    uniques: [
      { name: "Lil'viathan", rate: 2500 },
      { name: "Leviathan's lure", rate: 768 },
      { name: 'Virtus mask', rate: 2304 },
      { name: 'Virtus robe top', rate: 2304 },
      { name: 'Virtus robe bottom', rate: 2304 },
      { name: 'Venator vestige', rate: 768 },
      { name: 'Smoke quartz', rate: 50, note: 'ramps up from ~1/200 toward 1/50 over your first ~300 kills -- settled rate' },
      { name: 'Scarred tablet', rate: 25.8, note: 'gets more common the longer you go without one -- approximate settled rate' },
      { name: 'Chromium ingot', rate: 256 },
      { name: "Awakener's orb", rate: 53.6 },
    ],
  },
  maggot_king: {
    displayName: 'Maggot King',
    uniques: [
      { name: 'Maggot marquess', rate: 3500, note: 'requires choosing the "Open-stomach" loot option, not "Take-eggs"' },
      { name: 'Crimson kisten', rate: 520, note: 'requires choosing the "Open-stomach" loot option' },
      { name: 'Elder venator fang', rate: 340, note: 'requires choosing the "Open-stomach" loot option' },
    ],
  },
  nightmare: {
    displayName: 'The Nightmare',
    uniques: [
      {
        name: "Inquisitor's mace",
        rate: 750,
        note: 'rate worsens with larger party size (up to ~1/429 solo down to lower for big groups) -- this uses the small-group end',
      },
      {
        name: "Inquisitor's great helm",
        rate: 420,
        note: 'rate worsens with larger party size -- this uses the small-group end',
      },
      {
        name: "Inquisitor's hauberk",
        rate: 420,
        note: 'rate worsens with larger party size -- this uses the small-group end',
      },
      {
        name: "Inquisitor's plateskirt",
        rate: 420,
        note: 'rate worsens with larger party size -- this uses the small-group end',
      },
      {
        name: 'Nightmare staff',
        rate: 300,
        note: 'rate worsens with larger party size -- this uses the small-group end',
      },
      {
        name: 'Volatile orb',
        rate: 960,
        note: 'rate worsens with larger party size -- this uses the small-group end',
      },
      {
        name: 'Harmonised orb',
        rate: 960,
        note: 'rate worsens with larger party size -- this uses the small-group end',
      },
      {
        name: 'Eldritch orb',
        rate: 960,
        note: 'rate worsens with larger party size -- this uses the small-group end',
      },
      {
        name: 'Little nightmare',
        rate: 800,
        note: 'rate worsens with larger party size (up to 1/4,000 for big groups) -- this uses the solo/small-group end',
      },
      { name: 'Jar of dreams', rate: 1900 },
    ],
  },
  obor: {
    displayName: 'Obor',
    uniques: [
      // Hill giant club comes from the chest opened with a giant key (a
      // 1/128 drop from regular hill giants, 1/64 in the Wilderness) -- the
      // wiki doesn't publish a clean rate for the club itself inside that
      // chest, so it's left out rather than guessed at.
    ],
  },
  phantom_muspah: {
    displayName: 'Phantom Muspah',
    uniques: [
      { name: 'Muphin', rate: 2500, note: 'guaranteed instead if the kill takes under 3 minutes' },
      { name: 'Venator shard', rate: 100 },
      { name: 'Ancient icon', rate: 50 },
      { name: 'Frozen cache', rate: 25 },
    ],
  },
  royal_titans: {
    displayName: 'Royal Titans',
    uniques: [
      { name: 'Bran', rate: 1500 },
      { name: 'Giantsoul amulet (uncharged)', rate: 16 },
      { name: 'Ice element staff crown', rate: 75, note: "Eldric the Ice King's drop specifically" },
      { name: 'Fire element staff crown', rate: 75, note: "Branda the Fire Queen's drop specifically" },
      { name: 'Deadeye prayer scroll', rate: 75, note: "Eldric the Ice King's drop specifically, one-time (consumed on reading)" },
      { name: 'Mystic vigour prayer scroll', rate: 75, note: "Branda the Fire Queen's drop specifically, one-time (consumed on reading)" },
    ],
  },
  sarachnis: {
    displayName: 'Sarachnis',
    uniques: [
      { name: 'Sraracha', rate: 3000 },
      { name: 'Jar of eyes', rate: 2000 },
      { name: 'Giant egg sac(full)', rate: 20 },
      { name: 'Sarachnis cudgel', rate: 384 },
      { name: 'Pristine spider silk', rate: 50 },
    ],
  },
  scorpia: {
    displayName: 'Scorpia',
    uniques: [
      { name: "Scorpia's offspring", rate: 2015.75 },
      { name: 'Odium shard 3', rate: 256 },
      { name: 'Malediction shard 3', rate: 256 },
      { name: 'Dragon 2h sword', rate: 128 },
    ],
  },
  scurrius: {
    displayName: 'Scurrius',
    uniques: [
      { name: 'Scurry', rate: 3000, note: 'only the top-damage player rolls for the pet' },
      { name: "Scurrius' spine", rate: 33, note: 'only the top-damage player per kill can receive this' },
    ],
  },
  shellbane_gryphon: {
    displayName: 'Shellbane Gryphon',
    uniques: [
      { name: 'Gull', rate: 3000 },
      { name: 'Jar of feathers', rate: 2000 },
      { name: "Belle's folly (tarnished)", rate: 75 },
    ],
  },
  skotizo: {
    displayName: 'Skotizo',
    uniques: [
      { name: 'Skotos', rate: 65 },
      { name: 'Jar of darkness', rate: 200 },
      { name: 'Dark claw', rate: 25 },
      { name: 'Dark totem', rate: 128 },
      { name: 'Uncut onyx', rate: 1000 },
    ],
  },
  tempoross: {
    displayName: 'Tempoross',
    uniques: [
      {
        name: 'Tiny tempor',
        rate: 8000,
        note: 'reward permits are points-based (fishing/repairing/etc.), not per-kill -- rate is per permit spent',
      },
      { name: 'Big harpoonfish', rate: 1600, note: 'points-based reward permit system, not per-kill' },
      { name: 'Tome of water (empty)', rate: 1600, note: 'points-based reward permit system, not per-kill' },
      { name: 'Tackle box', rate: 400, note: 'points-based reward permit system, not per-kill' },
      { name: 'Fish barrel', rate: 400, note: 'points-based reward permit system, not per-kill' },
      { name: 'Dragon harpoon', rate: 8000, note: 'points-based reward permit system, not per-kill' },
      // Spirit angler outfit pieces don't have a published rate.
    ],
  },
  thermonuclear_smoke_devil: {
    displayName: 'Thermonuclear Smoke Devil',
    uniques: [
      { name: 'Pet smoke devil', rate: 3000 },
      { name: 'Occult necklace', rate: 350 },
      { name: 'Smoke battlestaff', rate: 512 },
      { name: 'Dragon chainbody', rate: 2000 },
      { name: 'Jar of smoke', rate: 2000 },
    ],
  },
  vardorvis: {
    displayName: 'Vardorvis',
    uniques: [
      { name: 'Butch', rate: 3000 },
      { name: "Executioner's axe head", rate: 1088 },
      { name: 'Virtus mask', rate: 3264 },
      { name: 'Virtus robe top', rate: 3264 },
      { name: 'Virtus robe bottom', rate: 3264 },
      { name: 'Ultor vestige', rate: 1088 },
      { name: 'Blood quartz', rate: 50, note: 'ramps up from ~1/200 toward 1/50 over your first ~300 kills -- settled rate' },
      { name: 'Strangled tablet', rate: 25.5, note: 'gets more common the longer you go without one -- approximate settled rate' },
      { name: 'Chromium ingot', rate: 363 },
      { name: "Awakener's orb", rate: 80.6 },
    ],
  },
  venenatis: {
    displayName: 'Venenatis',
    uniques: [
      { name: 'Venenatis spiderling', rate: 1500 },
      { name: 'Treasonous ring', rate: 512 },
      { name: 'Dragon pickaxe', rate: 256 },
      { name: 'Dragon 2h sword', rate: 256 },
      { name: 'Fangs of venenatis', rate: 196 },
      { name: 'Voidwaker gem', rate: 360 },
    ],
  },
  spindel: {
    displayName: 'Spindel',
    uniques: [
      { name: 'Venenatis spiderling', rate: 2800 },
      { name: 'Treasonous ring', rate: 716 },
      { name: 'Dragon pickaxe', rate: 358 },
      { name: 'Dragon 2h sword', rate: 358 },
      { name: 'Fangs of venenatis', rate: 618 },
      { name: 'Voidwaker gem', rate: 912 },
    ],
  },
  vetion: {
    displayName: "Vet'ion",
    uniques: [
      { name: "Vet'ion jr.", rate: 1500 },
      { name: 'Ring of the gods', rate: 512 },
      { name: 'Dragon pickaxe', rate: 256 },
      { name: 'Dragon 2h sword', rate: 256 },
      { name: "Skull of vet'ion", rate: 196 },
      { name: 'Voidwaker blade', rate: 360 },
    ],
  },
  calvarion: {
    displayName: "Calvar'ion",
    uniques: [
      { name: "Vet'ion jr.", rate: 2800 },
      { name: 'Ring of the gods', rate: 716 },
      { name: 'Dragon pickaxe', rate: 358 },
      { name: 'Dragon 2h sword', rate: 358 },
      { name: "Skull of vet'ion", rate: 618 },
      { name: 'Voidwaker blade', rate: 912 },
    ],
  },
  the_whisperer: {
    displayName: 'The Whisperer',
    uniques: [
      { name: 'Wisp', rate: 2000 },
      { name: "Siren's staff", rate: 512 },
      { name: 'Virtus mask', rate: 1536 },
      { name: 'Virtus robe top', rate: 1536 },
      { name: 'Virtus robe bottom', rate: 1536 },
      { name: 'Bellator vestige', rate: 512 },
      { name: 'Shadow quartz', rate: 50, note: 'ramps up from ~1/200 toward 1/50 over your first ~300 kills -- settled rate' },
      { name: 'Sirenic tablet', rate: 26.2, note: 'gets more common the longer you go without one -- approximate settled rate' },
      { name: 'Chromium ingot', rate: 171 },
      { name: "Awakener's orb", rate: 34.5 },
    ],
  },
  wintertodt: {
    displayName: 'Wintertodt',
    uniques: [
      // Wintertodt rewards come from a points-based crate system (500+
      // points per reward, higher Firemaking = rarer items weighted in),
      // not a per-kill roll, and the wiki doesn't publish flat rates for
      // individual items (pet, pyromancer outfit, warm gloves, tome of
      // fire, dragon axe, etc.) -- left out rather than guessed at.
    ],
  },
  zalcano: {
    displayName: 'Zalcano',
    uniques: [
      {
        name: 'Smolcano',
        rate: 2250,
        note: 'flat rate regardless of contribution, per the wiki',
      },
      {
        name: 'Zalcano shard',
        rate: 1500,
        note: 'scales with personal contribution (roughly 1/750 to 1/1,500) -- this uses the conservative end',
      },
      {
        name: 'Uncut onyx',
        rate: 8000,
        note: 'part of the crystal tool seed table (1/40 chance of onyx instead of a seed when that table hits)',
      },
    ],
  },
  chambers_of_xeric: {
    displayName: 'Chambers of Xeric',
    uniques: [
      // CoX uniques come from the Ancient Chest via a points-based unique
      // table (more points = better odds), not a flat per-raid rate -- the
      // wiki doesn't publish simple 1/N numbers for individual items
      // (twisted bow, elder maul, etc.), so this needs dedicated follow-up
      // research against the Chest (Chambers of Xeric) reward mechanics
      // rather than guessed-at numbers.
    ],
  },
  chambers_of_xeric_challenge_mode: {
    displayName: 'Chambers of Xeric: Challenge Mode',
    uniques: [
      // Same points-based mechanic as normal CoX, plus its own Metamorphic
      // dust -- needs the same follow-up research as chambers_of_xeric.
    ],
  },
  theatre_of_blood: {
    displayName: 'Theatre of Blood',
    uniques: [
      {
        name: 'Any unique (combined)',
        rate: 9.1,
        note: "the wiki gives an overall ~11% chance of any unique per completion, not a per-item split -- individual item odds (scythe, rapier, sang staff, justiciar, avernic hilt) need dedicated follow-up research",
      },
    ],
  },
  theatre_of_blood_hard_mode: {
    displayName: 'Theatre of Blood: Hard Mode',
    uniques: [
      {
        name: 'Any unique (combined)',
        rate: 7.7,
        note: "the wiki gives an overall ~13% chance of any unique per completion in Hard Mode, not a per-item split -- individual item odds need dedicated follow-up research",
      },
    ],
  },
  tombs_of_amascut: {
    displayName: 'Tombs of Amascut',
    uniques: [
      // ToA uniques scale with raid level/invocations, and the wiki doesn't
      // publish simple flat per-item rates -- needs dedicated follow-up
      // research rather than guessed-at numbers.
    ],
  },
  tombs_of_amascut_expert: {
    displayName: 'Tombs of Amascut: Expert Mode',
    uniques: [
      // Same raid-level-scaled mechanic as normal ToA -- needs the same
      // follow-up research as tombs_of_amascut.
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
