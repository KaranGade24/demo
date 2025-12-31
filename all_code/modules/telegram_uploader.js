import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import path from "path";
import { PassThrough } from "stream";
import fetch from "node-fetch";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { saveIndex } from "../db/config.js";
/* ================= CONFIG ================= */

const BOT_TOKEN =
  process.env.TG_BOT_TOKEN || "8518518247:AAHB_nRYq_iS7bcRCXk0MGqnrKbF_AOgrlE";
const CHANNEL_ID = "-1002459562680";
const BASE_API_URL = "http://localhost:8081"; // local telegram bot api
const OMDB_KEY = process.env.OMDB_KEY || "2a8c2a76";
const TMP_DIR = "./tmp";
const INDEX_FILE = "./uploaded_index.json";

fs.mkdirSync(TMP_DIR, { recursive: true });

/* ================= HELPERS ================= */

ffmpeg.setFfmpegPath(ffmpegPath);

function getVideoMeta(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, meta) => {
      if (err || !meta) {
        return resolve({ duration: 0, width: 0, height: 0 });
      }

      const stream =
        meta.streams.find((s) => s.width && s.height) || meta.streams[0] || {};

      // Try multiple places for duration: format.duration, stream.duration
      const rawDuration = Number(meta.format?.duration || stream.duration || 0);
      const duration = Number.isFinite(rawDuration)
        ? Math.max(0, Math.round(rawDuration))
        : 0;

      resolve({
        duration,
        width: stream.width || 0,
        height: stream.height || 0,
      });
    });
  });
}

const VIDEO_EXT = new Set([
  ".mp4",
  ".mkv",
  ".avi",
  ".mov",
  ".webm",
  ".flv",
  ".ts",
  ".mpeg",
  ".mpg",
]);

function getMimeType(ext) {
  switch (ext) {
    case ".mp4":
      return "video/mp4";
    case ".mkv":
      return "video/x-matroska";
    case ".webm":
      return "video/webm";
    case ".avi":
      return "video/x-msvideo";
    case ".mov":
      return "video/quicktime";
    case ".flv":
      return "video/x-flv";
    case ".ts":
      return "video/mp2t";
    case ".mpeg":
    case ".mpg":
      return "video/mpeg";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    default:
      return "application/octet-stream";
  }
}

const humanSize = (b) => {
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) {
    b /= 1024;
    i++;
  }
  return `${b.toFixed(2)} ${u[i]}`;
};

function cleanTitle(name) {
  return name
    .replace(/\.(mp4|mkv|avi|mov|webm|flv|ts|mpeg|mpg)$/i, "")
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function generateVideoThumbnailFromVideo(
  filePath,
  duration = 0,
  size = 320
) {
  const out = `${TMP_DIR}/thumb_${Date.now()}.jpg`;
  return new Promise((resolve) => {
    // choose timestamp: prefer 5 minutes if long, else 5% into video, minimum 1s
    let timestamp = "1";
    try {
      const d = Number(duration) || 0;
      if (d >= 300) timestamp = "300";
      else if (d > 10) timestamp = String(Math.max(1, Math.floor(d * 0.05)));
      else timestamp = "1";
    } catch (err) {
      timestamp = "1";
    }

    console.log("ℹ️ Generating thumbnail at timestamp:", timestamp);
    ffmpeg(filePath)
      .screenshots({
        timestamps: [timestamp],
        filename: path.basename(out),
        folder: TMP_DIR,
        size: `${size}x?`,
      })
      .on("end", async () => {
        const ok = await optimizeThumbnail(out, filePath);
        resolve(ok ? out : null);
      })
      .on("error", (err) => {
        console.warn("⚠️ generateVideoThumbnailFromVideo failed:", err.message);
        resolve(null);
      });
  });
}

async function optimizeThumbnail(thumbPath, filePath) {
  try {
    const stat = await fs.promises.stat(thumbPath);
    const maxSize = 200 * 1024; // 200 KB recommended by Telegram
    if (stat.size <= maxSize) return true;

    // Try smaller sizes to get under limit
    const sizes = [240, 160, 120];
    for (const s of sizes) {
      const out = `${TMP_DIR}/thumb_opt_${s}_${Date.now()}.jpg`;
      try {
        await new Promise((resolve, reject) => {
          ffmpeg(filePath)
            .outputOptions(["-vframes 1", "-q:v 6"])
            .size(`${s}x?`)
            .output(out)
            .on("end", resolve)
            .on("error", reject)
            .run();
        });

        const newStat = await fs.promises.stat(out);
        if (newStat.size <= maxSize) {
          // replace original thumb
          await fs.promises.unlink(thumbPath).catch(() => {});
          await fs.promises.rename(out, thumbPath);
          return true;
        }

        // not small enough, remove temporary
        await fs.promises.unlink(out).catch(() => {});
      } catch (err) {
        // ignore and try next size
      }
    }

    // still large; leave original but warn
    console.warn("⚠️ Thumbnail larger than recommended size:", stat.size);
    return true;
  } catch (err) {
    console.warn("⚠️ optimizeThumbnail failed:", err.message);
    return false;
  }
}

async function getThumbnail(title, filePath = null, duration = 0) {
  try {
    if (title) {
      const res = await fetch(
        `https://www.omdbapi.com/?apikey=${OMDB_KEY}&t=${encodeURIComponent(
          title
        )}`
      );
      const data = await res.json();
      if (data?.Poster && data.Poster !== "N/A") {
        const img = await fetch(data.Poster);
        const buf = Buffer.from(await img.arrayBuffer());
        const out = `${TMP_DIR}/poster_${Date.now()}.jpg`;
        fs.writeFileSync(out, buf);
        return out;
      }
    }
  } catch (err) {
    console.warn("⚠️ getThumbnail (OMDB) failed:", err.message);
  }

  // Fallback: generate thumbnail from the video itself (use duration to pick timestamp)
  if (filePath) {
    try {
      const gen = await generateVideoThumbnailFromVideo(filePath, duration);
      if (gen) return gen;
    } catch (err) {
      console.warn("⚠️ getThumbnail (fallback) failed:", err.message);
    }
  }

  return null;
}

// function saveIndex(entry) {
//   let data = [];
//   try {
//     if (fs.existsSync(INDEX_FILE)) {
//       const raw = fs.readFileSync(INDEX_FILE, "utf8");
//       data = JSON.parse(raw);
//       if (!Array.isArray(data)) data = [];
//     }
//   } catch (err) {
//     console.warn(
//       "⚠️ Could not read/parse index file, starting fresh:",
//       err.message
//     );
//     data = [];
//   }

//   data.push(entry);
//   try {
//     fs.writeFileSync(INDEX_FILE, JSON.stringify(data, null, 2));
//   } catch (err) {
//     console.warn("⚠️ Failed to write index file:", err.message);
//   }
// }

/* ================= MAIN UPLOAD ================= */

export async function uploadMediaAxios(filePath) {
  if (typeof filePath !== "string") {
    throw new TypeError("filePath must be a string");
  }

  const absPath = path.resolve(filePath);

  // ensure file exists and is readable
  try {
    await fs.promises.access(absPath, fs.constants.R_OK);
  } catch (err) {
    throw new Error(`File not found or unreadable: ${absPath}`);
  }

  let stat;
  try {
    stat = await fs.promises.stat(absPath);
  } catch (err) {
    throw new Error(`Unable to stat file: ${err.message}`);
  }

  const filename = path.basename(absPath);
  const ext = path.extname(filename).toLowerCase();
  const isVideo = VIDEO_EXT.has(ext);

  console.log("📤 Uploading:", filename);

  const title = cleanTitle(filename);
  let thumb = null;
  let meta = {};
  try {
    // probe metadata first so we can pick a good thumbnail timestamp
    meta = isVideo ? await getVideoMeta(absPath) : {};

    // If duration was not detected, try probing again (some containers need a second pass)
    if (isVideo && (!meta || !meta.duration)) {
      console.warn(
        "⚠️ Duration not detected on first probe; retrying ffprobe..."
      );
      const alt = await getVideoMeta(absPath);
      if (alt && alt.duration) {
        console.log("ℹ️ Duration found on retry:", alt.duration);
        meta = alt;
      } else {
        console.warn(
          "⚠️ Duration still unavailable; uploaded message may show 00:00"
        );
        try {
          console.warn("⚠️ ffprobe debug:", {
            format_duration: meta?.format?.duration || null,
            first_stream_duration: meta?.streams?.[0]?.duration || null,
            streams_count: meta?.streams?.length || 0,
          });
        } catch (err) {}
      }
    }

    // now get thumbnail, passing duration so a good frame can be chosen
    thumb = isVideo ? await getThumbnail(title, absPath, meta.duration) : null;
  } catch (err) {
    console.warn("⚠️ Warning: failed to get metadata/thumbnail:", err.message);
  }

  const form = new FormData();
  form.append("chat_id", CHANNEL_ID);
  form.append("parse_mode", "HTML");

  if (isVideo) {
    // Only enable supports_streaming for MP4 (Telegram streams mp4)
    // if (ext === ".mp4") 
    form.append("supports_streaming", "true");

    if (meta.duration)
      form.append("duration", Math.round(Number(meta.duration)));
    if (meta.width) form.append("width", String(meta.width));
    if (meta.height) form.append("height", String(meta.height));

    form.append(
      "caption",
      `🎬 <b>${title}</b>\n⏱ ${meta.duration || 0}s\n📦 ${humanSize(stat.size)}`
    );

    if (thumb) {
      form.append("thumbnail", fs.createReadStream(thumb), {
        filename: path.basename(thumb),
        contentType: getMimeType(path.extname(thumb).toLowerCase()),
      });
      console.log("ℹ️ Using thumbnail:", thumb);
    }

    form.append("video", fs.createReadStream(absPath), {
      filename,
      contentType: getMimeType(ext),
    });
  } else {
    form.append("caption", `📁 <b>${filename}</b>\n📦 ${humanSize(stat.size)}`);

    form.append("document", fs.createReadStream(absPath), {
      filename,
      contentType: getMimeType(ext),
    });
  }

  const endpoint = isVideo ? "sendVideo" : "sendDocument";

  // Prepare headers — include Content-Length when possible to avoid chunked requests
  const headers = form.getHeaders();
  try {
    const len = await new Promise((resolve, reject) =>
      form.getLength((err, l) => (err ? reject(err) : resolve(l)))
    );
    // set as string and ensure common casing
    headers["Content-Length"] = String(len);
    headers["Content-Type"] =
      headers["content-type"] || headers["Content-Type"];
  } catch (err) {
    console.warn(
      "⚠️ Could not calculate content length; proceeding without it:",
      err.message
    );
  }

  console.log("ℹ️ Upload headers:", {
    "Content-Type": headers["Content-Type"] || headers["content-type"],
    "Has-Content-Length": typeof headers["Content-Length"] !== "undefined",
  });

  // Stream progress via PassThrough to monitor bytes sent in Node
  const progressStream = new PassThrough();
  let uploaded = 0;
  const total = Number(headers["Content-Length"] || 0);
  form.pipe(progressStream);
  progressStream.on("data", (chunk) => {
    uploaded += chunk.length;
    if (total) {
      const pct = Math.min(100, ((uploaded / total) * 100).toFixed(2));
      process.stdout.write(
        `\r⬆️ Uploading ${filename}: ${uploaded}/${total} bytes (${pct}%)`
      );
    } else {
      process.stdout.write(
        `\r⬆️ Uploading ${filename}: ${humanSize(uploaded)} uploaded`
      );
    }
  });

  try {
    const res = await axios.post(
      `${BASE_API_URL}/bot${BOT_TOKEN}/${endpoint}`,
      progressStream,
      {
        headers,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 60_000,
      }
    );
    process.stdout.write("\n");

    if (!res?.data || res.data.ok === false) {
      throw new Error(
        `Upload failed: ${res?.data?.description || JSON.stringify(res?.data)}`
      );
    }

    const msg = res.data.result;
    const file = isVideo ? msg.video : msg.document;

    try {
      saveIndex({
        name: filename,
        file_id: file.file_id,
        unique_id: file.file_unique_id,
        size: file.file_size,
        duration: meta.duration || null,
        type: isVideo ? "video" : "document",
        uploaded_at: new Date().toISOString(),
      });
    } catch (err) {
      console.warn("⚠️ Warning: failed to save index:", err.message);
    }

    console.log("✅ Uploaded:", filename);
    return file;
  } catch (err) {
    const e = new Error(`Failed to upload ${filename}: ${err.message}`);
    e.cause = err;
    throw e;
  } finally {
    if (thumb) {
      try {
        await fs.promises.unlink(thumb);
      } catch (unlinkErr) {
        console.warn("⚠️ Failed to remove temp thumbnail:", unlinkErr.message);
      }
    }
  }
}







// // uploader.js
// // uploader.js
// const axios = require("axios");
// const FormData = require("form-data");
// const fs = require("fs");
// const path = require("path");
// const { PassThrough } = require("stream");
// const { execFile } = require("child_process");
// const fetch = require("node-fetch");
// const env = require("dotenv")

// env.config();
// /* ================= CONFIG ================= */

// const BOT_TOKEN = "8518518247:AAHB_nRYq_iS7bcRCXk0MGqnrKbF_AOgrlE";
// const CHANNEL_ID = "-1002459562680";
// const BASE_API_URL = "http://localhost:8081";
// const OMDB_KEY = process.env.OMDB_KEY || "2a8c2a76";

// console.log({
//   BOT_TOKEN,
//   CHANNEL_ID,
//   BASE_API_URL,
//   OMDB_KEY
// })

// const TMP_DIR = path.join(__dirname, "tmp");
// const INDEX_FILE = path.join(__dirname, "uploaded_index.json");

// fs.mkdirSync(TMP_DIR, { recursive: true });

// /* ================= CONSTANTS ================= */

// const VIDEO_EXT = new Set([
//   ".mp4", ".mkv", ".avi", ".mov", ".webm", ".flv", ".ts", ".mpeg", ".mpg"
// ]);

// /* ================= HELPERS ================= */

// function getMimeType(ext) {
//   return {
//     ".mp4": "video/mp4",
//     ".mkv": "video/x-matroska",
//     ".avi": "video/x-msvideo",
//     ".mov": "video/quicktime",
//     ".webm": "video/webm"
//   }[ext] || "application/octet-stream";
// }

// function humanSize(bytes) {
//   const u = ["B","KB","MB","GB"];
//   let i = 0;
//   while (bytes >= 1024 && i < u.length - 1) {
//     bytes /= 1024;
//     i++;
//   }
//   return `${bytes.toFixed(2)} ${u[i]}`;
// }

// function cleanTitle(name) {
//   return name
//     .replace(/\.(mp4|mkv|avi|mov|webm|flv|ts|mpeg|mpg)$/i, "")
//     .replace(/\./g, " ")
//     .replace(/\s+/g, " ")
//     .trim();
// }

// /* ================= ffprobe (DIRECT CLI) ================= */

// function getVideoMeta(filePath) {
//   return new Promise((resolve) => {
//     execFile(
//       "ffprobe",
//       [
//         "-v", "error",
//         "-select_streams", "v:0",
//         "-show_entries", "stream=width,height",
//         "-show_entries", "format=duration",
//         "-of", "json",
//         filePath
//       ],
//       (err, stdout) => {
//         if (err) {
//           return resolve({ duration: 0, width: 0, height: 0 });
//         }

//         try {
//           const json = JSON.parse(stdout);
//           const stream = json.streams?.[0] || {};
//           const duration = Math.round(Number(json.format?.duration || 0));

//           resolve({
//             duration: Number.isFinite(duration) ? duration : 0,
//             width: stream.width || 0,
//             height: stream.height || 0
//           });
//         } catch {
//           resolve({ duration: 0, width: 0, height: 0 });
//         }
//       }
//     );
//   });
// }

// /* ================= THUMBNAIL ================= */

// async function getThumbnail(title, filePath, duration) {
//   try {
//     const res = await fetch(
//       `https://www.omdbapi.com/?apikey=${OMDB_KEY}&t=${encodeURIComponent(title)}`
//     );
//     const data = await res.json();
//     if (data?.Poster && data.Poster !== "N/A") {
//       const img = await fetch(data.Poster);
//       const buf = Buffer.from(await img.arrayBuffer());
//       const out = path.join(TMP_DIR, `poster_${Date.now()}.jpg`);
//       fs.writeFileSync(out, buf);
//       return out;
//     }
//   } catch {}

//   // fallback → extract frame using ffmpeg CLI
//   const ts = duration > 60 ? Math.floor(duration * 0.1) : 1;
//   const out = path.join(TMP_DIR, `thumb_${Date.now()}.jpg`);

//   return new Promise((resolve) => {
//     execFile(
//       "ffmpeg",
//       ["-ss", String(ts), "-i", filePath, "-frames:v", "1", out],
//       () => resolve(fs.existsSync(out) ? out : null)
//     );
//   });
// }

// /* ================= MAIN UPLOAD ================= */

// async function uploadMediaAxios(filePath) {
//   const absPath = path.resolve(filePath);
//   await fs.promises.access(absPath, fs.constants.R_OK);

//   const stat = await fs.promises.stat(absPath);
//   const filename = path.basename(absPath);
//   const ext = path.extname(filename).toLowerCase();
//   const isVideo = VIDEO_EXT.has(ext);

//   console.log("📤 Uploading:", filename);

//   let meta = { duration: 0, width: 0, height: 0 };
//   let thumb = null;

//   if (isVideo) {
//     meta = await getVideoMeta(absPath);
//     thumb = await getThumbnail(cleanTitle(filename), absPath, meta.duration);
//   }

//   const form = new FormData();
//   form.append("chat_id", CHANNEL_ID);
//   form.append("parse_mode", "HTML");

//   if (isVideo) {
//     if (ext === ".mp4") form.append("supports_streaming", "true");

//     form.append("supports_streaming", "true");
//     if (meta.duration) form.append("duration", String(meta.duration));
//     if (meta.width) form.append("width", String(meta.width));
//     if (meta.height) form.append("height", String(meta.height));

//     form.append(
//       "caption",
//       `🎬 <b>${cleanTitle(filename)}</b>\n⏱ ${meta.duration}s\n📦 ${humanSize(stat.size)}`
//     );

//     if (thumb) {
//       form.append("thumbnail", fs.createReadStream(thumb));
//     }

//     form.append("video", fs.createReadStream(absPath), {
//       filename,
//       contentType: getMimeType(ext)
//     });
//   } else {
//     form.append("document", fs.createReadStream(absPath));
//   }

//   const headers = form.getHeaders();
//   const length = await new Promise((r, j) =>
//     form.getLength((e, l) => (e ? j(e) : r(l)))
//   );
//   headers["Content-Length"] = String(length);

//   const stream = new PassThrough();
//   form.pipe(stream);

//   const endpoint = isVideo ? "sendVideo" : "sendDocument";

//   const res = await axios.post(
//     `${BASE_API_URL}/bot${BOT_TOKEN}/${endpoint}`,
//     stream,
//     {
//       headers,
//       maxBodyLength: Infinity,
//       maxContentLength: Infinity,
//       timeout: 0
//     }
//   );

//   if (!res.data.ok) {
//     throw new Error(res.data.description);
//   }

//   console.log("✅ Uploaded:", filename);
//   return res.data.result;
// }

// module.exports = { uploadMediaAxios };


