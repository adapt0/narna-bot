const NarnaBot = require('./src/narna-bot');
const packageJson = require('./package.json');

new NarnaBot({
    version: packageJson.version
}).begin().catch((e) => console.error(e));
