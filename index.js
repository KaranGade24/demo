const express = require("express");
const app = express();

const cors = require("cors");
app.use(
  cors({
    methods: ["GET", "POST"],
    origin: "*",
  })
);
require("dotenv").config();
const { connectDB, sqlConnect } = require("./db");
const saveFileToDB = require("./saveFilesDB.helper");
const { TelegramBot } = require("./bot.connection");
const {
  insertMovieToSQLite,
  searchByTitle,
  syncMoviesToSQLite,
  getById,
} = require("./syncMoviesToSQLite");

//DB connection
var sqlDB = null;

// Basic /start command
// const bot = TelegramBot();
app.use(express.json());

const token = process.env.BOT_TOKEN;
const url = process.env.URL;

const bot = TelegramBot(token);

console.log({ token, url });

const start = async () => {
  console.log("Setting webhook...");
  await bot.setWebHook(`${url}/bot${token}`);
  console.log("✅ Webhook successfully set");
  sqlDB = await sqlConnect();
  await connectDB();
};

start();

// Create the endpoint to receive updates
app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200); // Always respond with 200 OK
});

bot.onText(/\/start/, (msg) => {
  try {
    bot.sendMessage(
      msg.chat.id,
      "Welcome! Bot is running in Docker using node-telegram-bot-api. 🐳"
    );
  } catch (err) {
    console.error(err);
  }
});

const inline_keyboard_genarator = (
  movies,
  currentPage,
  totalPages,
  totalResults,
  ITEMS_PER_PAGE,
  Query
) => {
  try {
    // Current page validation
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const nxtPrevBtns = [
      [
        ...(currentPage < totalPages
          ? [
              {
                text: "Next ⏩",
                callback_data: `nxtBtn_${currentPage + 1}_query=${Query}`,
              },
            ]
          : []),
        ...(currentPage > 1
          ? [
              {
                text: "⏪ Prev",
                callback_data: `prevBtn_${currentPage - 1}_query=${Query}`,
              },
            ]
          : []),
      ],
      [
        // for result ony
        // { text: "", callback_data: "none" },
        {
          text: `Current Page: ${currentPage}/${totalPages}`,
          callback_data: "none",
        },
        { text: `Total Results: ${totalResults}`, callback_data: "none" },
      ],
    ];
    // const peginationMovie = movies.slice(start, end);
    const btns = movies.map((movie, idx) => {
      return [{ text: movie.title, callback_data: `movie=${movie.id}` }];
    });
    let inline_keyboard = [];
    inline_keyboard = [...btns, ...nxtPrevBtns];

    return inline_keyboard;
  } catch (error) {
    console.error(`Error in inline_keyboard_genarator: ${error}`);
  }
};

bot.on("message", async (msg) => {
  try {
    const text = msg.text?.trim().toLowerCase();
    if (!text) return;

    const chatId = msg.chat.id;
    const current_page = 1;
    const ITEMS_PER_PAGE = 8;
    const searchQuery = text;

    const { results, totalPages, currentPage, totalResults, Query } =
      searchByTitle(sqlDB, searchQuery, current_page, ITEMS_PER_PAGE);

    if (!results.length) {
      return bot.sendMessage(chatId, "❌ No results found");
    }

    const inline_keyboard = inline_keyboard_genarator(
      results,
      currentPage,
      totalPages,
      totalResults,
      ITEMS_PER_PAGE,
      Query
    );

    const message = `
✨ <b>SEARCH ENGINE</b> ✨

🔍Result for: <b>${text}</b>

━━━━━━━━━━━━━━━━━━

📂 Results are ready
👇 Click on movie name to get file

━━━━━━━━━━━━━━━━━━

⚙️ <i>Use Next / Prev for more</i>
`;

    bot.sendMessage(chatId, message, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: inline_keyboard,
      },
    });
  } catch (error) {
    console.error(`Error: ${error}`);
  }
});

bot.on("callback_query", async (query) => {
  try {
    const data = query.data;
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const [actionPart, queryPart] = data.split("_query=");
    const current_page = parseInt(actionPart.split("_")[1]);
    const searchQuery = queryPart;

    if (query.data.startsWith("nxtBtn_")) {
      const { results, totalPages, currentPage, totalResults, Query } =
        searchByTitle(sqlDB, searchQuery, current_page, 8);
      const inline_keyboard = inline_keyboard_genarator(
        results,
        currentPage,
        totalPages,
        totalResults,
        8,
        Query
      );

      try {
        await bot.editMessageReplyMarkup(
          { inline_keyboard },
          {
            chat_id: chatId,
            message_id: messageId,
          }
        );
      } catch (err) {
        if (
          err.response &&
          err.response.body.description.includes("message is not modified")
        ) {
          return bot.answerCallbackQuery(query.id, {
            text: "⚠️ Already on this page",
          });
        }
        console.error(err);
      }
    }

    if (query.data.startsWith("prevBtn_")) {
      const { results, totalPages, currentPage, totalResults, Query } =
        searchByTitle(sqlDB, searchQuery, current_page, 8);

      const inline_keyboard = inline_keyboard_genarator(
        results,
        currentPage,
        totalPages,
        totalResults,
        8,
        Query
      );
      bot.editMessageReplyMarkup(
        {
          inline_keyboard: inline_keyboard,
        },
        {
          chat_id: chatId,
          message_id: messageId,
        }
      );
    }

    if (query.data.startsWith("movie=")) {
      try {
        const id = query.data.split("=")[1];

        const movie = getById(id, sqlDB); // SQLite fetch

        if (!movie) {
          return bot.answerCallbackQuery(query.id, {
            text: "❌ File not found",
            show_alert: true,
          });
        }

        const chat_id = query.message.chat.id;

        // 🎬 Clean title (optional)
        const title = movie.title || "Unknown File";

        // ✨ Caption (styled)
        const caption = `
🎬 <b>${title}</b>

━━━━━━━━━━━━━━━━━━

📦 Size: ${(movie.fileSize / (1024 * 1024)).toFixed(2)} MB
📁 Format: ${movie.mimeType || "Unknown"}

━━━━━━━━━━━━━━━━━━

🚀 <i>Powered by <a href="https://t.me/+_OhMUT6XxBkwNWFl">@movie_time_Channel</a></i>

🚀 <i>Join for more <a href="https://t.me/movie_time_v1">movie_time_Group</a></i>

🚀<i>Search Movies <a href="https://t.me/movie_time_v1_bot">movie_time_bot</a></i>
`;

        // 📤 Send file
        await bot.sendDocument(chat_id, movie.fileId, {
          caption: caption,
          parse_mode: "HTML",
        });

        // ✅ Callback response
        bot.answerCallbackQuery(query.id, {
          text: "📥 Sending file...",
        });
      } catch (error) {
        console.error(error);

        bot.answerCallbackQuery(query.id, {
          text: "❌ Error sending file",
          show_alert: true,
        });
      }
    }
  } catch (err) {
    console.error(`Error in callback_query: ${err}`);
  }
});

bot.addListener("channel_post", async (msg) => {
  try {
    if (msg.video || msg.document) {
      const savedFile = await saveFileToDB(msg);
      // 👆 make sure this RETURNS saved Mongo document

      // 🔥 Insert into SQLite instantly
      insertMovieToSQLite(savedFile, sqlDB);
    }
  } catch (err) {
    console.error(err);
  }
});

console.info("Bot server started...");
syncMoviesToSQLite(sqlDB);

const PORT = 7860;

app.get("/", (req, res) => {
  res.send("Bot is running 🚀");
});

app.listen(PORT, () => {
  console.info(`Server is running on port http://localhost:${PORT}`);
});
