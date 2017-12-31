// https://medium.com/@renesansz/tutorial-creating-a-simple-discord-bot-9465a2764dc0
// https://github.com/reactiflux/discord-irc/wiki/Creating-a-discord-bot-&-getting-a-token

const commander = require('commander');
const Discord = require('discord.js');
const http = require('http');
const readline = require('readline');
const winston = require('winston');
const URL = require('url').URL;

const logger = winston;
logger.cli();

class NarnaBot {
    constructor(options) {
        this.commands_ = {
            help:   { desc: "This help" },
            ping:   { desc: "ping bot" },
            search: { desc: "media.search" },
        };
    }

    async begin() {
        const packageJson = require('./package.json');
        const version = packageJson.version;

        // parse command line
        let verbosity = 0;
        commander
            .version(version)
            .option('-v, --verbose', 'Increase logging verbosity', () => verbosity += 1)
            .parse(process.argv)
        ;

        // load config
        {
            const config = require('./config.json');
            this.cpUrl_ = config.cp.url;
            this.cpKey_ = config.cp.key;
            this.discordToken_ = config.discord.token;
        }

        // adjust logging level
        const logLevels = [ 'info', 'debug', 'verbose', 'silly' ];
        logger.level = logLevels[ Math.min(verbosity, logLevels.length - 1) ];

        //
        logger.info(`narna-bot v${version} beep boop`);
        await this.beginConsole_();
        await this.beginDiscordBot_();
    }

    beginConsole_() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.on('line', async (input) => {
            const reply = await this.processMessage_(input);
            if (reply) console.log(reply);
        });
    }

    async beginDiscordBot_() {
        const bot = new Discord.Client();

        bot.on('ready', () => {
            logger.debug(`Discord: Logged in as ${bot.user.tag}`);
        });
        bot.on('disconnect', (errMsg, code) => {
            logger.warn('Discord: Disconnected', { errMsg, code });
        });
        bot.on('message', async (msg) => {
            logger.verbose(`Discord: ${msg.content}`, { msg });
            const reply = await this.processMessage_(msg.content);
            if (reply) msg.reply(reply);
        });

        await bot.login(this.discordToken_);
    }

    async processMessage_(message) {
        try {
            if (message.startsWith('!')) {
                // bot command
                const args = message.split(' ');
                const name = args.shift().substring(1).toLowerCase();

                const cmd = this.commands_[name];
                const cmdFunc = cmd && this[`cmd${name.charAt(0).toUpperCase() + name.slice(1)}_`];
                if (!cmdFunc) return null;

                return await cmdFunc.apply(this, args);
            } else {
                // IMDB URL
                const m = message.match(/(?:https?:\/\/)?(?:www\.)?imdb\.com\/title\/(tt[^\/]+)/);
                if (!m || !m[1]) return null;

                const res = await this.movieAdd(m[1]);
                if (res.success) {
                    const tagline = res.movie && res.movie.info && res.movie.info.tagline;
                    let msg = `Added ${res.movie && res.movie.title}`;
                    if (tagline) msg += `\r\n"${tagline}"`;
                    return msg;
                }
            }
            return null;

        } catch (e) {
            logger.error(e.message, { e });
            return `ERROR: ${e.message}`;
        }
    }

    cmdHelp_() {
        const keys = Object.keys(this.commands_).sort();
        return keys.map((k) => {
            return `${k} - ${this.commands_[k].desc}`;
        }).join('\r\n');
    }

    cmdPing_() {
        return "pong";
    }

    async cmdSearch_(...args) {
        if (args.length <= 0) return null;

        const movies = await this.movieSearch(args.join(' '));
        const titles = movies.map((m) => {
            if (m.in_wanted) return `${m.original_title} (wanted: ${m.in_wanted.status})`;
            if (m.in_library) return `${m.original_title} (library: ${m.in_library.status})`;
            return m.original_title;
        });
        const uniqueTitles = [... new Set(titles)].sort();
        return uniqueTitles.join('\r\n');
    }

    async movieAdd(identifier) {
        const url = new URL(this.cpUrl_);
        url.pathname = `/api/${this.cpKey_}/movie.add`;
        url.search = `identifier=${encodeURIComponent(identifier)}`;

        logger.silly(url.toString());

        const jsonData = await this.httpGetJson_(url.toString());
        logger.silly('jsonData', jsonData);
        return jsonData;
    }

    async movieSearch(desc) {
        const url = new URL(this.cpUrl_);
        url.pathname = `/api/${this.cpKey_}/search`;
        url.search = `q=${encodeURIComponent(desc)}`;

        logger.silly(url.toString());

        const jsonData = await this.httpGetJson_(url.toString());
        logger.silly('movieSearch', {JSON: jsonData});
        return jsonData.movies;
    }

    async httpGetJson_(url) {
        let res = null;
        try {
            res = await new Promise((resolve, reject) => {
                http.get(url, resolve).on('error', reject);
            });

            if (200 !== res.statusCode) throw new Error(`Request failed (Status Code: ${res.statusCode})`);
            if (!/^application\/json/.test(res.headers['content-type'])) {
                throw new Error(`Invalid content-type. Expected application/json but received ${res.headers['content-type']}`);
            }

            res.setEncoding('utf8');
            let body = '';
            res.on('data', (chunk) => { body += chunk; });

            await new Promise((resolve) => res.on('end', resolve));
            return JSON.parse(body);

        } catch (e) {
            if (res) res.resume(); // consume response data
            throw e;
        }
    }
};

new NarnaBot().begin().catch((e) => console.error(e));
