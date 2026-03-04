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

// ─── Backblaze B2 + AI Poster ────────────────────────────────────────────────

const B2_KEY_ID = process.env.B2_KEY_ID || "";
const B2_APP_KEY = process.env.B2_APP_KEY || "";
const B2_BUCKET = "retromio-posters";
const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_PUBLIC = `https://${B2_BUCKET}.s3.us-east-005.backblazeb2.com`;

function b2AuthHeader() {
  const token = Buffer.from(`${B2_KEY_ID}:${B2_APP_KEY}`).toString("base64");
  return `Basic ${token}`;
}

async function existsInB2(key) {
  try {
    const res = await fetch(`${B2_ENDPOINT}/${B2_BUCKET}/${key}`, {
      method: "HEAD",
      headers: { "Authorization": b2AuthHeader() }
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function uploadToB2(key, buffer) {
  const res = await fetch(`${B2_ENDPOINT}/${B2_BUCKET}/${key}`, {
    method: "PUT",
    headers: {
      "Authorization": b2AuthHeader(),
      "Content-Type": "image/jpeg",
      "x-amz-acl": "public-read"
    },
    body: buffer
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`B2 upload failed ${res.status}: ${txt}`);
  }
}
let activeRequests = 0;
const MAX_CONCURRENT = 2;   // fal.ai free tier limit is 2 concurrent
const requestQueue = [];

const AI_PENDING = new Map();
const POSTER_VERSION = "v13";

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




// TMDB genre ID → genre name map
const GENRE_MAP = {
  28: "action", 12: "adventure", 16: "animation", 35: "comedy",
  80: "crime", 99: "documentary", 18: "drama", 10751: "family",
  14: "fantasy", 36: "history", 27: "horror", 10402: "music",
  9648: "mystery", 10749: "romance", 878: "science fiction",
  10770: "tv movie", 53: "thriller", 10752: "war", 37: "western",
  10759: "action & adventure", 10762: "kids", 10763: "news",
  10764: "reality", 10765: "sci-fi & fantasy", 10766: "soap",
  10767: "talk", 10768: "war & politics"
};

function buildPrompt(title, year, type, genreIds, overview) {
  const ids = (genreIds || "").split(",").map(Number).filter(Boolean);
  const genreNames = ids.map(id => GENRE_MAP[id]).filter(Boolean);
  const primaryGenre = genreNames[0] || "drama";

  // Genre-aware style selection
  const genreStyles = {
    horror: `terrifying 1970s horror movie poster, dark gothic atmosphere, deep crimson black shadows, menacing figures, dripping paint texture, screaming bold title, painted illustration`,
    thriller: `1960s psychological thriller painted poster, cold blue grey palette, tense shadowy figures, paranoid atmosphere, stark contrast, bold condensed title`,
    "science fiction": `retro 1950s sci-fi painted movie poster, deep space blues purples, futuristic characters and technology, dramatic cosmic scene, bold retro-futurist typography`,
    "sci-fi & fantasy": `retro 1950s sci-fi painted movie poster, deep space blues purples, futuristic characters and technology, dramatic cosmic scene, bold retro-futurist typography`,
    action: `explosive 1980s action movie painted poster, intense orange red fiery palette, heroic muscular figures, dramatic explosion background, bold aggressive title typography`,
    "action & adventure": `explosive 1980s action movie painted poster, intense orange red fiery palette, heroic figures in combat, dramatic scene, bold aggressive title typography`,
    adventure: `classic 1950s adventure painted movie poster, rich jungle greens golden yellows, heroic explorer figures, exotic dramatic scene, bold adventurous title`,
    romance: `elegant 1940s romantic painted movie poster, soft warm rose gold ivory palette, glamorous couple, dreamy atmosphere, flowing art nouveau typography`,
    comedy: `fun vintage 1960s comedy painted movie poster, bright cheerful warm palette, expressive comedic characters, playful scene, bold colorful title`,
    animation: `vintage 1950s illustrated movie poster, vibrant jewel tone colors, whimsical characters, magical scene, bold playful retro title typography`,
    fantasy: `epic fantasy painted movie poster, deep jewel tones purple gold emerald, mythical characters and creatures, grand dramatic scene, ornate fantasy typography`,
    crime: `1940s film noir painted movie poster, dramatic high contrast, deep blacks cool blues, shadowy detective figures, smoky atmosphere, classic noir typography`,
    drama: `classic Hollywood 1950s painted drama poster, warm amber crimson cream palette, expressive emotional characters, intimate cinematic scene, elegant serif title`,
    war: `powerful 1940s war painted movie poster, muted olive grey brown palette, soldiers in dramatic battle scene, gritty atmosphere, bold patriotic typography`,
    western: `classic 1960s western painted movie poster, warm dusty desert palette, lone cowboy silhouette, dramatic sunset, bold slab serif title typography`,
    history: `epic historical painted movie poster, rich earthy tones gold bronze, period-accurate costumes and setting, grand dramatic composition, classical typography`,
    mystery: `atmospheric 1950s mystery painted poster, moody blue purple shadows, mysterious figure in fog, suspenseful composition, elegant serif title`,
    family: `warm vintage 1950s family adventure poster, bright cheerful palette, wholesome characters in exciting scene, friendly retro typography`
  };

  const style = genreStyles[primaryGenre] || `classic 1950s Hollywood painted movie poster, rich warm palette, dramatic characters, cinematic composition, bold vintage typography`;

  const plotHint = overview ? overview.substring(0, 120) : "";

  const prompt = [
    style,
    `movie poster for the ${type === "series" ? "TV series" : "film"} "${title}"${year ? ` (${year})` : ""}`,
    plotHint ? `scene inspired by: ${plotHint}` : "",
    `portrait orientation 2:3`,
    `highly detailed hand-painted illustration`,
    `dramatic cinematic composition with characters`,
    `vintage tagline at bottom`,
    `professional vintage movie poster layout`,
    `NOT flat design, NOT yellow background, NOT minimalist, NOT comic book flat outline`,
    `rich deep colors, strong cinematic contrast, painterly oil texture`
  ].filter(Boolean).join(", ");

  return { prompt, styleLabel: primaryGenre };
}

async function generateWithFal(title, year, type, genreIds, overview) {
  const { prompt, styleLabel } = buildPrompt(title, year, type, genreIds, overview);
  const seed = Math.abs([...(title || "x")].reduce((a, c) => a + c.charCodeAt(0), 0));

  activeRequests++;
  try {
    console.log(`[AI Poster] Pollinations request: "${title}" (genre: ${styleLabel})`);

    const encodedPrompt = encodeURIComponent(prompt);
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=768&seed=${seed}&nologo=true&model=flux`;

    const res = await fetch(url, { timeout: 120000 });

    if (!res.ok) {
      throw new Error(`Pollinations failed ${res.status}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length < 1000) throw new Error(`Pollinations returned too small response: ${buffer.length} bytes`);

    console.log(`[AI Poster] Pollinations done: "${title}" (${buffer.length} bytes)`);
    return buffer;
  } finally {
    activeRequests--;
    processQueue();
  }
}

// Pre-generate poster in background and store in B2
async function prewarmPoster(title, year, type, genres = "", overview = "") {
  const key = posterKey(title, year);
  if (await existsInB2(key)) return;
  if (AI_PENDING.has(key)) return;

  const promise = new Promise((resolve, reject) => {
    const task = async () => {
      try {
        const buf = await generateWithFal(title, year, type, genres, overview);
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
  const { title, year, type, genres, overview } = req.query;
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
        const buf = await generateWithFal(title, year, type, genres, overview);
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
  const baseUrl = getBaseUrl(req);
  console.log(`[Meta] type=${type} id=${id}`);
  try {
    const meta = await fetchMeta(id, type, baseUrl);
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
