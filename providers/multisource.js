/**
 * Retromio Provider for Nuvio TV
 * Vidlink API kullanır — Sinewix stili saf Promise chain
 */

var ENC_API = "https://enc-dec.app/api/enc-vidlink";
var VIDLINK_API = "https://vidlink.pro/api/b";
var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Referer": "https://vidlink.pro/",
  "Origin": "https://vidlink.pro"
};

function getStreams(tmdbId, mediaType, season, episode) {
  console.log("[Retromio] Fetching:", mediaType, tmdbId, season, episode);

  return fetch(ENC_API + "?text=" + tmdbId, { headers: HEADERS })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (!data || !data.result) throw new Error("Encryption failed");
      var encId = data.result;
      console.log("[Retromio] Encrypted ID alındı");

      var url;
      if (mediaType === "tv" && season && episode) {
        url = VIDLINK_API + "/tv/" + encId + "/" + season + "/" + episode;
      } else {
        url = VIDLINK_API + "/movie/" + encId;
      }

      console.log("[Retromio] API isteği:", url);
      return fetch(url, { headers: HEADERS });
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      var streams = [];

      if (data.stream && data.stream.qualities) {
        Object.keys(data.stream.qualities).forEach(function(key) {
          var q = data.stream.qualities[key];
          if (q.url) {
            streams.push({
              name: "Retromio",
              title: "Vidlink · " + key,
              url: q.url,
              quality: key,
              headers: HEADERS
            });
          }
        });
      }

      if (streams.length === 0 && data.stream && data.stream.playlist) {
        streams.push({
          name: "Retromio",
          title: "Vidlink · Auto",
          url: data.stream.playlist,
          quality: "Auto",
          headers: HEADERS
        });
      }

      console.log("[Retromio] Stream sayısı:", streams.length);
      return streams;
    })
    .catch(function(err) {
      console.error("[Retromio] Hata:", err.message);
      return [];
    });
}

module.exports = { getStreams };
