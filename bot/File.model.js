const mongoose = require("mongoose");

const FileSchema = new mongoose.Schema({
  title: { type: String, required: true },
  file_unique_id: { type: String, required: true },
  fileId: { type: String, required: true, unique: true },
  channelId: { type: String, required: true },
  message_id: Number,
  fileSize: Number,
  mimeType: String,
  uploadedByBot: String,

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Create a text index on the title field for searching
FileSchema.index({ title: "text" });

module.exports = mongoose.model("File", FileSchema);
