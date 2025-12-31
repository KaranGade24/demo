const { MongoClient } = require("mongodb");
require("dotenv").config();

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

async function connectDB() {
    await client.connect();
    const db = client.db("telegram");
    return {
        db,
        moviesColl: db.collection("movies"),
        processedColl: db.collection("processed_magnets"),
        client
    };
}


async function saveIndex(entry) {
    let dbClient;
    try {
      const { db, client } = await connectDB();
      dbClient = client;
  
      // Target the specific collection you requested
      const indexColl = db.collection("telegram_movie_channel_id");
  
      // Add entry to MongoDB
      await indexColl.insertOne(entry);
      
      console.log(`✅ Indexed in MongoDB: ${entry.name}`);
    } catch (err) {
      console.warn("⚠️ Failed to write to MongoDB Index:", err.message);
    } finally {
      if (dbClient) await dbClient.close();
    }
  }

module.exports = { connectDB,saveIndex };