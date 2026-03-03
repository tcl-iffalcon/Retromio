const fetch = require("node-fetch");

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const TMDB_BASE = "https://api.themoviedb.org/3";

global.fetch = fetch;

const vidlink = require("./providers/vidlink.js");
const netmirror = require("./providers/netmirror.js");

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

  const [vidlinkResult, netmirrorResult] = await Promise.allSettled([
    vidlink.getStreams(tmdbId, mediaType, seasonNum, episodeNum),
    netmirror.getStreams(tmdbId, mediaType, seasonNum, episodeNum)
  ]);

  const streams = [];

  if (vidlinkResult.status === "fulfilled" && vidlinkResult.value) {
    streams.push(...vidlinkResult.value);
  } else {
    console.log(`[Stream] Vidlink failed: ${vidlinkResult.reason?.message}`);
  }

  if (netmirrorResult.status === "fulfilled" && netmirrorResult.value) {
    streams.push(...netmirrorResult.value);
  } else {
    console.log(`[Stream] NetMirror failed: ${netmirrorResult.reason?.message}`);
  }

  console.log(`[Stream] Total streams found: ${streams.length}`);
  return streams;
}

module.exports = { fetchStreams };
