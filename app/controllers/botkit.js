//CONFIG===============================================

/* Uses the slack button feature to offer a real time bot to multiple teams */
var appName = "ScrumelloNinja";
var Botkit = require('botkit');
var mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/botkit_express_demo';
var botkit_mongo_storage = require('../../config/botkit_mongo_storage')({mongoUri: mongoUri});
var unirest = require('unirest');
var Trello = require("trello");
var TrelloRequestURL = "https://trello.com/1/OAuthGetRequestToken";
var TrelloAccessURL = "https://trello.com/1/OAuthGetAccessToken";
var TrelloAuthorizeURL = "https://trello.com/1/OAuthAuthorizeToken";
var TrelloClientTokenRequestURL = "https://trello.com/1/connect?key=" + process.env.TRELLO_KEY +
    "&name=" + appName + "&expiration=never&response_type=token&scope=read,write";

if (!process.env.SLACK_ID || !process.env.SLACK_SECRET || !process.env.PORT) {
    console.log('Error: Specify SLACK_ID SLACK_SECRET and PORT in environment');
    process.exit(1);
}

var controller = Botkit.slackbot({
    storage: botkit_mongo_storage
});

exports.controller = controller;

//CONNECTION FUNCTIONS=====================================================
exports.connect = function (team_config) {
    var bot = controller.spawn(team_config);
    controller.trigger('create_bot', [bot, team_config]);
};

// just a simple way to make sure we don't
// connect to the RTM twice for the same team
var _bots = {};

function trackBot(bot) {
    _bots[bot.config.token] = bot;
}

controller.on('create_bot', function (bot, team) {

    if (_bots[bot.config.token]) {
        // already online! do nothing.
        console.log("already online! do nothing.")
    }
    else {
        bot.startRTM(function (err) {

            if (!err) {
                trackBot(bot);

                console.log("RTM ok");

                controller.saveTeam(team, function (err, id) {
                    if (err) {
                        console.log("Error saving team")
                    }
                    else {
                        console.log("Team " + team.name + " saved")
                    }
                })
            }

            else {
                console.log("RTM failed")
            }

            bot.startPrivateConversation({user: team.createdBy}, function (err, convo) {
                if (err) {
                    console.log(err);
                } else {
                    convo.say('I am a bot that has just joined your team');
                    convo.say('You must now /invite me to a channel so that I can be of use!');

                    // TODO: Get a client secret from the user
                    convo.say("If you have not authorized me to *make changes to your Trello boards/cards/lists*, " +
                        "please allow me to do so by going to this link (" + TrelloClientTokenRequestURL + ")");
                    convo.say("Once you have authorized, Trello will give you a token. Please direct message me " +
                        "@scrumello_ninja and say 'token YOUR_TOKEN'");
                }
            });

        });
    }
});

//REACTIONS TO EVENTS==========================================================

// Handle events related to the websocket connection to Slack
controller.on('rtm_open', function (bot) {
    console.log('** The RTM api just connected!');
});

controller.on('rtm_close', function (bot) {
    console.log('** The RTM api just closed');
    // you may want to attempt to re-open
});


//CUSTOM DIALOG ===============================================================
controller.hears(["authorize"], "direct_message", function (bot, message) {
    console.log(message);
    bot.reply(message, "/trello");
    bot.reply(message, "If you have not authorized me to *make changes to your Trello boards/cards/lists*, " +
        "please allow me to do so by going to this link (" + TrelloClientTokenRequestURL + ")");
    bot.reply(message, "Once you have authorized, Trello will give you a token. Please direct message me " +
        "@scrumello_ninja and say 'token YOUR_TOKEN'");
});

// TODO: find better way (OAuth) to authorize the bot/app
controller.hears(["token"], "direct_message", function (bot, message) {
    var inputArr = message.text.split(" ");
    if (inputArr[0] == "token" && inputArr[1] != null) {
        var trello = new Trello(process.env.TRELLO_KEY, inputArr);
        console.log(trello);
    } else {
        bot.reply(message, "Please say 'token YOUR_TOKEN'")
    }
});

controller.hears(['scrumello', 'ninja', 'daveninja'], 'direct_message', function (bot, message) {
    // trello.getListsOnBoard("2cKLhmkK",
    //     function (error, lists) {
    //         if (error) {
    //             console.log('Could not find lists:', error);
    //             bot.reply(message, 'Could not find lists: ' + error);
    //         }
    //         else {
    //             console.log('Found lists:', lists);
    //             bot.reply(message, 'Found lists: \n' + JSON.stringify(lists, null, 4));
    //         }
    //     });
});

//DIALOG ======================================================================

controller.hears('hello', 'direct_message', function (bot, message) {
    // if (_bots[bot.config.token]) {
    //     // already online! do nothing.
    //     console.log("already online! do nothing.")
    // }
    // else {
    //     bot.startRTM(function (err, bot, message) {
    //         if (err) {
    //             console.log("Couldn't start bot RTM")
    //         }
    //         else {
    //             bot.reply(message, 'Hello!');
    //         }
    //     });
    // }
});

controller.hears('^stop', 'direct_message', function (bot, message) {
    bot.reply(message, 'Goodbye');
    // bot.rtm.close();
});

controller.on('direct_message,mention,direct_mention', function (bot, message) {
    bot.api.reactions.add({
        timestamp: message.ts,
        channel: message.channel,
        name: 'robot_face'
    }, function (err) {
        if (err) {
            console.log(err)
        }
        bot.reply(message, 'I heard you loud and clear boss.');
    });
});

controller.storage.teams.all(function (err, teams) {

    console.log(teams);

    if (err) {
        throw new Error(err);
    }

    // connect all teams with bots up to slack!
    for (var t  in teams) {
        if (teams[t].bot) {
            var bot = controller.spawn(teams[t]).startRTM(function (err) {
                if (err) {
                    console.log('Error connecting bot to Slack:', err);
                } else {
                    trackBot(bot);
                }
            });
        }
    }

});
