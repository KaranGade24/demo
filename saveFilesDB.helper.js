const File = require("./File.model"); // Make sure to require your model

async function saveFileToDB(msg) {
  // Extract the file object whether it's a video or a document
  const fileData = msg.video || msg.document;

  if (!fileData) return; // Safety check

  // Telegram doesn't always guarantee a file_name, so we provide a fallback
  const fileName = fileData.file_name || `Unnamed_File_${Date.now()}`;
  const cleanTitle = (fileData.file_name || `Unnamed_File_${Date.now()}`)
    .replace(/[._]/g, " ")
    .replace(/\.(mkv|mp4|avi|pdf|zip)$/i, "")
    .trim();
  try {
    // Create a new document using your schema
    const newFile = new File({
      title: cleanTitle,
      fileId: fileData.file_id,
      file_unique_id: fileData.file_unique_id,
      fileSize: fileData.file_size,
      mimeType: fileData.mime_type,
    });

    // Save to MongoDB
    await newFile.save();

    console.info(`✅ Successfully saved: `, fileName);
    return newFile;
  } catch (error) {
    // Error code 11000 means the unique constraint (fileId) was violated
    if (error.code === 11000) {
      console.warn(`⚠️ Skipped duplicate file:`, fileName);
    } else {
      console.error(`❌ Database Error:`, error.message);
    }
  }
}

module.exports = saveFileToDB;
