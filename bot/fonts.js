// Shared RuneScape-Chat font registration for every canvas-rendered Discord
// graphic (loot/death leaderboards, bank ping alerts). Pulled out to its own
// module so each renderer can just `require('./fonts')` without caring about
// require order -- Node's module cache means the registration only actually
// runs once no matter how many renderers pull it in.

const { GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

GlobalFonts.registerFromPath(path.join(__dirname, 'assets/fonts/RuneScape-Chat-07.ttf'), 'rssmall');
GlobalFonts.registerFromPath(path.join(__dirname, 'assets/fonts/RuneScape-Chat-Bold-07.ttf'), 'rsbold');
