const BASE = "https://asialiveaction.com";
const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";
const MAX_RESULTS = 30;
const MAX_PLAYERS = 4;
const RESOLVE_BUDGET_MS = 65000;

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&#038;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function cleanText(value) {
  return decodeHtml(String(value || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function sameSiteUrl(value, base) {
  const parent = base || (BASE + "/");
  try {
    const url = new URL(decodeHtml(value), parent);
    if (url.protocol !== "https:") return null;
    const host = String(url.hostname || "").toLowerCase();
    if (host !== "asialiveaction.com" && host !== "www.asialiveaction.com") return null;
    return url.origin + url.pathname + url.search;
  } catch (_) {
    return null;
  }
}

function movieDetail(value) {
  const url = sameSiteUrl(value);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/^\/pelicula\/(\d+)-([^/]+)\/?$/i);
    if (!match) return null;
    return { url: url, tmdbId: Number(match[1]), slug: match[2] };
  } catch (_) {
    return null;
  }
}

function titleFromSlug(slug) {
  return String(slug || "")
    .replace(/-sub-espanol$/i, "")
    .replace(/-\d{4}$/i, "")
    .split("-")
    .filter(Boolean)
    .map(function(part) { return part.charAt(0).toUpperCase() + part.slice(1); })
    .join(" ");
}

function searchItems(html) {
  const out = [];
  const seen = new Set();
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(String(html || ""))) && out.length < MAX_RESULTS) {
    const detail = movieDetail(match[1]);
    if (!detail || seen.has(detail.url)) continue;
    seen.add(detail.url);
    const block = match[2];
    const titleMatch =
      block.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i) ||
      block.match(/\b(?:alt|title)\s*=\s*["']([^"']+)["']/i);
    const title = cleanText(titleMatch ? titleMatch[1] : "") || titleFromSlug(detail.slug);
    if (!title) continue;
    const item = {
      id: "ala-movie-" + detail.tmdbId,
      ref: detail.url,
      title: title.slice(0, 200),
      kind: "movie",
      ids: { tmdb: detail.tmdbId }
    };
    const year = cleanText(block).match(/\b(19\d{2}|20\d{2})\b/);
    if (year) item.year = year[1];
    const image = block.match(/<img\b[^>]*\b(?:data-src|src)\s*=\s*["']([^"']+)["']/i);
    if (image) {
      const poster = sameSiteUrl(image[1], detail.url);
      if (poster) item.poster = poster;
    }
    out.push(item);
  }
  return out;
}

function playbackLinks(html, detailUrl, tmdbId) {
  const out = [];
  const seen = new Set();
  const re = /\bhref\s*=\s*["']([^"']+)["']/gi;
  const exact = new RegExp("^/f/\\d+/" + String(tmdbId) + "/");
  let match;
  while ((match = re.exec(String(html || ""))) && out.length < MAX_PLAYERS) {
    const absolute = sameSiteUrl(match[1], detailUrl);
    if (!absolute) continue;
    let parsed;
    try { parsed = new URL(absolute); } catch (_) { continue; }
    if (!exact.test(parsed.pathname) || seen.has(absolute)) continue;
    seen.add(absolute);
    out.push(absolute);
  }
  return out;
}

function looksLikeBrowserCheck(html) {
  const value = String(html || "").toLowerCase();
  return value.includes("just a moment") ||
    value.includes("checking your browser") ||
    value.includes("cf-chl-") ||
    value.includes("challenge-platform");
}

async function readPage(url, options) {
  const exact = sameSiteUrl(url);
  if (!exact) throw kino.error("not_found", "dirección fuera de Asia Live Action");
  const opts = options || {};
  const fetchTimeoutMs = Math.max(1000, Math.min(7000, Number(opts.fetchTimeoutMs) || 5000));
  try {
    const response = await kino.fetch(exact, {
      headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml" },
      timeoutMs: fetchTimeoutMs
    });
    const html = response.text();
    if (response.ok && !looksLikeBrowserCheck(html)) {
      return { html: html, finalUrl: response.url || exact, status: response.status };
    }
    if (response.status === 404) throw kino.error("not_found", "Asia Live Action respondió 404");
    if (response.status !== 403 && !looksLikeBrowserCheck(html)) {
      throw kino.error("unavailable", "Asia Live Action respondió " + response.status);
    }
    kino.log("plain page needs browser", response.status);
  } catch (error) {
    if (error && (error.code === "not_found" || error.code === "unavailable")) throw error;
    kino.log("plain page failed", error && error.code ? error.code : "network");
  }

  if (!kino.browser || typeof kino.browser.page !== "function") {
    throw kino.error("unavailable", "la página necesita navegador y no está disponible");
  }
  try {
    const pageOptions = {
      timeoutMs: Math.max(1000, Math.min(12000, Number(opts.browserTimeoutMs) || 9000))
    };
    if (opts.waitFor) pageOptions.waitFor = opts.waitFor;
    const page = await kino.browser.page(exact, pageOptions);
    if (!page || !page.html || looksLikeBrowserCheck(page.html)) {
      throw kino.error("unavailable", "la página siguió en verificación");
    }
    return page;
  } catch (error) {
    if (error && error.code) throw error;
    throw kino.error("unavailable", "el navegador no pudo leer la página");
  }
}

function mediaScore(media) {
  const url = String((media && media.url) || "").toLowerCase();
  const mime = String((media && media.mime) || "").toLowerCase();
  if (/mpegurl|dash/.test(mime) || /\.m3u8(?:[?#]|$)|\.mpd(?:[?#]|$)/.test(url)) return 0;
  if (/video\/mp4/.test(mime) || /\.mp4(?:[?#]|$)/.test(url)) return 1;
  return 2;
}

function streamFromCapture(capture) {
  const media = Array.isArray(capture && capture.media)
    ? capture.media
        .filter(function(item) { return item && /^https?:\/\//i.test(String(item.url || "")); })
        .slice()
        .sort(function(a, b) { return mediaScore(a) - mediaScore(b); })
    : [];
  if (!media.length) return null;

  const first = media[0];
  const stream = { url: first.url, headers: first.headers || {} };
  if (first.mime) stream.mime = first.mime;

  const alternatives = media.slice(1, 8).map(function(item) {
    const alt = { url: item.url, headers: item.headers || {} };
    if (item.mime) alt.mime = item.mime;
    return alt;
  });
  if (alternatives.length) stream.alternatives = alternatives;

  const subtitles = (capture.subtitles || []).slice(0, 10).map(function(subtitle) {
    return {
      url: subtitle.url,
      lang: subtitle.lang || "es",
      format: /\.srt(?:[?#]|$)/i.test(subtitle.url) ? "srt" : "vtt"
    };
  });
  if (subtitles.length) stream.subtitles = subtitles;
  return stream;
}

export async function search(query) {
  const q = cleanText(query && query.q).slice(0, 120);
  if (!q) return [];
  const page = await readPage(BASE + "/?s=" + encodeURIComponent(q), {
    fetchTimeoutMs: 4500,
    browserTimeoutMs: 8500
  });
  const items = searchItems(page.html);
  kino.log("search results", items.length);
  return items;
}

export async function resolve(ref) {
  const detail = movieDetail(ref);
  if (!detail) throw kino.error("not_found", "referencia de película inválida");

  const started = Date.now();
  const page = await readPage(detail.url, {
    fetchTimeoutMs: 6000,
    browserTimeoutMs: 10000,
    waitFor: "/f/"
  });
  const players = playbackLinks(page.html, detail.url, detail.tmdbId);
  if (!players.length) {
    throw kino.error("not_found", "la ficha no contiene un reproductor de esta película", {
      userMessage: "Este título no tiene un reproductor disponible ahora."
    });
  }

  let lastCode = "timeout";
  for (let index = 0; index < players.length; index++) {
    const left = RESOLVE_BUDGET_MS - (Date.now() - started);
    if (left < 4000) break;
    const timeoutMs = Math.min(16000, Math.max(4000, left - 1500));
    try {
      kino.log("capture player", index + 1, "of", players.length);
      const captured = await kino.browser.capture(players[index], {
        timeoutMs: timeoutMs,
        headers: { "Referer": detail.url, "User-Agent": UA },
        autoplay: true
      });
      const stream = streamFromCapture(captured);
      if (stream) {
        kino.log("capture media count", Array.isArray(captured.media) ? captured.media.length : 0);
        return stream;
      }
      lastCode = "unavailable";
    } catch (error) {
      lastCode = error && error.code ? error.code : "unavailable";
      kino.log("capture failed", lastCode);
      if (lastCode === "not_allowed" || lastCode === "browser_unavailable") throw error;
    }
  }

  throw kino.error(lastCode === "timeout" ? "timeout" : "unavailable", "ningún reproductor entregó video", {
    userMessage: "Los reproductores no entregaron un video en este momento."
  });
}
