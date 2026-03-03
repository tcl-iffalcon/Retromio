/**
 * Retromio Provider for Nuvio TV
 * Vidlink + NetMirror + StreamFlix (film only)
 */

// ═══════════════════════════════════════════════════════════
//  VIDLINK
// ═══════════════════════════════════════════════════════════
var ENC_API     = "https://enc-dec.app/api/enc-vidlink";
var VIDLINK_API = "https://vidlink.pro/api/b";
var VIDLINK_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Referer": "https://vidlink.pro/",
  "Origin": "https://vidlink.pro"
};

function fetchVidlink(tmdbId, mediaType, season, episode) {
  return fetch(ENC_API + "?text=" + tmdbId, { headers: VIDLINK_HEADERS })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (!data || !data.result) throw new Error("Encryption failed");
      var url = mediaType === "tv" && season && episode
        ? VIDLINK_API + "/tv/" + data.result + "/" + season + "/" + episode
        : VIDLINK_API + "/movie/" + data.result;
      return fetch(url, { headers: VIDLINK_HEADERS });
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      var streams = [];
      if (data.stream && data.stream.qualities) {
        Object.keys(data.stream.qualities).forEach(function(key) {
          var q = data.stream.qualities[key];
          if (q.url) streams.push({ name: "Retromio", title: "Vidlink · " + key, url: q.url, quality: key, headers: VIDLINK_HEADERS });
        });
      }
      if (streams.length === 0 && data.stream && data.stream.playlist) {
        streams.push({ name: "Retromio", title: "Vidlink · Auto", url: data.stream.playlist, quality: "Auto", headers: VIDLINK_HEADERS });
      }
      console.log("[Retromio] Vidlink:", streams.length);
      return streams;
    })
    .catch(function(err) { console.error("[Retromio] Vidlink hata:", err.message); return []; });
}

// ═══════════════════════════════════════════════════════════
//  NETMIRROR
// ═══════════════════════════════════════════════════════════
var NM_BASE    = "https://net22.cc";
var NM_PLAY    = "https://net52.cc";
var NM_HEADERS = {
  "X-Requested-With": "XMLHttpRequest",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.5",
  "Connection": "keep-alive"
};
var nmCookie = "";
var nmCookieTime = 0;

function nmTime() { return Math.floor(Date.now() / 1e3); }

function nmBypass() {
  if (nmCookie && Date.now() - nmCookieTime < 54e6) return Promise.resolve(nmCookie);
  function attempt(n) {
    if (n >= 5) return Promise.reject(new Error("bypass failed"));
    return fetch(NM_PLAY + "/tv/p.php", { method: "POST", headers: NM_HEADERS })
      .then(function(res) {
        var setCookie = res.headers.get("set-cookie") || "";
        var m = setCookie.match(/t_hash_t=([^;]+)/);
        var cookie = m ? m[1] : null;
        return res.text().then(function(txt) {
          if (!txt.includes('"r":"n"')) return attempt(n + 1);
          if (!cookie) return attempt(n + 1);
          nmCookie = cookie; nmCookieTime = Date.now();
          return nmCookie;
        });
      });
  }
  return attempt(0);
}

function nmSearch(query, platform, cookie) {
  var ott = platform === "primevideo" ? "pv" : platform === "disney" ? "hs" : "nf";
  var endpoints = { netflix: NM_BASE + "/search.php", primevideo: NM_BASE + "/pv/search.php", disney: NM_BASE + "/mobile/hs/search.php" };
  var url = (endpoints[platform] || endpoints.netflix) + "?s=" + encodeURIComponent(query) + "&t=" + nmTime();
  var cookieStr = "t_hash_t=" + cookie + "; user_token=233123f803cf02184bf6c67e149cdd50; hd=on; ott=" + ott;
  return fetch(url, { headers: Object.assign({}, NM_HEADERS, { "Cookie": cookieStr, "Referer": NM_BASE + "/tv/home" }) })
    .then(function(res) { return res.json(); })
    .then(function(data) { return (data.searchResult || []).map(function(item) { return { id: item.id, title: item.t }; }); })
    .catch(function() { return []; });
}

function nmGetToken(id, cookie, ott) {
  var cookieStr = "t_hash_t=" + cookie + "; ott=" + (ott || "nf") + "; hd=on";
  return fetch(NM_BASE + "/play.php", {
    method: "POST",
    headers: Object.assign({}, NM_HEADERS, { "Content-Type": "application/x-www-form-urlencoded", "Cookie": cookieStr, "Referer": NM_BASE + "/" }),
    body: "id=" + id
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    return fetch(NM_PLAY + "/play.php?id=" + id + "&" + data.h, { headers: Object.assign({}, NM_HEADERS, { "Cookie": cookieStr }) });
  })
  .then(function(res) { return res.text(); })
  .then(function(html) { var m = html.match(/data-h="([^"]+)"/); return m ? m[1] : null; });
}

function nmGetStreams(id, title, platform, cookie) {
  var ott = platform === "primevideo" ? "pv" : platform === "disney" ? "hs" : "nf";
  var cookieStr = "t_hash_t=" + cookie + "; ott=" + ott + "; hd=on";
  var endpoints = { netflix: NM_PLAY + "/playlist.php", primevideo: NM_PLAY + "/pv/playlist.php", disney: NM_PLAY + "/mobile/hs/playlist.php" };
  return nmGetToken(id, cookie, ott)
    .then(function(token) {
      if (!token) throw new Error("no token");
      var url = (endpoints[platform] || endpoints.netflix) + "?id=" + id + "&t=" + encodeURIComponent(title) + "&tm=" + nmTime() + "&h=" + token;
      return fetch(url, { headers: Object.assign({}, NM_HEADERS, { "Cookie": cookieStr, "Referer": NM_PLAY + "/" }) });
    })
    .then(function(res) { return res.json(); })
    .then(function(playlist) {
      if (!Array.isArray(playlist) || !playlist.length) return [];
      var sources = [];
      playlist.forEach(function(item) {
        (item.sources || []).forEach(function(src) {
          var url = src.file;
          if (url && url.startsWith("/")) url = NM_PLAY + "/" + url.replace(/^\//, "");
          sources.push({ name: "Retromio", title: "NetMirror · " + (src.label || "Auto"), url: url, quality: (src.label || "Auto"), headers: { "User-Agent": "Mozilla/5.0 (Android) ExoPlayer", "Referer": NM_PLAY + "/", "Cookie": "hd=on" } });
        });
      });
      return sources;
    })
    .catch(function() { return []; });
}

function nmGetEpisodeId(contentId, platform, cookie, season, episode) {
  var ott = platform === "primevideo" ? "pv" : platform === "disney" ? "hs" : "nf";
  var cookieStr = "t_hash_t=" + cookie + "; user_token=233123f803cf02184bf6c67e149cdd50; ott=" + ott + "; hd=on";
  var endpoints = { netflix: NM_BASE + "/post.php", primevideo: NM_BASE + "/pv/post.php", disney: NM_BASE + "/mobile/hs/post.php" };
  var url = (endpoints[platform] || endpoints.netflix) + "?id=" + contentId + "&t=" + nmTime();
  return fetch(url, { headers: Object.assign({}, NM_HEADERS, { "Cookie": cookieStr, "Referer": NM_BASE + "/tv/home" }) })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      var eps = (data.episodes || []).filter(Boolean);
      var ep = eps.find(function(e) {
        var s = parseInt((e.s || e.season || "").toString().replace("S", ""));
        var n = parseInt((e.ep || e.episode || "").toString().replace("E", ""));
        return s === season && n === episode;
      });
      return ep ? ep.id : null;
    })
    .catch(function() { return null; });
}

function fetchNetmirror(tmdbId, mediaType, season, episode, title) {
  var platforms = ["netflix", "primevideo", "disney"];
  function tryPlatform(i) {
    if (i >= platforms.length) return Promise.resolve([]);
    var platform = platforms[i];
    return nmBypass()
      .then(function(cookie) {
        return nmSearch(title, platform, cookie).then(function(results) {
          if (!results.length) return tryPlatform(i + 1);
          var match = results.find(function(r) { return r.title.toLowerCase().includes(title.toLowerCase().split(" ")[0]); }) || results[0];
          var idPromise = mediaType === "tv"
            ? nmGetEpisodeId(match.id, platform, cookie, season, episode)
            : Promise.resolve(match.id);
          return idPromise.then(function(contentId) {
            if (!contentId) return tryPlatform(i + 1);
            return nmGetStreams(contentId, title, platform, cookie);
          });
        });
      })
      .catch(function() { return tryPlatform(i + 1); });
  }
  return tryPlatform(0);
}

// ═══════════════════════════════════════════════════════════
//  STREAMFLIX (sadece film)
// ═══════════════════════════════════════════════════════════
var SF_API     = "https://api.streamflix.app";
var SF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.5",
  "Connection": "keep-alive"
};
var sfDataCache = null;
var sfConfigCache = null;

function sfGetData() {
  if (sfDataCache) return Promise.resolve(sfDataCache);
  return fetch(SF_API + "/data.json", { headers: SF_HEADERS })
    .then(function(res) { return res.json(); })
    .then(function(json) { sfDataCache = json; return json; });
}

function sfGetConfig() {
  if (sfConfigCache) return Promise.resolve(sfConfigCache);
  return fetch(SF_API + "/config/config-streamflixapp.json", { headers: SF_HEADERS })
    .then(function(res) { return res.json(); })
    .then(function(json) { sfConfigCache = json; return json; });
}

function sfSimilarity(s1, s2) {
  var words1 = s1.toLowerCase().split(/\s+/);
  var words2 = s2.toLowerCase().split(/\s+/);
  var matches = 0;
  words1.forEach(function(w) { if (w.length > 2 && words2.some(function(w2) { return w2.includes(w) || w.includes(w2); })) matches++; });
  return matches / Math.max(words1.length, words2.length);
}

function fetchStreamflix(tmdbId, title) {
  return Promise.all([sfGetData(), sfGetConfig()])
    .then(function(results) {
      var data = results[0];
      var config = results[1];
      if (!data || !data.data) return [];

      var query = title.toLowerCase();
      var matches = data.data.filter(function(item) {
        if (!item.moviename) return false;
        return title.toLowerCase().split(/\s+/).every(function(w) { return item.moviename.toLowerCase().includes(w); });
      });
      if (!matches.length) return [];

      var best = matches.reduce(function(a, b) {
        return sfSimilarity(title, b.moviename) > sfSimilarity(title, a.moviename) ? b : a;
      });

      var streams = [];
      if (config.premium && best.movielink) {
        config.premium.forEach(function(baseUrl) {
          streams.push({ name: "Retromio", title: "StreamFlix · Premium", url: baseUrl + best.movielink, quality: "1080p", headers: { "Referer": SF_API, "User-Agent": SF_HEADERS["User-Agent"] } });
        });
      }
      if (config.movies && best.movielink && streams.length === 0) {
        config.movies.forEach(function(baseUrl) {
          streams.push({ name: "Retromio", title: "StreamFlix · Standard", url: baseUrl + best.movielink, quality: "720p", headers: { "Referer": SF_API, "User-Agent": SF_HEADERS["User-Agent"] } });
        });
      }
      console.log("[Retromio] StreamFlix:", streams.length);
      return streams;
    })
    .catch(function(err) { console.error("[Retromio] StreamFlix hata:", err.message); return []; });
}

// ═══════════════════════════════════════════════════════════
//  ANA FONKSİYON
// ═══════════════════════════════════════════════════════════
var TMDB_KEY = "439c478a771f35c05022f9feabcca01c";

function getStreams(tmdbId, mediaType, season, episode) {
  console.log("[Retromio] Fetching:", mediaType, tmdbId, season, episode);
  var s = season || 1;
  var e = episode || 1;

  return fetch("https://api.themoviedb.org/3/" + (mediaType === "tv" ? "tv" : "movie") + "/" + tmdbId + "?api_key=" + TMDB_KEY)
    .then(function(res) { return res.json(); })
    .then(function(data) {
      var title = data.title || data.name || "";
      var tasks = [
        fetchVidlink(tmdbId, mediaType, s, e),
        title ? fetchNetmirror(tmdbId, mediaType, s, e, title) : Promise.resolve([]),
        (mediaType === "movie" && title) ? fetchStreamflix(tmdbId, title) : Promise.resolve([])
      ];
      return Promise.all(tasks);
    })
    .then(function(results) {
      var all = results[0].concat(results[1]).concat(results[2]);
      console.log("[Retromio] Toplam:", all.length);
      return all;
    })
    .catch(function(err) {
      console.error("[Retromio] Ana hata:", err.message);
      return fetchVidlink(tmdbId, mediaType, s, e);
    });
}

module.exports = { getStreams };
