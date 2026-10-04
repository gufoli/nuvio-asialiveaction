import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../plugin.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));

function response(status, body, url) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url: url || "",
    text: () => body
  };
}

function kinoMock(routes = {}) {
  const calls = [];
  const mock = {
    log() {},
    error(code, message, options) {
      const error = new Error(message);
      error.code = code;
      error.options = options;
      return error;
    },
    fetch: async (url, opts) => {
      calls.push({ kind: "fetch", url, opts });
      return routes[url] || response(404, "", url);
    },
    browser: {
      page: async (url, opts) => {
        calls.push({ kind: "page", url, opts });
        throw Object.assign(new Error("no page"), { code: "blocked" });
      },
      capture: async (url, opts) => {
        calls.push({ kind: "capture", url, opts });
        throw Object.assign(new Error("no media"), { code: "timeout" });
      }
    }
  };
  globalThis.kino = mock;
  return { mock, calls };
}

const detail = "https://asialiveaction.com/pelicula/670-oldboy-sub-espanol/";
const searchUrl = "https://asialiveaction.com/?s=Oldboy";
const searchHtml = '<a href="/pelicula/670-oldboy-sub-espanol/"><img src="/poster.jpg" alt="Oldboy"><h2>Oldboy</h2><span>2003</span></a>';
const detailHtml = '<a href="/f/1/670/0018111/">Ver</a><a href="/f/2/670/second/">Otro</a>';

test("search returns a strict movie item with TMDB identity", async () => {
  const { calls } = kinoMock({
    [searchUrl]: response(200, searchHtml, searchUrl)
  });
  const items = await mod.search({ q: "Oldboy" });
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "ala-movie-670");
  assert.equal(items[0].ids.tmdb, 670);
  assert.equal(items[0].ref, detail);
  assert.equal(items[0].kind, "movie");
  assert.ok(calls.every((call) => new URL(call.url).hostname.endsWith("asialiveaction.com")));
});

test("search falls back to browser.page after an HTTP 403", async () => {
  const { mock, calls } = kinoMock({
    [searchUrl]: response(403, "forbidden", searchUrl)
  });
  mock.browser.page = async (url, opts) => {
    calls.push({ kind: "page", url, opts });
    return { html: searchHtml, finalUrl: url, status: 200, truncated: false };
  };
  const items = await mod.search({ q: "Oldboy" });
  assert.equal(items.length, 1);
  assert.ok(calls.some((call) => call.kind === "page"));
});

test("resolve captures the player page and preserves playback headers", async () => {
  const { mock, calls } = kinoMock({
    [detail]: response(200, detailHtml, detail)
  });
  mock.browser.capture = async (url, opts) => {
    calls.push({ kind: "capture", url, opts });
    return {
      finalUrl: url,
      media: [
        {
          url: "https://cdn.example/video/master.m3u8?token=x",
          mime: "application/vnd.apple.mpegurl",
          headers: { Referer: url, "User-Agent": "UA" }
        },
        {
          url: "https://cdn.example/video/fallback.mp4",
          mime: "video/mp4",
          headers: { Referer: url }
        }
      ],
      subtitles: [{ url: "https://cdn.example/sub.vtt", lang: "es" }]
    };
  };
  const stream = await mod.resolve(detail);
  assert.equal(stream.url, "https://cdn.example/video/master.m3u8?token=x");
  assert.equal(stream.headers.Referer, "https://asialiveaction.com/f/1/670/0018111/");
  assert.equal(stream.alternatives.length, 1);
  assert.equal(stream.subtitles[0].lang, "es");
  assert.ok(calls.some((call) => call.kind === "capture" && call.url === "https://asialiveaction.com/f/1/670/0018111/"));
});

test("resolve tries the next exact player after a timeout", async () => {
  const { mock, calls } = kinoMock({
    [detail]: response(200, detailHtml, detail)
  });
  let count = 0;
  mock.browser.capture = async (url, opts) => {
    calls.push({ kind: "capture", url, opts });
    count += 1;
    if (count === 1) throw Object.assign(new Error("timeout"), { code: "timeout" });
    return {
      finalUrl: url,
      media: [{ url: "https://cdn.example/ok.m3u8", headers: { Referer: url } }],
      subtitles: []
    };
  };
  const stream = await mod.resolve(detail);
  assert.equal(stream.url, "https://cdn.example/ok.m3u8");
  assert.equal(calls.filter((call) => call.kind === "capture").length, 2);
});

test("resolve rejects external or mismatched references before network I/O", async () => {
  for (const ref of [
    "https://evil.example/pelicula/670-oldboy/",
    "https://asialiveaction.com/tv/670t1-oldboy/",
    "javascript:alert(1)"
  ]) {
    const { calls } = kinoMock();
    await assert.rejects(() => mod.resolve(ref));
    assert.equal(calls.length, 0);
  }
});

test("movie parser ignores wrong TMDB playback links", async () => {
  const wrong = '<a href="/f/1/1670/001/">wrong</a><a href="/f/1/670/ok/">right</a>';
  const { mock, calls } = kinoMock({
    [detail]: response(200, wrong, detail)
  });
  mock.browser.capture = async (url, opts) => {
    calls.push({ kind: "capture", url, opts });
    return { finalUrl: url, media: [{ url: "https://cdn.example/right.m3u8", headers: {} }], subtitles: [] };
  };
  const stream = await mod.resolve(detail);
  assert.equal(stream.url, "https://cdn.example/right.m3u8");
  assert.ok(calls.some((call) => call.kind === "capture" && call.url.includes("/f/1/670/")));
  assert.ok(!calls.some((call) => call.kind === "capture" && call.url.includes("/1670/")));
});

test("plugin never evaluates downloaded JavaScript", () => {
  assert.equal(/\beval\s*\(/.test(source), false);
  assert.equal(/\bnew\s+Function\s*\(/.test(source), false);
});
