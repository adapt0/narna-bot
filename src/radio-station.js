const httpUtils = require('./http-utils')
const icy = require('icy');
const logger = require('./logger');

class RadioStation {
    constructor(stationUrl) {
        this.url = stationUrl;
        this.icyHeaders_ = null;
        this.voiceChannels_ = { };
    }

    joinChannel(voiceChannel) {
        const voiceChannelName = voiceChannel.name;
        const voiceChannelId = voiceChannel.id;
        if (voiceChannelId in this.voiceChannels_) return;

        // placeholder to prevent additional joins
        this.voiceChannels_[voiceChannel.id] = null;

        voiceChannel.join().then(
            async (connection) => { // Connection is an instance of VoiceConnection
                logger.info(`Starting station '${voiceChannel.name}'`);

                const streamUrls = await httpUtils.get(this.url, 'audio/x-mpegurl');
                const playlist = await httpUtils.get(streamUrls.split('\n')[0], 'audio/x-scpls');

                const m = playlist.match(/^File\d=(.+)/m);
                const streamUrl = m && m[1];
                if (!streamUrl) throw new Error("No entries in playlist?");

                // const stream = await httpUtils.getStream(streamUrl);
                const stream = await new Promise((resolve, reject) => {
                    icy.get(streamUrl, (res) => {
                        // logger.debug(res.headers);

                        this.icyHeaders_ = {};
                        Object.keys(res.headers).forEach((h) => {
                            if (h.startsWith('icy-')) {
                                this.icyHeaders_[h.substr(4)] = res.headers[h]
                            }
                        });
                        // console.log(this.icyHeaders_);

                        // log any "metadata" events that happen
                        res.on('metadata', (metadata) => {
                            const parsed = icy.parse(metadata);
                            logger.verbose(voiceChannelName, parsed)

                            this.title_ = parsed['StreamTitle'];
                        });

                        resolve(res);
                    });
                });

                // keep the stream so we can cancel it
                this.voiceChannels_[voiceChannel.id] = stream;

                // begin streaming
                const dispatcher = connection.playStream(stream);
                dispatcher.on('end', () => {
                    logger.info(`Station '${voiceChannelName}' ended`);
                    delete this.voiceChannels_[voiceChannelId];
                });
                dispatcher.on('error', (e) => {
                    logger.info(`Station '${voiceChannelName}' error`, e);
                    delete this.voiceChannels_[voiceChannelId];
                });
            }
        ).catch(logger.error);
    }

    leaveChannel(voiceChannel) {
        try {
            const stream = this.voiceChannels_[voiceChannel.id];
            if (stream) {
                logger.info(`Stopping station '${voiceChannel.name}'`);
                if (stream.socket) stream.socket.end();
            }
        } catch (e) {
            logger.error(e);
        }

        voiceChannel.leave();
    }

    get status() {
        if (Object.keys(this.voiceChannels_).length) {
            return this.title_ || (this.icyHeaders_ && this.icyHeaders_.name) || '';
        } else {
            return 'Stopped';
        }
    }
};

module.exports = RadioStation;
