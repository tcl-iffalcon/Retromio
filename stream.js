const fetch = require("node-fetch");
global.fetch = fetch;

const TMDB_API_KEY = process.env.TMDB_API_KEY || "439c478a771f35c05022f9feabcca01c";
const TMDB_BASE    = "https://api.themoviedb.org/3";

// Providers live in ./providers/
const vidlink   = require("./providers/vidlink.js");
const netmirror = require("./providers/netmirror.js");

// ─── TMDB ID resolver ─────────────────────────────────────────────────────────

async function resolveTmdbId(id, type) {
  const isMovie = type === "movie";

  if (id.startsWith("tt")) {
    const res  = await fetch(`${TMDB_BASE}/find/${id}?api_key=${TMDB_API_KEY}&external_source=imdb_id`);
    const data = await res.json();
    const results = isMovie ? data.movie_results : data.tv_results;
    if (!results || results.length === 0) return null;
    return results[0].id;
  }

  if (id.startsWith("tmdb:")) return id.replace("tmdb:", "");
  return null;
}

// ─── Quality filter: prefer 1080p, fall back to best available ────────────────

function filterStreams(streams) {
  if (!streams || streams.length === 0) return [];

  const has1080 = streams.some(s => {
    const q = (s.quality || s.title || "").toString().toLowerCase();
    return q.includes("1080");
  });

  if (has1080) {
    return streams.filter(s => {
      const q = (s.quality || s.title || "").toString().toLowerCase();
      return q.includes("1080") || q.includes("auto");
    });
  }

  // Fallback: 720p or auto
  const has720 = streams.some(s => {
    const q = (s.quality || s.title || "").toString().toLowerCase();
    return q.includes("720");
  });

  if (has720) {
    return streams.filter(s => {
      const q = (s.quality || s.title || "").toString().toLowerCase();
      return q.includes("720") || q.includes("auto");
    });
  }

  return streams; // return all if no quality info
}

// ─── Main stream fetcher ──────────────────────────────────────────────────────

async function fetchStreams(id, type) {
  const isMovie = type === "movie";
  let seasonNum  = null;
  let episodeNum = null;

  // Parse episode info from id (e.g. "tt1234567:2:5")
  if (!isMovie && id.includes(":")) {
    const parts = id.split(":");
    id         = parts[0];
    seasonNum  = parseInt(parts[1]);
    episodeNum = parseInt(parts[2]);
  }

  const tmdbId = await resolveTmdbId(id, type);
  if (!tmdbId) {
    console.log(`[Stream] Could not resolve TMDB ID for ${id}`);
    return [];
  }

  const mediaType = isMovie ? "movie" : "tv";
  console.log(`[Stream] TMDB ${tmdbId} | ${mediaType}${seasonNum ? ` S${seasonNum}E${episodeNum}` : ""}`);

  // Run both providers in parallel
  const [vidlinkResult, netmirrorResult] = await Promise.allSettled([
    vidlink.getStreams(tmdbId, mediaType, seasonNum, episodeNum),
    netmirror.getStreams(tmdbId, mediaType, seasonNum, episodeNum)
  ]);

  const rawStreams = [];

  if (vidlinkResult.status === "fulfilled" && vidlinkResult.value?.length) {
    const filtered = filterStreams(vidlinkResult.value);
    rawStreams.push(...filtered);
    console.log(`[Stream] Vidlink: ${filtered.length} streams (from ${vidlinkResult.value.length})`);
  } else {
    console.log(`[Stream] Vidlink failed: ${vidlinkResult.reason?.message || "no streams"}`);
  }

  if (netmirrorResult.status === "fulfilled" && netmirrorResult.value?.length) {
    const filtered = filterStreams(netmirrorResult.value);
    rawStreams.push(...filtered);
    console.log(`[Stream] NetMirror: ${filtered.length} streams (from ${netmirrorResult.value.length})`);
  } else {
    console.log(`[Stream] NetMirror failed: ${netmirrorResult.reason?.message || "no streams"}`);
  }

  console.log(`[Stream] Total: ${rawStreams.length} streams`);
  return rawStreams;
}

module.exports = { fetchStreams };
