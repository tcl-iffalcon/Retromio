const fetch = require("node-fetch");

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const TMDB_BASE = "https://api.themoviedb.org/3";

// Polyfill fetch for providers
global.fetch = fetch;

const multisource = require("./providers/multisource.js");

async function resolveTmdbId(id, type) {
  const isMovie = type === "movie";
  if (id.startsWith("tt")) {
    const res = await fetch(`${TMDB_BASE}/find/${id}?api_key=${TMDB_API_KEY}&external_source=imdb_id`);
    const data = await res.json();
    const results = isMovie ? data.movie_results : data.tv_results;
    if (!results || results.length === 0) return null;
    return results[0].id;
  } else if (id.startsWith("tmdb:")) {
    return id.replace("tmdb:", "");
  }
  return null;
}

async function fetchStreams(id, type, season, episode) {
  const isMovie = type === "movie";
  const mediaType = isMovie ? "movie" : "tv";

  // Parse season/episode from video id (format: tt1234:1:2)
  let seasonNum = season ? parseInt(season) : null;
  let episodeNum = episode ? parseInt(episode) : null;

  if (!isMovie && id.includes(":")) {
    const parts = id.split(":");
    id = parts[0];
    seasonNum = parseInt(parts[1]);
    episodeNum = parseInt(parts[2]);
  }

  const tmdbId = await resolveTmdbId(id, type);
  if (!tmdbId) {
    console.log(`[Stream] Could not resolve TMDB ID for ${id}`);
    return [];
  }

  console.log(`[Stream] Fetching streams for TMDB ID: ${tmdbId}, type: ${mediaType}${seasonNum ? ` S${seasonNum}E${episodeNum}` : ""}`);

  const result = await Promise.allSettled([
    multisource.getStreams(tmdbId, mediaType, seasonNum, episodeNum)
  ]);

  const streams = [];

  if (result[0].status === "fulfilled" && result[0].value) {
    streams.push(...result[0].value);
  } else {
    console.log(`[Stream] Multisource failed: ${result[0].reason?.message}`);
  }

  console.log(`[Stream] Total streams found: ${streams.length}`);
  return streams;
}

module.exports = { fetchStreams };
