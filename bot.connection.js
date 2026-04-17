const TelegramBot = require("node-telegram-bot-api");
const https = require("https");

exports.TelegramBot = (token) => {
  try {
    // DO NOT provide the webHook: { port } option here if using Express
    const bot = new TelegramBot(token, {
      request: {
        agent: new https.Agent({ family: 4 }), // force IPv4
      },
    });

    console.log("✅ Bot instance initialized");
    return bot;
  } catch (err) {
    console.error("Error in bot connection", err);
  }
};
