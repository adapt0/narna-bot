const http = require('http');
const logger = require('./logger');
const url = require('url');

module.exports = {
    getStream(requestUrl) {
        return new Promise((resolve, reject) => {
            try {
                const u = url.parse(requestUrl);
                const req = http.get({
                    hostname: u.hostname,
                    port: u.port,
                    path: u.pathname + (u.search || ''),
                    headers: {
                        "Host": u.host,
                        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.84 Safari/537.36",
                    },
                }, (res) => {
                    resolve(res);
                });
                req.on('error', reject);
            } catch (e) {
                reject(e);
            }
        });
    },

    async get(requestUrl, expContentType) {
        const res = await this.getStream(requestUrl);
        if (200 !== res.statusCode) throw new Error(`Request failed (Status Code: ${res.statusCode})`);

        logger.verbose(requestUrl, res.headers);

        if (expContentType && false === res.headers['content-type'].startsWith(expContentType)) {
            throw new Error(`Invalid content-type. Expected '${expContentType}' but received ${res.headers['content-type']}`);
        }

        return new Promise((resolve, reject) => {
            setTimeout(reject, 10000);

            let body = "";
            res.setEncoding('utf8');
            res.on('data', (d) => { body += d; });
            res.on('end', () => { resolve(body.toString()); });
            res.on('error', reject);
        });
    },

    async getJson(u) {
        const body = await this.get(u, 'application/json');
        return JSON.parse(body);
    },
};
