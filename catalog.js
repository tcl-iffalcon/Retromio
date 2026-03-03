const fetch = require("node-fetch");

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";

function getAiPosterUrl(baseUrl, item, type) {
  const isMovie = type === "movie";
  const title = isMovie ? item.title : item.name;
  const releaseDate = isMovie ? item.release_date : item.first_air_date;
  const year = releaseDate ? releaseDate.substring(0, 4) : "";

  const params = new URLSearchParams({
    title: title || "",
    year: year || "",
    type: isMovie ? "movie" : "series",
    fallback: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : ""
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
  // TMDB returns 20 per page, fetch multiple pages to fill 100 results
  const startPage = Math.floor(skip / 100) * 5 + 1;
  const tmdbType = type === "series" ? "tv" : "movie";
  const isTrending = catalogId.includes("trending");

  const pagePromises = [];
  for (let p = startPage; p < startPage + 5; p++) {
    const endpoint = isTrending
      ? `${TMDB_BASE}/trending/${tmdbType}/week?api_key=${TMDB_API_KEY}&page=${p}`
      : `${TMDB_BASE}/${tmdbType}/popular?api_key=${TMDB_API_KEY}&page=${p}`;
    pagePromises.push(fetch(endpoint).then(r => r.json()));
  }

  const pages = await Promise.all(pagePromises);
  const allResults = pages.flatMap(data => data.results || []);

  const metas = allResults
    .filter(item => item.poster_path)
    .map(item => tmdbToStremio(item, tmdbType, baseUrl));

  console.log(`[Catalog] ${catalogId} skip=${skip} → ${metas.length} results`);

  // Prewarm B2: trigger poster generation in background for items not yet cached
  metas.forEach(meta => {
    const url = meta.poster;
    if (url && url.includes("/ai-poster?")) {
      fetch(url).catch(() => {}); // fire and forget
    }
  });

  return metas;
}

module.exports = { fetchCatalog, tmdbToStremio };
