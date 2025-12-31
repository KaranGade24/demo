// const fs = require("fs");
// const readline = require("readline");
// const { downloadTorrent, client } = require("./modules/downloader");
// const {uploadMediaAxios} = require("./modules/telegram_uploader")
// require("dotenv").config();

// const magnetRegex = /(magnet:\?xt=urn:btih:[a-zA-Z0-9&=%:+._-]+)/;

// async function run() {
//   const rl = readline.createInterface({
//     input: fs.createReadStream("torrent_links.txt"),
//     crlfDelay: Infinity
//   });

//   const links = [];

//   for await (const line of rl) {
//     const match = line.match(magnetRegex);
//     if (match) links.push(match[1]);
//   }

//   console.log(`🔗 Found ${links.length} torrents`);

//   for (const link of links) {
//     try {
//       console.log("\n=================================");
//       const files = await downloadTorrent(link); // your side
    
//       for (const file of files) {
         
//           const info = await uploadMediaAxios(file.path);
//           console.log("🎉 Uploaded:", info.name);
        
//       }
//     } catch (err) {
//       console.warn("⚠️ Skipped:", err.message);
//     }
    
//   }

//   console.log("\n✅ All torrents processed");
//   client.destroy(); // 🔥 destroy ONCE at the end
// }

// run();




const { downloadTorrent, client: torrentClient } = require("./modules/downloader");
const { uploadMediaAxios } = require("./modules/telegram_uploader");
const { connectDB } = require("./db/config");
require("dotenv").config();

async function run() {
  let dbClient;
  try {
    const { moviesColl, processedColl, client } = await connectDB();
    dbClient = client;
    
    console.log("📂 Connected to MongoDB. Fetching movies...");

    // 1. Get all movies from the database
    const movies = await moviesColl.find({}).toArray();
    console.log(`🔗 Found ${movies.length} entries in database`);

    for (const movie of movies) {
      const magnet = movie.magnet;
      
      // 2. Resume Logic: Check if this specific magnet was already processed
      const alreadyProcessed = await processedColl.findOne({ magnet: magnet });
      
      if (alreadyProcessed) {
        console.log(`⏩ Skipping already processed: ${movie.movie_title}`);
        continue;
      }

      try {
        console.log("\n=================================");
        console.log(`🎬 Processing: ${movie.movie_title}`);
        
        // Your existing download logic
        const files = await downloadTorrent(magnet); 
      
        for (const file of files) {
          const info = await uploadMediaAxios(file.path);
          console.log("🎉 Uploaded:", info.name);
        }

        // 3. Tracking: Mark as processed in DB after successful upload
        await processedColl.insertOne({
          magnet: magnet,
          movie_title: movie.movie_title,
          processed_at: new Date()
        });

      } catch (err) {
        console.warn(`⚠️ Skipped ${movie.movie_title}:`, err.message);
      }
    }

    console.log("\n✅ All database entries processed");

  } catch (mongoErr) {
    console.error("🚨 MongoDB Error:", mongoErr);
  } finally {
    torrentClient.destroy(); // 🔥 Destroy torrent client
    if (dbClient) await dbClient.close(); // Close DB connection
  }
}

run();