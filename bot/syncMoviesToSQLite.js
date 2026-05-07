const { sqlConnect } = require("./db");
const File = require("./File.model");

// ========================================
// FULL SYNC MONGODB -> SQLITE
// ========================================

exports.syncMoviesToSQLite = async (db) => {
  try {
    if (!db) db = sqlConnect();

    console.info("🔄 Streaming from MongoDB...");

    const insert = db.prepare(`
      INSERT OR REPLACE INTO movies (
        id,
        title,
        fileId,
        file_unique_id,
        fileSize,
        mimeType,
        message_id,
        channelId,
        uploadedByBot
      )

      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((batch) => {
      for (const m of batch) {
        insert.run(
          m._id.toString(),
          m.title || "",
          m.fileId || "",
          m.file_unique_id || "",
          m.fileSize || 0,
          m.mimeType || "",
          m.message_id || 0,
          m.channelId || "",
          m.uploadedByBot || "unknown_bot"
        );
      }
    });

    const cursor = File.find({}).lean().cursor();

    let batch = [];

    const BATCH_SIZE = 500;

    let count = 0;

    for await (const doc of cursor) {
      batch.push(doc);

      if (batch.length >= BATCH_SIZE) {
        insertMany(batch);

        count += batch.length;

        console.info(`✅ Inserted: ${count}`);

        batch = [];
      }
    }

    // REMAINING
    if (batch.length > 0) {
      insertMany(batch);

      count += batch.length;
    }

    console.info(`🎉 Sync completed: ${count} records`);
  } catch (err) {
    console.error("❌ Sync error:", err);
  }
};

// ========================================
// SINGLE INSERT / UPDATE
// ========================================

exports.insertMovieToSQLite = (fileData, db) => {
  try {
    if (!db) db = sqlConnect();

    const insert = db.prepare(`
      INSERT OR REPLACE INTO movies (

        id,
        title,
        fileId,
        file_unique_id,
        fileSize,
        mimeType,
        message_id,
        channelId,
        uploadedByBot

      )

      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(
      fileData._id.toString(),
      fileData.title || "",
      fileData.fileId || "",
      fileData.file_unique_id || "",
      fileData.fileSize || 0,
      fileData.mimeType || "",
      fileData.message_id || 0,
      fileData.channelId || "",
      fileData.uploadedByBot || "unknown_bot"
    );

    console.info("✅ Inserted into SQLite:", fileData.title);
  } catch (err) {
    console.error("❌ SQLite insert error:", err);
  }
};

// ========================================
// SEARCH MOVIES
// ========================================

exports.searchByTitle = (db, query, page = 1, limit = 8) => {
  try {
    if (!db) db = sqlConnect();

    const offset = (page - 1) * limit;

    const results = db
      .prepare(
        `
      SELECT
        id,
        title,
        fileId,
        fileSize,
        mimeType,
        message_id,
        channelId,
        file_unique_id

      FROM movies

      WHERE title LIKE ?

      LIMIT ? OFFSET ?
    `
      )
      .all(`%${query}%`, limit, offset);

    const total = db
      .prepare(
        `
      SELECT COUNT(*) as count

      FROM movies

      WHERE title LIKE ?
    `
      )
      .get(`%${query}%`).count;

    return {
      results,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      totalResults: total,
      Query: query,
    };
  } catch (err) {
    console.error("❌ Search error:", err);

    return {
      results: [],
      totalPages: 0,
      currentPage: 1,
      totalResults: 0,
      Query: query,
    };
  }
};

// ========================================
// GET MOVIE BY ID
// ========================================

exports.getById = (id, db) => {
  try {
    if (!db) db = sqlConnect();

    const movie = db
      .prepare(
        `
      SELECT *

      FROM movies

      WHERE id = ?
    `
      )
      .get(id);

    return movie;
  } catch (err) {
    console.error("❌ getById error:", err);

    return null;
  }
};
