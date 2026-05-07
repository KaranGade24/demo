const mongoose = require("mongoose");

exports.connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB Connected...");
  } catch (err) {
    console.error("MongoDB Connection Error:", err.message);
    process.exit(1);
  }
};

const Database = require("better-sqlite3");

exports.sqlConnect = () => {
  try {
    const db = new Database("movies.db");

    // Create table
    db.prepare(
      `
  CREATE TABLE IF NOT EXISTS movies (
    id TEXT PRIMARY KEY,

    title TEXT NOT NULL,

    -- TEMPORARY TELEGRAM FILE ID
    fileId TEXT NOT NULL,

    -- PERMANENT TELEGRAM FILE UNIQUE ID
    file_unique_id TEXT UNIQUE NOT NULL,

    -- RECOVERY INFORMATION
    channelId TEXT NOT NULL,
    message_id INTEGER NOT NULL,

    fileSize INTEGER DEFAULT 0,
    mimeType TEXT,

    uploadedByBot TEXT,

    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`
    ).run();

    // Indexes
    db.prepare(
      `
      CREATE INDEX IF NOT EXISTS idx_title 
      ON movies(title)
    `
    ).run();

    db.prepare(
      `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_fileId 
      ON movies(fileId)
    `
    ).run();

    console.log("✅ SQLite connected");

    return db; // 🔥 VERY IMPORTANT
  } catch (err) {
    console.error("❌ SQLite error:", err);
  }
};
