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
        title TEXT,
        fileId TEXT,
        file_unique_id TEXT,
        fileSize INTEGER,
        mimeType TEXT
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