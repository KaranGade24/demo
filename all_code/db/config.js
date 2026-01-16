import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const uri = process.env.MONGODB_URI;
let client = null;
let db;
let isConnected = false;

export async function connectDB() {
  if (!isConnected) {
    if (!client) {
      if (!uri) {
        throw new Error("MONGODB_URI is not set in environment");
      }
      client = new MongoClient(uri);
    }

    await client.connect();
    db = client.db("telegram");
    isConnected = true;
    console.log("📂 Connected to MongoDB");
  }

  return {
    db,
    moviesColl: db.collection("movies"),
    processedColl: db.collection("processed_magnets"),
    indexColl: db.collection("telegram_movie_channel_id"),
    client,
  };
}

export async function saveIndex(indexColl, entry) {
  try {
    await indexColl.insertOne(entry);
    console.log(`🗂️ Indexed in MongoDB: ${entry.name}`);
  } catch (err) {
    console.warn("⚠️ MongoDB Error:", err.message);
  }
}
