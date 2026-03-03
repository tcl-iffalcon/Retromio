/**
 * Retromio — Minimal Test
 * Hiçbir API çağrısı yok, sabit stream döndürüyor
 */

function getStreams(tmdbId, mediaType, season, episode) {
  console.log("[Retromio] getStreams çağrıldı:", tmdbId, mediaType);
  return Promise.resolve([
    {
      name: "Retromio Test",
      title: "Test Stream",
      url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
      quality: "Auto"
    }
  ]);
}

module.exports = { getStreams };
