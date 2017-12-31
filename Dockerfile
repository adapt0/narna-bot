# docker build . --squash -t narna-bot

FROM node:9.3-alpine

COPY bot.js config.json package.json package-lock.json /home/node/app/
RUN cd /home/node/app && npm install --production

# Add Tini
# https://github.com/krallin/tini#using-tini
RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]

USER node
ENV NODE_ENV=production
WORKDIR /home/node/app
CMD ["node", "bot.js"]
