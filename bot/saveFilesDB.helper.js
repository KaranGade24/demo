const File = require("./File.model");

async function saveFileToDB(msg, botName = "default_bot") {
  try {
    const fileData = msg.video || msg.document;

    if (!fileData) return null;

    const fileName = fileData.file_name || `Unnamed_File_${Date.now()}`;

    const cleanTitle = fileName
      .replace(/[._]/g, " ")
      .replace(/\.(mkv|mp4|avi|pdf|zip)$/i, "")
      .trim();

    // 🔥 Check existing by permanent ID
    const existing = await File.findOne({
      file_unique_id: fileData.file_unique_id,
    });

    // ♻️ Update old file_id automatically
    if (existing) {
      existing.fileId = fileData.file_id;
      existing.channelId = msg.chat.id;
      existing.message_id = msg.message_id;
      existing.fileSize = fileData.file_size;
      existing.mimeType = fileData.mime_type;
      existing.uploadedByBot = botName;

      await existing.save();

      console.log("♻️ Existing file updated");

      return existing;
    }

    // ✅ New file
    const newFile = await File.create({
      title: cleanTitle,

      // TEMPORARY BOT FILE ID
      fileId: fileData.file_id,

      // PERMANENT UNIVERSAL FILE ID
      file_unique_id: fileData.file_unique_id,

      // PERMANENT RECOVERY DATA
      channelId: msg.chat.id,
      message_id: msg.message_id,

      fileSize: fileData.file_size,
      mimeType: fileData.mime_type,

      uploadedByBot: botName,
    });

    console.log("✅ New file saved");

    return newFile;
  } catch (err) {
    console.error("❌ saveFileToDB:", err.message);
  }
}

module.exports = saveFileToDB;
