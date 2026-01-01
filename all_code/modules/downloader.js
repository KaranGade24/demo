// torrentDownloader.js
// Prefer `webtorrent-hybrid` for TCP/UDP support; fall back to `webtorrent` if hybrid isn't installed.
let WebTorrent;
try {
  WebTorrent = (await import("webtorrent-hybrid")).default;
  console.log("🔁 Using webtorrent-hybrid for torrent downloads");
} catch (err) {
  WebTorrent = (await import("webtorrent")).default;
  console.warn("⚠️ webtorrent-hybrid not found; falling back to webtorrent");
} // dynamic import ensures code runs even if hybrid isn't installed yet
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { tryAcquire, release, currentOwner } from "./progress_manager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOWNLOAD_DIR = path.join(__dirname, "downloads");

if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

// ✅ OPTIMIZED shared client for FASTER downloads
export const client = new WebTorrent({
  maxConns: 500, // Max simultaneous connections (default 55)
  maxWebConns: 200, // Max WebRTC connections
  uploadLimit: 10 * 1024 * 1024, // 10 MB/s upload (prioritize download)
  downloadLimit: -1, // Unlimited download speed
  dht: true, // Enable DHT peer discovery
  tracker: true, // Enable tracker communication
  lsd: true, // Local Service Discovery
  pex: true, // Peer Exchange
  // NOTE: Removed STUN/ICE servers as requested — relying on TCP/UDP trackers, DHT, PEX and LSD for peer discovery
});

// global safety logs
client.on("error", (err) => console.error("❌ Client error:", err.message));
client.on("warning", (err) => console.warn("⚠️ Client warning:", err.message));

/**
 * Download torrent safely
 * @param {string} magnetLink
 * @param {number} metadataTimeoutMs
 * @param {number} stallTimeoutMs
 * @returns {Promise<Array<{name:string,path:string,size:number}>>}
 */
export function downloadTorrent(
  magnetLink,
  metadataTimeoutMs = 60000,
  stallTimeoutMs = 120000
) {
  return new Promise((resolve, reject) => {
    console.log("\n⬇️ Starting torrent download");

    let torrent;
    let removed = false;
    let metadataReceived = false;
    let lastProgress = 0;

    // Add fallback public trackers to improve peer discovery (no STUN/ICE used)
    const addFallbackTrackers = (magnet) => {
      const trackers = [
        "udp://tracker.openbittorrent.com:80/announce",
        "udp://tracker.opentrackr.org:1337/announce",
        "udp://tracker.leechers-paradise.org:6969/announce",
        "udp://tracker.coppersurfer.tk:6969/announce",
        "udp://exodus.desync.com:6969/announce",
      ];
      // If the magnet link already includes trackers, append unique ones only
      const hasTr = /(&|\?)tr=/i.test(magnet);
      const append = trackers
        .map((t) => `&tr=${encodeURIComponent(t)}`)
        .join("");
      return hasTr ? magnet + append : magnet + append;
    };

    try {
      const magnetWithTrackers = addFallbackTrackers(magnetLink);
      torrent = client.add(magnetWithTrackers, { path: DOWNLOAD_DIR });
    } catch (err) {
      return reject(err);
    }

    /** SAFE CLEANUP */
    const cleanup = (reason) => {
      if (removed) return;
      removed = true;
      try {
        // release progress lock when cleaning up
        try {
          release("download");
        } catch (e) {}
      } catch (err) {}
      try {
        torrent.destroy({ destroyStore: false }, () => {});
      } catch (err) {
        /* ignore */
      }
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
      const sizeInMB = (torrent.length / 1024 / 1024).toFixed(2);
      console.log(`📦 Metadata received: ${torrent.name}`);
      console.log(`📂 Files: ${torrent.files.length} | Size: ${sizeInMB} MB`);
    });

    /** PROGRESS DISPLAY */
    let haveLock = false;
    torrent.on("download", () => {
      const percent = (torrent.progress * 100).toFixed(2);
      const speed = (torrent.downloadSpeed / 1024 / 1024).toFixed(2);
      const peers = torrent.numPeers;
      const timeRemaining =
        torrent.timeRemaining > 0
          ? (torrent.timeRemaining / 1000).toFixed(0)
          : "∞";
      const eta =
        timeRemaining === "∞"
          ? "∞"
          : timeRemaining > 3600
          ? `${(timeRemaining / 3600).toFixed(1)}h`
          : `${(timeRemaining / 60).toFixed(1)}m`;

      // Try to acquire lock if not owned; allows waiting progress to take over later
      if (!haveLock) {
        haveLock = tryAcquire("download");
        if (haveLock) console.log("\nℹ️ Showing download progress");
      }

      // Only print to console when we own the lock
      if (currentOwner() === "download") {
        process.stdout.write(
          `⏳ ${percent}% | 🚀 ${speed} MB/s | 👥 ${peers} peers | ⏱️ ETA: ${eta}       \r`
        );
      }
    });

    /** STALL DETECTOR (only AFTER metadata) - SMARTER with peer recovery */
    let stallWarned = false;
    const stallChecker = setInterval(() => {
      if (!metadataReceived) return;
      if (torrent.progress === lastProgress && torrent.progress < 1) {
        if (torrent.numPeers === 0) {
          if (!stallWarned) {
            console.warn(
              "\n⏳ No peers available! Searching for more peers..."
            );
            stallWarned = true;
          }
        } else if (stallWarned) {
          console.log("\n✅ Peers reconnected! Resuming download...");
          stallWarned = false;
        }
      } else {
        stallWarned = false; // Reset if progress is made
      }
      lastProgress = torrent.progress;
    }, Math.min(stallTimeoutMs, 20000)); // Check every 20 seconds max

    /** DONE */
    torrent.on("done", () => {
      clearInterval(stallChecker);
      console.log("\n✅ Download completed");

      // Release progress lock so waiting upload can show its progress
      try {
        release("download");
      } catch (err) {}

      const files = torrent.files.map((f) => ({
        name: f.name,
        path: path.resolve(DOWNLOAD_DIR, f.path), // Use absolute path
        size: f.length, // bytes, exact size from torrent metadata
      }));

      resolve(files);
    });

    // safety: if torrent emits an error
    torrent.on("error", (err) => {
      try {
        release("download");
      } catch (e) {}
      cleanup(`Torrent error: ${err.message}`);
    });
  });
}
