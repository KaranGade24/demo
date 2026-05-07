const File = require("./File.model");
async function sendMovie(bot, chatId, movie) {
  const caption = `
🎬 <b>${movie.title}</b>

━━━━━━━━━━━━━━━━━━

📦 Size: ${(movie.fileSize / (1024 * 1024)).toFixed(2)} MB
📁 Format: ${movie.mimeType || "Unknown"}

━━━━━━━━━━━━━━━━━━

🚀 <i>Powered by <a href="https://t.me/+_OhMUT6XxBkwNWFl">@movie_time_Channel</a></i>

🚀 <i>Join for more <a href="https://t.me/movie_time_v1">movie_time_Group</a></i>

🚀<i>Search Movies <a href="https://t.me/movie_time_v1_bot">movie_time_bot</a></i>
`;
  try {
    // 🚀 FIRST TRY DIRECT FILE ID
    await bot.sendDocument(chatId, movie.fileId, {
      caption: caption,
      parse_mode: "HTML",
    });

    console.log("✅ Sent using file_id");
  } catch (err) {
    console.log("⚠️ file_id expired");
    console.log("♻️ Recovering from channel...");

    try {
      // 🔥 RECOVER USING CHANNEL MESSAGE
      console.log({
        channelId: movie.channelId,
        message_id: movie.message_id,
      });
      const copiedMessage = await bot.copyMessage(
        chatId,
        movie.channelId,
        movie.message_id
      );

      console.log("✅ File recovered");

      // 🔥 GET NEW FILE ID
      let newFileId = null;

      if (copiedMessage.document) {
        newFileId = copiedMessage.document.file_id;
      }

      if (copiedMessage.video) {
        newFileId = copiedMessage.video.file_id;
      }

      // 🔥 UPDATE DATABASE
      if (newFileId) {
        await File.updateOne(
          { _id: movie._id },
          {
            fileId: newFileId,
          }
        );

        console.log("♻️ file_id updated");
      }
    } catch (recoverErr) {
      console.error("❌ Recovery failed:", recoverErr.message);

      throw recoverErr;
    }
  }
}

module.exports = sendMovie;
