const fetch = require("node-fetch");
const crypto = require("crypto");

const B2_KEY_ID = process.env.B2_KEY_ID || "";
const B2_APP_KEY = process.env.B2_APP_KEY || "";
const B2_BUCKET = "retromio-posters";
const B2_REGION = "us-east-005";
const B2_ENDPOINT = `https://s3.${B2_REGION}.backblazeb2.com`;
const B2_PUBLIC = `https://${B2_BUCKET}.s3.${B2_REGION}.backblazeb2.com`;
const POSTER_VERSION = "v13";

const AI_PENDING = new Map();
let activeRequests = 0;
const MAX_CONCURRENT = 2;
const requestQueue = [];

function posterKey(title, year) {
  const safe = (title || "unknown").replace(/[^a-z0-9]/gi, "_").toLowerCase();
  return `${POSTER_VERSION}_${safe}_${year || "0"}.jpg`;
}

function posterUrl(title, year) {
  return `${B2_PUBLIC}/${posterKey(title, year)}`;
}

function processQueue() {
  while (requestQueue.length > 0 && activeRequests < MAX_CONCURRENT) {
    const next = requestQueue.shift();
    next();
  }
}

function awsHeaders(method, key, body, contentType) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]/g, "").replace(/\.\d+Z/, "Z");
  const dateShort = amzDate.substring(0, 8);
  const host = `s3.${B2_REGION}.backblazeb2.com`;
  const bodyHash = crypto.createHash("sha256").update(body || "").digest("hex");
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${bodyHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [method, `/${B2_BUCKET}/${key}`, "", canonicalHeaders, signedHeaders, bodyHash].join("\n");
  const credentialScope = `${dateShort}/${B2_REGION}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${crypto.createHash("sha256").update(canonicalRequest).digest("hex")}`;
  const signingKey = ["aws4_request", "s3", B2_REGION, dateShort].reduceRight((k, d) => crypto.createHmac("sha256", k).update(d).digest(), `AWS4${B2_APP_KEY}`);
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  return {
    "Authorization": `AWS4-HMAC-SHA256 Credential=${B2_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    "Content-Type": contentType,
    "x-amz-content-sha256": bodyHash,
    "x-amz-date": amzDate
  };
}

async function existsInB2(key) {
  try {
    const headers = awsHeaders("HEAD", key, "", "application/octet-stream");
    const res = await fetch(`${B2_ENDPOINT}/${B2_BUCKET}/${key}`, { method: "HEAD", headers });
    return res.ok;
  } catch {
    return false;
  }
}

async function uploadToB2(key, buffer) {
  const headers = awsHeaders("PUT", key, buffer, "image/jpeg");
  const res = await fetch(`${B2_ENDPOINT}/${B2_BUCKET}/${key}`, { method: "PUT", headers, body: buffer });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`B2 upload failed ${res.status}: ${txt}`);
  }
}

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

async function generatePoster(title, year, type, genreIds, overview) {
  const { prompt, styleLabel } = buildPrompt(title, year, type, genreIds, overview);
  const seed = Math.abs([...(title || "x")].reduce((a, c) => a + c.charCodeAt(0), 0));
  activeRequests++;
  try {
    console.log(`[AI Poster] HuggingFace request: "${title}" (genre: ${styleLabel})`);
    const hfRes = await fetch(
      "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.HF_TOKEN}`,
          "Content-Type": "application/json",
          "x-wait-for-model": "true"
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: { width: 512, height: 768, num_inference_steps: 4, seed }
        }),
        timeout: 120000
      }
    );
    if (!hfRes.ok) {
      const txt = await hfRes.text();
      throw new Error(`HuggingFace failed ${hfRes.status}: ${txt}`);
    }
    const arrayBuffer = await hfRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length < 1000) throw new Error(`Too small: ${buffer.length} bytes`);
    console.log(`[AI Poster] HuggingFace done: "${title}" (${buffer.length} bytes)`);
    return buffer;
  } finally {
    activeRequests--;
    processQueue();
  }
}

// Main function: trigger generation in background, return B2 URL immediately
function triggerPoster(title, year, type, genreIds, overview) {
  if (!title) return;
  const key = posterKey(title, year);
  if (AI_PENDING.has(key)) return;

  const promise = new Promise((resolve, reject) => {
    const task = async () => {
      try {
        const exists = await existsInB2(key);
        if (exists) { resolve(); return; }
        const buf = await generatePoster(title, year, type, genreIds, overview);
        await uploadToB2(key, buf);
        console.log(`[AI Poster] Stored in B2: ${key}`);
        resolve();
      } catch (err) {
        console.error(`[AI Poster] Failed: ${key} — ${err.message}`);
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

module.exports = { triggerPoster, posterUrl, posterKey, existsInB2, B2_PUBLIC, AI_PENDING, MAX_CONCURRENT, requestQueue, generatePoster, uploadToB2 };
