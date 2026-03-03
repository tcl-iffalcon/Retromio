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

// ─── Helpers ────────────────────────────────────────────────────────────────

function getBaseUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  return `${proto}://${req.get("host")}`;
}

function getUserConfig(req) {
  return {};
}

// ─── Configure Page ──────────────────────────────────────────────────────────

app.get("/configure", (req, res) => {
  const baseUrl = getBaseUrl(req);
  const manifestUrl = `${baseUrl}/manifest.json`;
  const stremioUrl = manifestUrl.replace(/^https?:\/\//, "stremio://");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Retromio</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0a0a0f; color: #e8e0d5; font-family: Georgia, serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 2rem; }
    .container { max-width: 480px; width: 100%; text-align: center; }
    img { width: 80px; margin-bottom: 1rem; filter: sepia(.3); }
    h1 { font-size: 2rem; letter-spacing: .15em; text-transform: uppercase; color: #c9a84c; }
    p { color: #7a6e60; font-style: italic; margin: .5rem 0 2rem; }
    .card { background: #13131a; border: 1px solid #2a2520; border-radius: 8px; padding: 2rem; }
    .desc { font-size: .9rem; color: #a09080; margin-bottom: 1.5rem; line-height: 1.6; }
    .btn { display: block; width: 100%; padding: 1rem; background: #c9a84c; color: #0a0a0f; border: none; border-radius: 6px; font-size: 1rem; font-family: Georgia, serif; font-weight: bold; letter-spacing: .1em; text-transform: uppercase; cursor: pointer; text-decoration: none; margin-bottom: .75rem; }
    .btn:hover { background: #e0bc5a; }
    .url { padding: .75rem; background: #0d0d12; border: 1px solid #2a2520; border-radius: 6px; font-size: .75rem; color: #7a6e60; word-break: break-all; margin-top: .75rem; }
    .badges { display: flex; gap: .5rem; justify-content: center; margin-top: 1.5rem; }
    .badge { padding: .3rem .75rem; border: 1px solid #2a2520; border-radius: 20px; font-size: .75rem; color: #7a6e60; }
  </style>
</head>
<body>
  <div class="container">
    <img src="https://img.icons8.com/fluency/96/retro-tv.png" alt="Retromio">
    <h1>Retromio</h1>
    <p>Vintage cinema, modern streams</p>
    <div class="card">
      <p class="desc">AI-generated retro illustration posters for every movie &amp; series — pulp fiction style, vintage Hollywood, dramatic lighting, rich colors.</p>
      <a class="btn" href="${stremioUrl}">📺 Install to Stremio</a>
      <div class="url">${manifestUrl}</div>
      <div class="badges">
        <span class="badge">Vidlink</span>
        <span class="badge">NetMirror</span>
        <span class="badge">TMDB</span>
        <span class="badge">AI Posters</span>
      </div>
    </div>
  </div>
</body>
</html>`);
});

// ─── Manifest ────────────────────────────────────────────────────────────────

app.get("/:config/manifest.json", (req, res) => {
  res.json(baseManifest);
});

app.get("/manifest.json", (req, res) => {
  res.json(baseManifest);
});

// ─── Backblaze B2 + Pollinations AI Poster ───────────────────────────────────

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

const AI_PENDING = new Map();
let activeRequests = 0;
const MAX_CONCURRENT = 5;   // fal.ai handles concurrent requests fine
const requestQueue = [];

// ── Cache version: bump this to invalidate all stored posters ────────────────
const POSTER_VERSION = "v5";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function processQueue() {
  while (requestQueue.length > 0 && activeRequests < MAX_CONCURRENT) {
    const next = requestQueue.shift();
    next();
  }
}

function posterKey(title, year) {
  const safe = (title || "unknown").replace(/[^a-z0-9]/gi, "_").toLowerCase();
  return `${POSTER_VERSION}_${safe}_${year || "0"}.jpg`;
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
    ContentType: "image/jpeg",
    ACL: "public-read"
  }));
}

async function generateWithFal(title, year, type) {
  // Style pool — picked deterministically per title for consistency
  const styles = [
    `1950s pulp fiction painted movie poster, dramatic oil painting, rich saturated reds oranges yellows, moody noir shadows, detailed expressive faces, action composition, bold vintage serif title at bottom`,
    `classic Hollywood golden age 1940s painted movie poster, warm amber crimson ivory palette, glamorous characters, dramatic lighting, art deco typography, cinematic grandeur`,
    `1960s Italian spaghetti western cinema poster, painterly illustration, vivid earthy tones, intense close-up faces, dust and drama, bold condensed title typography`,
    `1970s grindhouse exploitation painted poster, high contrast deep colors, gritty urban scene, intense action, worn texture, large bold retro title, illustrated not photographic`,
    `vintage 1950s pulp magazine adventure cover, richly painted illustration, vivid blues reds golds, heroic figures in dynamic pose, retro typography, painted not CGI`
  ];

  const styleIndex = Math.abs([...(title || "x")].reduce((a, c) => a + c.charCodeAt(0), 0)) % styles.length;
  const chosenStyle = styles[styleIndex];

  const prompt = [
    chosenStyle,
    `movie poster for the ${type === "series" ? "TV series" : "film"} "${title}"${year ? ` (${year})` : ""}`,
    `portrait orientation 2:3 ratio`,
    `highly detailed hand-painted illustration style`,
    `dramatic cinematic composition with characters`,
    `vintage tagline text at bottom`,
    `professional movie poster layout`,
    `no photorealism, no CGI look, no modern digital art aesthetic`,
    `rich deep colors, strong contrast, painterly texture`
  ].join(", ");

  const seed = Math.abs([...(title || "x")].reduce((a, c) => a + c.charCodeAt(0), 0));

  activeRequests++;
  try {
    console.log(`[AI Poster] fal.ai flux/dev request: "${title}" (style ${styleIndex})`);

    // Submit to flux/dev — much higher quality than schnell
    const submitRes = await fetch("https://queue.fal.run/fal-ai/flux/dev", {
      method: "POST",
      headers: {
        "Authorization": `Key ${process.env.FAL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt,
        image_size: { width: 512, height: 768 },
        num_inference_steps: 28,
        guidance_scale: 3.5,
        seed,
        num_images: 1,
        enable_safety_checker: false
      })
    });

    if (!submitRes.ok) {
      const txt = await submitRes.text();
      throw new Error(`fal.ai submit failed ${submitRes.status}: ${txt}`);
    }

    const { request_id } = await submitRes.json();
    console.log(`[AI Poster] fal.ai queued: ${request_id}`);

    // Poll for result
    for (let i = 0; i < 90; i++) {
      await sleep(2000);
      const statusRes = await fetch(`https://queue.fal.run/fal-ai/flux/dev/requests/${request_id}`, {
        headers: { "Authorization": `Key ${process.env.FAL_API_KEY}` }
      });
      if (!statusRes.ok) continue;
      const result = await statusRes.json();

      if (result.status === "COMPLETED" || result.images) {
        const imageUrl = result.images?.[0]?.url || result.image?.url;
        if (!imageUrl) throw new Error("fal.ai: no image in response");
        console.log(`[AI Poster] fal.ai done: "${title}"`);
        const imgRes = await fetch(imageUrl);
        if (!imgRes.ok) throw new Error(`Image download failed: ${imgRes.status}`);
        return await imgRes.buffer();
      }

      if (result.status === "FAILED") throw new Error(`fal.ai job failed: ${JSON.stringify(result)}`);
    }

    throw new Error("fal.ai: timed out waiting for result");
  } finally {
    activeRequests--;
    processQueue();
  }
}

// Pre-generate poster in background and store in B2
async function prewarmPoster(title, year, type) {
  const key = posterKey(title, year);
  if (await existsInB2(key)) return;
  if (AI_PENDING.has(key)) return;

  const promise = new Promise((resolve, reject) => {
    const task = async () => {
      try {
        const buf = await generateWithFal(title, year, type);
        await uploadToB2(key, buf);
        console.log(`[AI Poster] Stored in B2: ${key}`);
        resolve();
      } catch (err) {
        console.error(`[AI Poster] Prewarm failed: ${key} — ${err.message}`);
        reject(err);
      } finally {
        AI_PENDING.delete(key);
      }
    };
    if (activeRequests < MAX_CONCURRENT) task();
    else requestQueue.push(task);
  });

  AI_PENDING.set(key, promise);
}

app.get("/ai-poster", async (req, res) => {
  const { title, year, type } = req.query;
  const fallback = req.query.fallback;

  if (!title) {
    if (fallback) return res.redirect(fallback);
    return res.status(400).send("Missing title");
  }

  const key = posterKey(title, year);

  // 1. Check B2 first — instant if exists
  try {
    const exists = await existsInB2(key);
    if (exists) {
      console.log(`[AI Poster] B2 hit: ${key}`);
      return res.redirect(`${B2_PUBLIC}/${key}`);
    }
  } catch (err) {
    console.error(`[AI Poster] B2 check error: ${err.message}`);
  }

  // 2. Deduplicate concurrent requests for same poster
  if (AI_PENDING.has(key)) {
    try {
      await AI_PENDING.get(key);
      return res.redirect(`${B2_PUBLIC}/${key}`);
    } catch {
      if (fallback) return res.redirect(fallback);
      return res.status(500).send("Failed");
    }
  }

  console.log(`[AI Poster] Generating: "${title}" (active=${activeRequests})`);

  const promise = new Promise((resolve, reject) => {
    const task = async () => {
      try {
        const buf = await generateWithFal(title, year, type);
        await uploadToB2(key, buf);
        console.log(`[AI Poster] Done + stored: ${key}`);
        resolve();
      } catch (err) {
        console.error(`[AI Poster] Error: ${key} — ${err.message}`);
        reject(err);
      } finally {
        AI_PENDING.delete(key);
      }
    };
    if (activeRequests < MAX_CONCURRENT) task();
    else requestQueue.push(task);
  });

  AI_PENDING.set(key, promise);

  try {
    await promise;
    res.redirect(`${B2_PUBLIC}/${key}`);
  } catch {
    if (fallback) return res.redirect(fallback);
    res.status(500).send("Failed");
  }
});

// Called from catalog to prewarm posters in background
app.get("/prewarm", async (req, res) => {
  res.json({ ok: true }); // respond immediately
});

// ─── Catalog ──────────────────────────────────────────────────────────────────

async function handleCatalog(req, res) {
  const { type, id } = req.params;
  const baseUrl = getBaseUrl(req);
  const skip = parseInt(req.query.skip || req.params.extra?.replace("skip=", "") || "0");
  console.log(`[Catalog] type=${type} id=${id} skip=${skip}`);
  try {
    const metas = await fetchCatalog(id, type, skip, baseUrl);
    res.json({ metas });
  } catch (err) {
    console.error(`[Catalog] Error: ${err.message}`);
    res.json({ metas: [] });
  }
}
app.get("/catalog/:type/:id/:extra?.json", handleCatalog);
app.get("/:config/catalog/:type/:id/:extra?.json", handleCatalog);

// ─── Meta ─────────────────────────────────────────────────────────────────────

async function handleMeta(req, res) {
  const { type, id } = req.params;
  console.log(`[Meta] type=${type} id=${id}`);
  try {
    const meta = await fetchMeta(id, type);
    if (!meta) return res.json({ meta: null });
    res.json({ meta });
  } catch (err) {
    console.error(`[Meta] Error: ${err.message}`);
    res.json({ meta: null });
  }
}
app.get("/meta/:type/:id.json", handleMeta);
app.get("/:config/meta/:type/:id.json", handleMeta);

// ─── Stream ───────────────────────────────────────────────────────────────────

async function handleStream(req, res) {
  const { type, id } = req.params;
  console.log(`[Stream] type=${type} id=${id}`);
  try {
    const streams = await fetchStreams(id, type);
    res.json({ streams: streams || [] });
  } catch (err) {
    console.error(`[Stream] Error: ${err.message}`);
    res.json({ streams: [] });
  }
}
app.get("/stream/:type/:id.json", handleStream);
app.get("/:config/stream/:type/:id.json", handleStream);

// ─── Root redirect ────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  res.redirect("/configure");
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🎬 Retromio running on port ${PORT}`);
  console.log(`📺 Configure: http://localhost:${PORT}/configure`);
  console.log(`📋 Manifest:  http://localhost:${PORT}/manifest.json\n`);
});
