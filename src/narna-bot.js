// https://medium.com/@renesansz/tutorial-creating-a-simple-discord-bot-9465a2764dc0
// https://github.com/reactiflux/discord-irc/wiki/Creating-a-discord-bot-&-getting-a-token

const commander = require('commander');
const Discord = require('discord.js');
const httpUtils = require('./http-utils')
const logger = require('./logger');
const readline = require('readline');
const RadioStation = require('./radio-station');
const url = require('url');

class NarnaBot {
    constructor(options) {
        this.commands_ = {
            help:    { desc: "This help" },
            ping:    { desc: "Ping bot" },
            radio:   { desc: "Radio stations" },
            search:  { desc: "media.search" },
            wanted:  { desc: "wanted media" },
            version: { desc: "Report version" },
        };

        this.radioStations_ = { };
        this.version_ = options && options.version;
    }

    get version() {
        return `narna-bot v${this.version_} beep boop`;
    }

    async begin() {
        // parse command line
        let verbosity = 0;
        commander
            .version(this.version_)
            .option('-v, --verbose', 'Increase logging verbosity', () => verbosity += 1)
            .parse(process.argv)
        ;

        // load config
        {
            const config = require('../config.json');
            this.cpUrl_ = config.cp.url;
            this.cpKey_ = config.cp.key;
            this.discordToken_ = config.discord && config.discord.token;

            if (config.radioStations) {
                Object.keys(config.radioStations).forEach((name) => {
                    this.radioStations_[name] = new RadioStation(
                        config.radioStations[name]
                    );
                });
            }
        }

        // adjust logging level
        const logLevels = [ 'info', 'debug', 'verbose', 'silly' ];
        logger.level = logLevels[ Math.min(verbosity, logLevels.length - 1) ];

        //
        logger.info(this.version);

        await this.beginConsole_();

        if (this.discordToken_) {
            await this.beginDiscordBot_();
        }
    }

    beginConsole_() {
        const rl = readline.createInterface({
            input: process.stdin,
            // output: process.stdout
        });

        rl.on('line', async (content) => {
            const reply = await this.processMessage_({ content });
            if (reply) console.log(reply);
        });
    }

    async beginDiscordBot_() {
        const bot = new Discord.Client();
        this.bot_ = bot;

        bot.on('ready', () => {
            logger.debug(`Discord: Logged in as ${bot.user.tag}`);

            bot.guilds.forEach((guild, guildId) => {
                guild.channels.forEach((channel, channelId) => {
                    const station = this.radioStations_[channel.name];
                    if (!station) return;

                    if (this.channelStationEmpty_(channel)) {
                        station.leaveChannel(channel);
                    } else {
                        station.joinChannel(channel);
                    }
                });
            });
        });
        bot.on('disconnect', (errMsg, code) => {
            logger.warn('Discord: Disconnected', { errMsg, code });
        });
        bot.on('message', async (msg) => {
            logger.verbose(`Discord: ${msg.content}`, { msg });
            const reply = await this.processMessage_(msg);
            if (reply) {
                const maxReply = 1000;
                const bytesTotal = reply.length;
                for (let ofs = 0; ofs < bytesTotal; ) {
                    const lastOfs = Math.min(ofs + maxReply, bytesTotal);
                    if (lastOfs >= bytesTotal) {
                        // console.log(reply.slice(ofs));
                        msg.reply(reply.slice(ofs));
                        break;
                    } else {
                        let idx = reply.lastIndexOf('\n', lastOfs);
                        if (idx <= ofs) idx = lastOfs;

                        // console.log(reply.slice(ofs, idx));
                        msg.reply(reply.slice(ofs, idx));
                        ofs = idx + 1;
                    }
                }
                // if (reply) msg.reply(reply);
            }
        });
        bot.on('voiceStateUpdate', async (oldMember, newMember) => {
            const newVoice = newMember && newMember.voiceChannel;
            const oldVoice = oldMember && oldMember.voiceChannel;

            if (newVoice && newVoice.name in this.radioStations_) {
                // user joined a radio station
                const station = this.radioStations_[newVoice.name];
                station.joinChannel(newVoice);

            } else if (oldVoice && oldVoice.name in this.radioStations_) {
                // user left a radio station
                const station = this.radioStations_[oldVoice.name];
                if (this.channelStationEmpty_(oldVoice)) {
                    station.leaveChannel(oldVoice);
                }
            }
        });

        await bot.login(this.discordToken_);
    }

    async processMessage_(msg) {
        try {
            const content = msg.content;
            if (content.startsWith('!')) {
                // bot command
                const args = content.split(' ');
                const name = args.shift().substring(1).toLowerCase();

                const cmd = this.commands_[name];
                const cmdFunc = cmd && this[`cmd${name.charAt(0).toUpperCase() + name.slice(1)}_`];
                if (!cmdFunc) return null;

                return await cmdFunc.apply(this, args);
            } else {
                // IMDB URL
                const m = content.match(/(?:https?:\/\/)?(?:www\.)?imdb\.com\/title\/(tt[^\/]+)/);
                if (!m || !m[1]) return null;

                const res = await this.cpMovieAdd(m[1]);
                if (res.success) {
                    const tagline = res.movie && res.movie.info && res.movie.info.tagline;
                    let msg = `Added ${res.movie && res.movie.title}`;
                    if (tagline) msg += `\r\n"${tagline}"`;
                    return msg;
                }
            }
            return null;

        } catch (e) {
            logger.error(e);
            return `ERROR: ${e.message}`;
        }
    }

    cmdHelp_() {
        const keys = Object.keys(this.commands_).sort();
        return 'Help\r\n' + keys.map((k) => {
            return `!${k} - ${this.commands_[k].desc}`;
        }).join('\r\n');
    }

    cmdPing_() {
        return "pong";
    }

    cmdRadio_() {
        return Object.keys(this.radioStations_).sort().map((name) => {
            const station = this.radioStations_[name];
            return `${name}: ${station.status}`;
        }).join('\r\n');
    }

    cmdVersion_() {
        return this.version;
    }

    async cmdSearch_(...args) {
        if (args.length <= 0) return null;

        const movies = await this.cpSearch(args.join(' '));
        if (!movies) return 'No matches';

        const titles = movies.map((m) => {
            if (m.in_wanted) return `${m.original_title} (wanted: ${m.in_wanted.status})`;
            if (m.in_library) return `${m.original_title} (library: ${m.in_library.status})`;
            return m.original_title;
        });
        const uniqueTitles = [... new Set(titles)].sort();
        return uniqueTitles.join('\r\n');
    }

    async cmdWanted_(...args) {
        const jsonData = await this.cpMediaList({
            identifier: 'wanted',
            status: 'active'
        });
        const movies = jsonData && jsonData.movies;
        if (!movies) return 'No matches';

        const titles = movies.map((m) => {
            return `${m.title} (${m.info && m.info.year})`;
        });

        const uniqueTitles = [... new Set(titles)].sort();
        return uniqueTitles.join('\r\n');
    }

    /// api request wrapper
    async cpRequestJson_(apiCall, params) {
        const u = new url.URL(this.cpUrl_);
        u.pathname = `/api/${this.cpKey_}/${apiCall}`;
        if (params) {
            u.search = Object.keys(params).map(
                (k) => `${k}=${encodeURIComponent(params[k])}`
            ).join('&');
        }

        logger.silly(`<= ${u.toString()}`);

        const jsonData = httpUtils.getJson(u.toString());
        logger.silly('=>', jsonData);
        return jsonData;
    }

    async cpMovieAdd(identifier) {
        return await this.cpRequestJson_('movie.add', {
            identifier
        });
    }
    async cpMediaList(params) {
        return await this.cpRequestJson_('media.list', params);
    }
    async cpSearch(desc) {
        const jsonData = await this.cpRequestJson_('search', {
            q: desc
        });
        return jsonData && jsonData.movies;
    }

    /// @returns true if station is empty
    channelStationEmpty_(channel) {
        return !channel.members.some((member) => {
            return member.id !== this.bot_.user.id;
        });
    }
};

module.exports = NarnaBot;
