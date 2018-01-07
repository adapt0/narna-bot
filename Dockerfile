# docker build . --squash -t narna-bot

FROM node:9.3-alpine

COPY index.js config.json package.json package-lock.json src/ /home/node/app/
COPY src /home/node/app/src/

# npm install
RUN apk update && apk add --virtual build-dependencies build-base gcc python
RUN cd /home/node/app && npm install --production
RUN apk del build-dependencies \
    && rm -rf /var/cache/apk/*

RUN apk add --no-cache ffmpeg

# Add Tini
# https://github.com/krallin/tini#using-tini
RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]

USER node
ENV NODE_ENV=production
WORKDIR /home/node/app
CMD ["node", "index.js"]
