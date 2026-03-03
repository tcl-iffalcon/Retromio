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
      <p class="desc">AI-generated retro illustration posters for every movie &amp; series — comic book style, bold ink outlines, limited color palette.</p>
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

// ─── AI Poster via fal.ai ───────────────────────────────────────────────────

const AI_CACHE = new Map(); // in-memory cache

app.get("/ai-poster", async (req, res) => {
  const { title, year, type } = req.query;
  const fallback = req.query.fallback;

  if (!title) {
    if (fallback) return res.redirect(fallback);
    return res.status(400).send("Missing title");
  }

  const cacheKey = `${title}_${year}`;
  if (AI_CACHE.has(cacheKey)) {
    console.log(`[AI Poster] Cache hit: "${title}"`);
    const cached = AI_CACHE.get(cacheKey);
    res.set("Content-Type", "image/jpeg");
    res.set("Cache-Control", "public, max-age=604800");
    return res.send(cached);
  }

  const FAL_KEY = process.env.FAL_API_KEY;
  if (!FAL_KEY) {
    console.error("[AI Poster] FAL_API_KEY not set");
    if (fallback) return res.redirect(fallback);
    return res.status(500).send("No API key");
  }

  const prompt = `alternative movie poster illustration, bold black ink outlines, flat colors, limited palette yellow red black white cream, screen print style, retro typography, graphic novel aesthetic, no photorealism, portrait orientation, title text: "${title}"${year ? ` (${year})` : ""}, ${type === "series" ? "TV series" : "film"}`;

  console.log(`[AI Poster] Generating via fal.ai: "${title}"`);

  try {
    const falRes = await fetch("https://fal.run/fal-ai/flux/schnell", {
      method: "POST",
      headers: {
        "Authorization": `Key ${FAL_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt,
        image_size: { width: 400, height: 600 },
        num_inference_steps: 4,
        num_images: 1,
        enable_safety_checker: false
      }),
      timeout: 30000
    });

    if (!falRes.ok) {
      const errText = await falRes.text();
      throw new Error(`fal.ai ${falRes.status}: ${errText.slice(0, 100)}`);
    }

    const data = await falRes.json();
    const imageUrl = data?.images?.[0]?.url;
    if (!imageUrl) throw new Error("No image URL in fal.ai response");

    // Fetch the actual image
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`Image fetch failed: ${imgRes.status}`);
    const buffer = await imgRes.buffer();

    AI_CACHE.set(cacheKey, buffer);
    console.log(`[AI Poster] Success: "${title}" (${buffer.length} bytes)`);

    res.set("Content-Type", "image/jpeg");
    res.set("Cache-Control", "public, max-age=604800");
    res.send(buffer);

  } catch (err) {
    console.error(`[AI Poster] Error: ${err.message}`);
    if (fallback) return res.redirect(fallback);
    res.status(500).send("Failed");
  }
});

// ─── Catalog ──────────────────────────────────────────────────────────────────

// Catalog - with or without config prefix
async function handleCatalog(req, res) {
  const { type, id } = req.params;
  const baseUrl = getBaseUrl(req);
  const skip = parseInt(req.query.skip || "0");
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
