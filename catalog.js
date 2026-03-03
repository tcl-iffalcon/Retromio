const fetch = require("node-fetch");

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";

function getAiPosterUrl(baseUrl, item, type) {
  const isMovie = type === "movie";
  const title = isMovie ? item.title : item.name;
  const releaseDate = isMovie ? item.release_date : item.first_air_date;
  const year = releaseDate ? releaseDate.substring(0, 4) : "";
  const mediaType = isMovie ? "movie" : "series";
  const fallback = item.poster_path ? encodeURIComponent(`${TMDB_IMG}${item.poster_path}`) : "";

  const params = new URLSearchParams({
    title: title || "",
    year: year || "",
    type: mediaType,
    fallback: item.poster_path ? `${TMDB_IMG}${item.poster_path}` : ""
  });
  return `${baseUrl}/ai-poster?${params.toString()}`;
}

function tmdbToStremio(item, type, baseUrl) {
  const isMovie = type === "movie";
  const title = isMovie ? item.title : item.name;
  const releaseDate = isMovie ? item.release_date : item.first_air_date;
  const year = releaseDate ? releaseDate.substring(0, 4) : null;
  const imdbId = item.imdb_id || null;
  const id = imdbId || `tmdb:${item.id}`;

  return {
    id,
    type: isMovie ? "movie" : "series",
    name: title,
    poster: getAiPosterUrl(baseUrl, item, type),
    background: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
    description: item.overview,
    releaseInfo: year,
    imdbRating: item.vote_average ? item.vote_average.toFixed(1) : null,
    genres: [],
    _tmdbId: item.id
  };
}

async function fetchCatalog(catalogId, type, skip = 0, baseUrl) {
  const page = Math.floor(skip / 20) + 1;
  let endpoint;

  if (catalogId.includes("trending")) {
    endpoint = `${TMDB_BASE}/trending/${type === "series" ? "tv" : "movie"}/week?api_key=${TMDB_API_KEY}&page=${page}`;
  } else {
    endpoint = `${TMDB_BASE}/${type === "series" ? "tv" : "movie"}/popular?api_key=${TMDB_API_KEY}&page=${page}`;
  }

  console.log(`[Catalog] Fetching: ${endpoint}`);
  const res = await fetch(endpoint);
  const data = await res.json();

  if (!data.results) return [];

  const metas = data.results
    .filter(item => item.poster_path)
    .map(item => tmdbToStremio(item, type === "series" ? "tv" : "movie", baseUrl));

  return metas;
}

module.exports = { fetchCatalog, tmdbToStremio };
