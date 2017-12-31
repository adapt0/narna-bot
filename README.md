# Narna-bot

## Configuration

Configuration requires a 'config.json' file:

    {
        "cp": {
            "url": "http://YOURIP:5050",
            "key": "YOURAPIKEY"
        },
        "discord": {
            "token": "APPBOTUSERTOKEN"
        }
    }

Instructions on [creating a discord bot & getting a token](https://github.com/reactiflux/discord-irc/wiki/Creating-a-discord-bot-&-getting-a-token)


## Interaction

Supports interaction via local console + Discord chat.

`!help` show list of supported commands


## Running

Locally:

    # install dependencies
    npm install

    # launch the bot
    npm start

via Docker:

    # build docker image
    docker build . --squash -t narna-bot

    # run + attach to image
    docker run -it narna-bot
