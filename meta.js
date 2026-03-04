const fetch = require("node-fetch");
const { triggerPoster, posterKey } = require("./poster");

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const TMDB_BASE = "https://api.themoviedb.org/3";

async function fetchMeta(id, type, baseUrl) {
  try {
    let tmdbId = null;
    const isMovie = type === "movie";

    if (id.startsWith("tt")) {
      const res = await fetch(`${TMDB_BASE}/find/${id}?api_key=${TMDB_API_KEY}&external_source=imdb_id`);
      const data = await res.json();
      const results = isMovie ? data.movie_results : data.tv_results;
      if (!results || results.length === 0) return null;
      tmdbId = results[0].id;
    } else if (id.startsWith("tmdb:")) {
      tmdbId = id.replace("tmdb:", "");
    } else {
      return null;
    }

    const endpoint = isMovie
      ? `${TMDB_BASE}/movie/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids,credits`
      : `${TMDB_BASE}/tv/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids,credits`;

    const res = await fetch(endpoint);
    const item = await res.json();

    const title = isMovie ? item.title : item.name;
    const releaseDate = isMovie ? item.release_date : item.first_air_date;
    const year = releaseDate ? releaseDate.substring(0, 4) : null;
    const genres = item.genres ? item.genres.map(g => g.name) : [];
    const genreIds = item.genres ? item.genres.map(g => g.id).join(",") : "";
    const cast = item.credits && item.credits.cast
      ? item.credits.cast.slice(0, 5).map(c => c.name)
      : [];

    const tmdbPoster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null;

    // Build /ai-poster URL — Stremio calls this, endpoint handles generation + redirect
    const params = new URLSearchParams({
      title: title || "",
      year: year || "",
      type: isMovie ? "movie" : "series",
      genres: genreIds,
      overview: (item.overview || "").substring(0, 200),
      fallback: tmdbPoster || ""
    });
    const posterEndpointUrl = baseUrl
      ? `${baseUrl}/ai-poster?${params.toString()}`
      : tmdbPoster;

    // Also trigger background generation so it's ready next time
    triggerPoster(title, year, isMovie ? "movie" : "series", genreIds, item.overview || "");

    const meta = {
      id,
      type,
      name: title,
      poster: posterEndpointUrl,
      background: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
      description: item.overview,
      releaseInfo: year,
      imdbRating: item.vote_average ? item.vote_average.toFixed(1) : null,
      genres,
      cast,
      runtime: isMovie ? (item.runtime ? `${item.runtime} min` : null) : null,
    };

    if (!isMovie && item.seasons) {
      meta.videos = [];
      item.seasons
        .filter(s => s.season_number > 0)
        .forEach(season => {
          for (let ep = 1; ep <= season.episode_count; ep++) {
            meta.videos.push({
              id: `${id}:${season.season_number}:${ep}`,
              title: `S${String(season.season_number).padStart(2, "0")}E${String(ep).padStart(2, "0")}`,
              season: season.season_number,
              episode: ep,
              released: season.air_date || null
            });
          }
        });
    }

    return meta;
  } catch (err) {
    console.error(`[Meta] Error fetching meta for ${id}: ${err.message}`);
    return null;
  }
}

module.exports = { fetchMeta };
