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

// ─── AYARLAR (Hız Sınırı ve AI Yönetimi) ───────────────────────────────────
const MAX_CONCURRENT = 1; // 530 hatasını önlemek için sırayla işler
let activeRequests = 0;
const requestQueue = [];
const AI_PENDING = new Map();

// ─── BACKBLAZE B2 YAPILANDIRMASI ───────────────────────────────────────────
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

// ─── YARDIMCI FONKSİYONLAR ──────────────────────────────────────────────────
function processQueue() {
  while (requestQueue.length > 0 && activeRequests < MAX_CONCURRENT) {
    const next = requestQueue.shift();
    next();
  }
}

function posterKey(title, year) {
  const safe = (title || "unknown").replace(/[^a-z0-9]/gi, "_").toLowerCase();
  return `${safe}_${year || "0"}_v2.jpg`; // v2 ile eski görselleri yeniliyoruz
}

async function existsInB2(key) {
  try {
    await B2.send(new HeadObjectCommand({ Bucket: B2_BUCKET, Key: key }));
    return true;
  } catch { return false; }
}

async function uploadToB2(key, buffer) {
  await B2.send(new PutObjectCommand({
    Bucket: B2_BUCKET, Key: key, Body: buffer, ContentType: "image/jpeg"
  }));
}

// ─── AI POSTER ÜRETİMİ (Pollinations) ───────────────────────────────────────
async function generateWithPollinations(title, year, type) {
  // İstediğin retro çizgi roman tarzı için optimize edilmiş prompt
  const prompt = `minimalist vintage movie poster, high contrast comic book art, bold black ink outlines, flat colors, limited palette of yellow, black and red, screen print aesthetic, Saul Bass style, distressed paper texture, retro bold typography, ${type === "series" ? "TV show" : "film"}, title: "${title}" ${year ? `(${year})` : ""}`;

  const seed = Math.abs([...(title || "x")].reduce((a, c) => a + c.charCodeAt(0), 0));
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=768&seed=${seed}&nologo=true&model=flux`;

  activeRequests++;
  try {
    const res = await fetch(url, { timeout: 60000 });
    if (!res.ok) throw new Error(`Pollinations API Hatası: ${res.status}`);
    const buffer = await res.buffer();
    if (buffer.length < 3000) throw new Error("Görsel verisi hatalı");
    return buffer;
  } finally {
    activeRequests--;
    processQueue();
  }
}

// ─── ANA ENDPOINT: AI POSTER ───────────────────────────────────────────────
app.get("/ai-poster", async (req, res) => {
  const { title, year, type, fallback } = req.query;
  if (!title) return fallback ? res.redirect(fallback) : res.status(400).send("Başlık eksik");

  const key = posterKey(title, year);
  try {
    if (await existsInB2(key)) return res.redirect(`${B2_PUBLIC}/${key}`);
  } catch (err) {}

  if (AI_PENDING.has(key)) {
    try { await AI_PENDING.get(key); return res.redirect(`${B2_PUBLIC}/${key}`); }
    catch { return fallback ? res.redirect(fallback) : res.status(500).send("Hata"); }
  }

  const genPromise = new Promise((resolve, reject) => {
    const task = async () => {
      try {
        const buf = await generateWithPollinations(title, year, type);
        await uploadToB2(key, buf);
        resolve();
      } catch (err) { reject(err); }
      finally { AI_PENDING.delete(key); }
    };
    if (activeRequests < MAX_CONCURRENT) task(); else requestQueue.push(task);
  });

  AI_PENDING.set(key, genPromise);
  try { await genPromise; res.redirect(`${B2_PUBLIC}/${key}`); }
  catch (err) { fallback ? res.redirect(fallback) : res.status(500).send("Üretim başarısız"); }
});

// ─── STREMIO FONKSİYONLARI (Katalog, Meta, Stream) ──────────────────────────
async function handleCatalog(req, res) {
  const { type, id } = req.params;
  const baseUrl = `${req.headers["x-forwarded-proto"] || req.protocol}://${req.get("host")}`;
  const skip = parseInt(req.query.skip || req.params.extra?.replace("skip=", "") || "0");
  try {
    const metas = await fetchCatalog(id, type, skip, baseUrl);
    res.json({ metas: metas || [] });
  } catch (err) { res.json({ metas: [] }); }
}

async function handleMeta(req, res) {
  try {
    const meta = await fetchMeta(req.params.id, req.params.type);
    res.json({ meta: meta || null });
  } catch (err) { res.json({ meta: null }); }
}

async function handleStream(req, res) {
  try {
    const streams = await fetchStreams(req.params.id, req.params.type);
    res.json({ streams: streams || [] });
  } catch (err) { res.json({ streams: [] }); }
}

// ─── ROTARLAR (Routes) ──────────────────────────────────────────────────────
app.get("/catalog/:type/:id/:extra?.json", handleCatalog);
app.get("/:config/catalog/:type/:id/:extra?.json", handleCatalog);
app.get("/meta/:type/:id.json", handleMeta);
app.get("/:config/meta/:type/:id.json", handleMeta);
app.get("/stream/:type/:id.json", handleStream);
app.get("/:config/stream/:type/:id.json", handleStream);
app.get("/manifest.json", (req, res) => res.json(baseManifest));
app.get("/:config/manifest.json", (req, res) => res.json(baseManifest));

app.get("/configure", (req, res) => {
  res.send("<h1>Retromio Yapılandırma Sayfası</h1><p>Stremio'ya eklemek için manifest URL'sini kullanın.</p>");
});

app.get("/", (req, res) => res.redirect("/configure"));

// ─── BAŞLAT ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🎬 Retromio v2 Tam Sürüm Çalışıyor: ${PORT}`);
});
