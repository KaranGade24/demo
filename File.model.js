const mongoose = require("mongoose");

const FileSchema = new mongoose.Schema({
  title: { type: String, required: true },
  file_unique_id: { type: String, required: true },
  fileId: { type: String, required: true, unique: true },
  fileSize: Number,
  mimeType: String,
});

// Create a text index on the title field for searching
FileSchema.index({ title: "text" });

module.exports = mongoose.model("File", FileSchema);
