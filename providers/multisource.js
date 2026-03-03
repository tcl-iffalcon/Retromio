/**
 * Retromio Provider for Nuvio TV
 * Vidlink + 4KHDHub — paralel
 */
"use strict";

var __async = function(__this, __arguments, generator) {
  return new Promise(function(resolve, reject) {
    var fulfilled = function(value) { try { step(generator.next(value)); } catch(e) { reject(e); } };
    var rejected  = function(value) { try { step(generator.throw(value)); } catch(e) { reject(e); } };
    var step = function(x) { return x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected); };
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

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
//  4KHDHUB
// ═══════════════════════════════════════════════════════════
var HUB_BASE     = "https://4khdhub.fans";
var HUB_UA       = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";
var HUB_TMDB_KEY = "439c478a771f35c05022f9feabcca01c";
var cheerio      = require("cheerio-without-node-native");

function hubFetchText(url, options) {
  return __async(this, null, function*() {
    try {
      var res = yield fetch(url, { headers: Object.assign({ "User-Agent": HUB_UA }, (options && options.headers) || {}) });
      return yield res.text();
    } catch(e) { console.log("[4KHDHub] fetch fail:", e.message); return null; }
  });
}

function hubAtob(input) {
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  var str = String(input).replace(/=+$/, "");
  var output = "";
  for (var bc = 0, bs, buffer, i = 0; buffer = str.charAt(i++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
    buffer = chars.indexOf(buffer);
  }
  return output;
}

function hubRot13(str) {
  return str.replace(/[a-zA-Z]/g, function(c) {
    return String.fromCharCode((c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26);
  });
}

function hubLevenshtein(s, t) {
  if (s === t) return 0;
  var n = s.length, m = t.length;
  if (!n) return m; if (!m) return n;
  var d = [];
  for (var i = 0; i <= n; i++) { d[i] = []; d[i][0] = i; }
  for (var j = 0; j <= m; j++) d[0][j] = j;
  for (var i = 1; i <= n; i++) for (var j = 1; j <= m; j++) {
    var cost = s.charAt(i-1) === t.charAt(j-1) ? 0 : 1;
    d[i][j] = Math.min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1]+cost);
  }
  return d[n][m];
}

function hubParseBytes(val) {
  if (typeof val === "number") return val;
  if (!val) return 0;
  var match = val.match(/^([0-9.]+)\s*([a-zA-Z]+)$/);
  if (!match) return 0;
  var num = parseFloat(match[1]), unit = match[2].toLowerCase();
  var m = unit[0] === "k" ? 1024 : unit[0] === "m" ? 1024*1024 : unit[0] === "g" ? 1024*1024*1024 : 1;
  return num * m;
}

function hubFormatBytes(val) {
  if (!val) return "0 B";
  var k = 1024, sizes = ["B","KB","MB","GB","TB"];
  var i = Math.max(0, Math.floor(Math.log(val) / Math.log(k)));
  return parseFloat((val / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function hubGetTmdb(tmdbId, type) {
  return __async(this, null, function*() {
    var ep = type === "tv" ? "tv" : "movie";
    var res = yield fetch("https://api.themoviedb.org/3/" + ep + "/" + tmdbId + "?api_key=" + HUB_TMDB_KEY);
    var data = yield res.json();
    return {
      title: data.title || data.name,
      year: parseInt((data.release_date || data.first_air_date || "0").split("-")[0])
    };
  });
}

function hubResolveRedirect(url) {
  return __async(this, null, function*() {
    var html = yield hubFetchText(url);
    if (!html) return null;
    try {
      var m = html.match(/'o','(.*?)'/);
      if (!m) return null;
      return hubAtob(JSON.parse(hubAtob(hubRot13(hubAtob(hubAtob(m[1]))))).o);
    } catch(e) { return null; }
  });
}

function hubExtractHubCloud(hubUrl, meta) {
  return __async(this, null, function*() {
    if (!hubUrl) return [];
    var html = yield hubFetchText(hubUrl, { headers: { Referer: hubUrl } });
    if (!html) return [];
    var m = html.match(/var url ?= ?'(.*?)'/);
    if (!m) return [];
    var linksHtml = yield hubFetchText(m[1], { headers: { Referer: hubUrl } });
    if (!linksHtml) return [];
    var $ = cheerio.load(linksHtml);
    var results = [];
    var size = $("#size").text(), title2 = $("title").text().trim();
    var newMeta = Object.assign({}, meta, { bytes: hubParseBytes(size) || meta.bytes, title: title2 || meta.title });
    $("a").each(function(_, el) {
      var text = $(el).text(), href = $(el).attr("href");
      if (!href) return;
      if (text.includes("FSL") || text.includes("Download File")) results.push({ source: "FSL", url: href, meta: newMeta });
      else if (text.includes("PixelServer")) results.push({ source: "PixelServer", url: href.replace("/u/","/api/file/"), meta: newMeta });
    });
    return results;
  });
}

function hubExtractItem($, el) {
  return __async(this, null, function*() {
    var html2 = $(el).html();
    var sizeM = html2.match(/([\d.]+ ?[GM]B)/);
    var heightM = html2.match(/\d{3,}p/);
    var title2 = $(el).find(".file-title, .episode-file-title").text().trim();
    var height = heightM ? parseInt(heightM[0]) : 0;
    if (!height && (title2.includes("4K") || html2.includes("4K"))) height = 2160;
    var meta = { bytes: sizeM ? hubParseBytes(sizeM[1]) : 0, height: height, title: title2 };
    var hubLink = $(el).find("a").filter(function(_,a){ return $(a).text().includes("HubCloud"); }).attr("href");
    if (hubLink) { var resolved = yield hubResolveRedirect(hubLink); return { url: resolved, meta: meta }; }
    return null;
  });
}

function fetchHubStream(tmdbId, type, season, episode) {
  return __async(this, null, function*() {
    var details = yield hubGetTmdb(tmdbId, type);
    if (!details || !details.title) return [];
    var isSeries = type === "tv";
    var searchUrl = HUB_BASE + "/?s=" + encodeURIComponent(details.title + " " + details.year);
    var html = yield hubFetchText(searchUrl);
    if (!html) return [];
    var $ = cheerio.load(html);
    var targetType = isSeries ? "Series" : "Movies";
    var cards = $(".movie-card").filter(function(_,el) {
      return $(el).find('.movie-card-format:contains("' + targetType + '")').length > 0;
    }).filter(function(_,el) {
      return Math.abs(parseInt($(el).find(".movie-card-meta").text()) - details.year) <= 1;
    }).filter(function(_,el) {
      return hubLevenshtein($(el).find(".movie-card-title").text().replace(/\[.*?]/g,"").trim().toLowerCase(), details.title.toLowerCase()) < 5;
    }).map(function(_,el) {
      var href = $(el).attr("href");
      return href && !href.startsWith("http") ? HUB_BASE + (href.startsWith("/") ? "" : "/") + href : href;
    }).get();
    if (!cards.length) return [];
    var pageHtml = yield hubFetchText(cards[0]);
    if (!pageHtml) return [];
    var $2 = cheerio.load(pageHtml);
    var items = [];
    if (isSeries && season && episode) {
      var sStr = "S" + String(season).padStart(2,"0");
      var eStr = "Episode-" + String(episode).padStart(2,"0");
      $2(".episode-item").each(function(_,el) {
        if ($2(".episode-title",el).text().includes(sStr)) {
          $2(".episode-download-item",el).filter(function(_,it){ return $2(it).text().includes(eStr); }).each(function(_,it){ items.push(it); });
        }
      });
    } else {
      $2(".download-item").each(function(_,el){ items.push(el); });
    }
    var allStreams = [];
    for (var i = 0; i < items.length; i++) {
      try {
        var src = yield hubExtractItem($2, items[i]);
        if (src && src.url) {
          var links = yield hubExtractHubCloud(src.url, src.meta);
          links.forEach(function(link) {
            allStreams.push({
              name: "Retromio",
              title: "4KHDHub · " + link.source + (src.meta.height ? " " + src.meta.height + "p" : ""),
              url: link.url,
              quality: src.meta.height ? src.meta.height + "p" : undefined,
              size: hubFormatBytes(link.meta.bytes || 0)
            });
          });
        }
      } catch(e) { console.log("[4KHDHub] item err:", e.message); }
    }
    console.log("[Retromio] 4KHDHub:", allStreams.length);
    return allStreams;
  });
}

// ═══════════════════════════════════════════════════════════
//  ANA FONKSİYON
// ═══════════════════════════════════════════════════════════
function getStreams(tmdbId, mediaType, season, episode) {
  console.log("[Retromio] Fetching:", mediaType, tmdbId, season, episode);
  var s = season || 1, e = episode || 1;
  return Promise.all([
    fetchVidlink(tmdbId, mediaType, s, e),
    fetchHubStream(tmdbId, mediaType, s, e)
  ]).then(function(results) {
    var all = results[0].concat(results[1]);
    console.log("[Retromio] Toplam:", all.length);
    return all;
  });
}

module.exports = { getStreams };
