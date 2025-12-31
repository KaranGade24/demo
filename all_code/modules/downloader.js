
// torrentDownloader.js
import WebTorrent from "webtorrent";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOWNLOAD_DIR = path.join(__dirname, "downloads");

if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}
// ✅ SINGLE shared client
export const client = new WebTorrent();

// global safety logs
client.on("error", err => console.error("❌ Client error:", err.message));
client.on("warning", err => console.warn("⚠️ Client warning:", err.message));

/**
 * Download torrent safely
 * @param {string} magnetLink
 * @param {number} metadataTimeoutMs
 * @param {number} stallTimeoutMs
 * @returns {Promise<Array<{name:string,path:string,size:number}>>}
 */
export function downloadTorrent(magnetLink, metadataTimeoutMs = 60000, stallTimeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    console.log("\n⬇️ Starting torrent download");

    let torrent;
    let removed = false;
    let metadataReceived = false;
    let lastProgress = 0;

    try {
      torrent = client.add(magnetLink, { path: DOWNLOAD_DIR });
    } catch (err) {
      return reject(err);
    }

    /** SAFE CLEANUP */
    const cleanup = (reason) => {
      if (removed) return;
      removed = true;
      try {
        torrent.destroy({ destroyStore: false }, () => {});
      } catch (err) { /* ignore */ }
      reject(new Error(reason));
    };

    /** METADATA TIMEOUT */
    const metadataTimer = setTimeout(() => {
      if (!metadataReceived) {
        console.warn("⏳ Metadata timeout");
        cleanup("Metadata timeout");
      }
    }, metadataTimeoutMs);

    torrent.on("metadata", () => {
      metadataReceived = true;
      clearTimeout(metadataTimer);
      console.log("📦 Metadata received:", torrent.name);
      // You can access torrent.files here (sizes available as f.length)
    });

    /** PROGRESS DISPLAY */
    torrent.on("download", () => {
      const percent = (torrent.progress * 100).toFixed(2);
      const speed = (torrent.downloadSpeed / 1024 / 1024).toFixed(2);
      process.stdout.write(`⏳ ${percent}% | ${speed} MB/s\r`);
    });

    /** STALL DETECTOR (only AFTER metadata) */
    const stallChecker = setInterval(() => {
      if (!metadataReceived) return;
      if (torrent.progress === lastProgress && torrent.progress < 1) {
        console.warn("\n⏳ Download stalled");
        clearInterval(stallChecker);
        cleanup("Download stalled");
      }
      lastProgress = torrent.progress;
    }, stallTimeoutMs);

    /** DONE */
    torrent.on("done", () => {
      clearInterval(stallChecker);
      console.log("\n✅ Download completed");

      const files = torrent.files.map(f => ({
        name: f.name,
        path: path.join(DOWNLOAD_DIR, f.path),
        size: f.length // bytes, exact size from torrent metadata
      }));

      resolve(files);
    });

    // safety: if torrent emits an error
    torrent.on("error", (err) => {
      cleanup(`Torrent error: ${err.message}`);
    });
  });
}

// module.exports = {
//   downloadTorrent,
//   client
// };






// // modules/downloader.js
// const WebTorrent = require("webtorrent");
// const path = require("path");
// const fs = require("fs");

// // Ensure downloads folder exists
// const DOWNLOAD_DIR = path.join(__dirname, "./downloads");
// fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

// // ✅ SINGLE shared client instance to prevent memory leaks
// const client = new WebTorrent({
//   // Cap upload speed to ensure download priority (optional, remove if you want to seed faster)
//   maxWebConns: 100,
// });

// // Global safety logs
// client.on("error", (err) => console.error("❌ Client error:", err.message));

// /**
//  * Download torrent safely with timeouts and progress tracking
//  * @param {string} magnetLink
//  * @param {number} metadataTimeoutMs - Max time to wait for metadata (default 60s)
//  * @param {number} stallTimeoutMs - Max time to wait if download stalls (default 2m)
//  * @returns {Promise<Array<{name:string, path:string, size:number}>>}
//  */
// function downloadTorrent(magnetLink, metadataTimeoutMs = 60000, stallTimeoutMs = 120000) {
//   return new Promise((resolve, reject) => {
//     let torrent;
//     let removed = false;
//     let metadataReceived = false;
//     let lastProgress = 0;
    
//     // Helper to cleanup and reject safely
//     const cleanup = (reason) => {
//       if (removed) return;
//       removed = true;
      
//       // Stop checking for stalls
//       if (stallChecker) clearInterval(stallChecker);
//       if (metadataTimer) clearTimeout(metadataTimer);

//       if (torrent) {
//         // destroyStore: false allows resuming later if you run the script again
//         torrent.destroy({ destroyStore: false }, () => {});
//       }
//       reject(new Error(reason));
//     };

//     try {
//       console.log("\n⬇️  Initializing torrent...");
//       // Add torrent to client
//       torrent = client.add(magnetLink, { path: DOWNLOAD_DIR });
//     } catch (err) {
//       return reject(new Error(`Invalid Magnet Link: ${err.message}`));
//     }

//     /* ================= TIMEOUTS ================= */

//     // 1. Metadata Timeout: If we don't get .torrent info in 60s, kill it.
//     const metadataTimer = setTimeout(() => {
//       if (!metadataReceived) {
//         cleanup("Timeout: Unable to fetch metadata (dead torrent?)");
//       }
//     }, metadataTimeoutMs);

//     /* ================= EVENT LISTENERS ================= */

//     torrent.on("metadata", () => {
//       metadataReceived = true;
//       clearTimeout(metadataTimer);
//       console.log(`📦 Metadata received: ${torrent.name}`);
//       console.log(`📂 Files: ${torrent.files.length} | Size: ${(torrent.length / 1024 / 1024).toFixed(2)} MB`);
//     });

//     torrent.on("noPeers", (announceType) => {
//       // Just a warning, don't kill process yet
//       if (!metadataReceived) process.stdout.write("⚠️  Warning: No peers found yet...\r");
//     });

//     torrent.on("download", (bytes) => {
//       const percent = (torrent.progress * 100).toFixed(1);
//       const speed = (torrent.downloadSpeed / 1024 / 1024).toFixed(2); // MB/s
//       const peers = torrent.numPeers;
//       const timeRemaining = (torrent.timeRemaining / 1000).toFixed(0); // seconds
      
//       // Format time remaining
//       const eta = timeRemaining > 3600 
//         ? `${(timeRemaining/3600).toFixed(1)}h` 
//         : `${(timeRemaining/60).toFixed(1)}m`;

//       process.stdout.write(
//         `⏳ ${percent}% | 🚀 ${speed} MB/s | 👥 ${peers} peers | ⏱️ ETA: ${eta}   \r`
//       );
//     });

//     torrent.on("done", () => {
//       clearInterval(stallChecker);
//       console.log(`\n✅ Download completed: ${torrent.name}`);

//       // Map files to simple object for the uploader
//       const files = torrent.files.map((f) => ({
//         name: f.name,
//         path: path.resolve(DOWNLOAD_DIR, f.path), // Use absolute path
//         size: f.length,
//       }));

//       // Important: We don't destroy the torrent here, or seeding stops. 
//       // The caller (index.js) handles client.destroy() when all jobs are done.
//       resolve(files);
//     });

//     torrent.on("error", (err) => {
//       cleanup(`Torrent internal error: ${err.message}`);
//     });

//     /* ================= STALL DETECTOR ================= */
    
//     // 2. Stall Timeout: If progress matches previous progress for 'stallTimeoutMs', kill it.
//     var stallChecker = setInterval(() => {
//       if (!metadataReceived) return; // Don't check stall if we don't have metadata yet
      
//       // If progress is the same as last check AND we aren't finished
//       if (torrent.progress === lastProgress && torrent.progress < 1) {
//         if (torrent.numPeers === 0) {
//            cleanup("Stalled: No peers and no progress.");
//         } else {
//            // Optional: Reset peers if stalled but peers exist (sometimes helps)
//            // torrent.pause(); setTimeout(() => torrent.resume(), 1000);
//            console.warn("\n⚠️  Download seems stuck, waiting...");
//         }
//       }
//       lastProgress = torrent.progress;
//     }, stallTimeoutMs);

//   });
// }

// module.exports = {
//   downloadTorrent,
//   client,
// };