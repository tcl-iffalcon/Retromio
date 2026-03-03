const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const path = require("path");

global.fetch = fetch;

const { fetchCatalog } = require("./catalog");
const { fetchMeta } = require("./meta");
const { fetchStreams } = require("./stream");
const baseManifest = require("./manifest.json");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ─── Ayarlar ────────────────────────────────────────────────────────────────

const MAX_CONCURRENT = 1; // Hata almamak için eş zamanlı isteği 1'e indirdik
let activeRequests = 0;
const requestQueue = [];
const AI_PENDING = new Map();

// ─── Backblaze B2 Yapılandırması ───────────────────────────────────────────

const { S3Client, PutObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");

const B2 = new S3Client({
  endpoint: "https://s3.us-east-005.backblazeb2.com",
  region: "us-east-005",
  credentials: {
    accessKeyId: process.env.B2_KEY_ID || "f2d571efe5e4",
    secretAccessKey: process.env.B2_APP_KEY
  }
});

const B2_BUCKET = "retromio-posters";
const B2_PUBLIC = `https://f2d571efe5e4.s3.us-east-005.backblazeb2.com/${B2_BUCKET}`;

// ─── Yardımcı Fonksiyonlar ──────────────────────────────────────────────────

function processQueue() {
  while (requestQueue.length > 0 && activeRequests < MAX_CONCURRENT) {
    const next = requestQueue.shift();
    next();
  }
}

// Versiyon ekledik (_v2) ki eski hatalı/istenmeyen görseller yerine yenileri gelsin
function posterKey(title, year) {
  const safe = (title || "unknown").replace(/[^a-z0-9]/gi, "_").toLowerCase();
  return `${safe}_${year || "0"}_v2.jpg`; 
}

async function existsInB2(key) {
  try {
    await B2.send(new HeadObjectCommand({ Bucket: B2_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function uploadToB2(key, buffer) {
  await B2.send(new PutObjectCommand({
    Bucket: B2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: "image/jpeg"
  }));
}

// ─── AI Poster Üretimi (Pollinations) ───────────────────────────────────────

async function generateWithPollinations(title, year, type) {
  // İstediğin görsel tarzı için optimize edilmiş PROMPT
  const prompt = `minimalist vintage movie poster, high contrast comic book art, bold black ink outlines, flat colors, limited palette of yellow, black and red, screen print aesthetic, Saul Bass style, distressed paper texture, retro bold typography, ${type === "series" ? "TV show" : "film"}, title: "${title}" ${year ? `(${year})` : ""}`;

  const seed = Math.abs([...(title || "x")].reduce((a, c) => a + c.charCodeAt(0), 0));
  
  // Model olarak 'flux' detay için en iyisidir, hata devam ederse 'turbo' denenebilir
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=768&seed=${seed}&nologo=true&model=flux`;

  activeRequests++;
  try {
    console.log(`[AI Poster] Requesting Pollinations for: "${title}"`);
    const res = await fetch(url, { timeout: 60000 });
    
    if (!res.ok) throw new Error(`Pollinations API Error: ${res.status}`);
    
    const buffer = await res.buffer();
    if (buffer.length < 3000) throw new Error("Generated image is empty or corrupted");

    return buffer;
  } finally {
    activeRequests--;
    processQueue();
  }
}

// ─── Ana Endpoint: /ai-poster ──────────────────────────────────────────────

app.get("/ai-poster", async (req, res) => {
  const { title, year, type, fallback } = req.query;

  if (!title) {
    return fallback ? res.redirect(fallback) : res.status(400).send("Missing title");
  }

  const key = posterKey(title, year);

  // 1. Önce B2'de var mı bak (Hızlı yanıt)
  try {
    if (await existsInB2(key)) {
      return res.redirect(`${B2_PUBLIC}/${key}`);
    }
  } catch (err) {
    console.error("[B2 Check Error]", err.message);
  }

  // 2. Eğer şu an üretiliyorsa bekle
  if (AI_PENDING.has(key)) {
    try {
      await AI_PENDING.get(key);
      return res.redirect(`${B2_PUBLIC}/${key}`);
    } catch {
      return fallback ? res.redirect(fallback) : res.status(500).send("Generation failed");
    }
  }

  // 3. Yeni poster üret
  const generationPromise = new Promise((resolve, reject) => {
    const task = async () => {
      try {
        const buf = await generateWithPollinations(title, year, type);
        await uploadToB2(key, buf);
        console.log(`[AI Poster] Success & Stored: ${key}`);
        resolve();
      } catch (err) {
        console.error(`[AI Poster] Failed: ${title} - ${err.message}`);
        reject(err);
      } finally {
        AI_PENDING.delete(key);
      }
    };

    if (activeRequests < MAX_CONCURRENT) task();
    else requestQueue.push(task);
  });

  AI_PENDING.set(key, generationPromise);

  try {
    await generationPromise;
    res.redirect(`${B2_PUBLIC}/${key}`);
  } catch (err) {
    // Hata durumunda (530 dahil) eğer varsa orijinal posteri göster
    if (fallback) return res.redirect(fallback);
    res.status(500).send("Poster generation failed");
  }
});

// ─── Diğer Rotalar (Katalog, Meta, Stream) ──────────────────────────────────

// ... (Daha önceki handleCatalog, handleMeta vb. fonksiyonların aynısı)
app.get("/catalog/:type/:id/:extra?.json", handleCatalog);
app.get("/meta/:type/:id.json", handleMeta);
app.get("/stream/:type/:id.json", handleStream);

// ... (Geri kalan route tanımları)

app.listen(PORT, () => {
  console.log(`🎬 Retromio Revize Edildi - Port: ${PORT}`);
});
