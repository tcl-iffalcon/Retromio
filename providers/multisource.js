/**
 * Retromio — v6
 * Vidlink provider kaynak kodundan birebir uyarlandı
 */
"use strict";

var __async = function(__this, __arguments, generator) {
  return new Promise(function(resolve, reject) {
    var fulfilled = function(value) {
      try { step(generator.next(value)); } catch(e) { reject(e); }
    };
    var rejected = function(value) {
      try { step(generator.throw(value)); } catch(e) { reject(e); }
    };
    var step = function(x) {
      return x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    };
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

var ENC_DEC_API = "https://enc-dec.app/api";
var VIDLINK_API  = "https://vidlink.pro/api/b";
var VIDLINK_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  "Connection": "keep-alive",
  "Referer": "https://vidlink.pro/",
  "Origin": "https://vidlink.pro"
};

// TMDB ID'yi şifrele
function encryptTmdbId(tmdbId) {
  return __async(this, null, function*() {
    var response = yield fetch(ENC_DEC_API + "/enc-vidlink?text=" + tmdbId, {
      headers: { "User-Agent": VIDLINK_HEADERS["User-Agent"] }
    });
    var data = yield response.json();
    if (data && data.result) return data.result;
    throw new Error("Encryption failed");
  });
}

// JSON'dan stream URL'lerini çıkar
function extractStreams(data, title) {
  var streams = [];

  try {
    if (data.stream && data.stream.qualities) {
      Object.keys(data.stream.qualities).forEach(function(key) {
        var q = data.stream.qualities[key];
        if (q.url) {
          streams.push({
            name: "Retromio",
            title: "Vidlink · " + key,
            url: q.url,
            quality: key,
            headers: VIDLINK_HEADERS
          });
        }
      });
    }

    if (data.stream && data.stream.playlist && streams.length === 0) {
      streams.push({
        name: "Retromio",
        title: "Vidlink · Auto",
        url: data.stream.playlist,
        quality: "Auto",
        headers: VIDLINK_HEADERS
      });
    }

    if (streams.length === 0 && data.url) {
      streams.push({
        name: "Retromio",
        title: "Vidlink · Auto",
        url: data.url,
        quality: "Auto",
        headers: VIDLINK_HEADERS
      });
    }
  } catch(e) {
    console.error("[Retromio] extractStreams hata: " + e.message);
  }

  return streams;
}

function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function*() {
    console.log("[Retromio] Fetching " + mediaType + " tmdb:" + tmdbId);

    try {
      var encId = yield encryptTmdbId(tmdbId);
      console.log("[Retromio] Encrypted ID alındı");

      var url;
      if (mediaType === "tv" && season && episode) {
        url = VIDLINK_API + "/tv/" + encId + "/" + season + "/" + episode;
      } else {
        url = VIDLINK_API + "/movie/" + encId;
      }

      console.log("[Retromio] API isteği: " + url);
      var response = yield fetch(url, { headers: VIDLINK_HEADERS });
      var data = yield response.json();

      var streams = extractStreams(data);
      console.log("[Retromio] Stream sayısı: " + streams.length);
      return streams;

    } catch(err) {
      console.error("[Retromio] Hata: " + err.message);
      return [];
    }
  });
}

module.exports = { getStreams };
