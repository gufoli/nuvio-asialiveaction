/**
 * Asia Live Action provider for Nuvio
 * v0.1.6
 *
 * Evidence-based changes:
 * - Direct modern URL lookup by TMDB id before WordPress search.
 * - Exact TMDB identity; no loose-title fallback.
 * - Public pages only. No account/paywall/DRM bypass.
 */
var ALA_BASE = "https://asialiveaction.com";
var ALA_UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
var MAX_EMBED_DEPTH = 2;
var MAX_EMBEDS = 6;
var MAX_REQUESTS = 18;
var REQUEST_TIMEOUT_MS = 7000;
var LOOKUP_TIMEOUT_MS = 28000;
var MAX_BODY_CHARS = 2000000;

function context() {
  return {deadline:Date.now()+LOOKUP_TIMEOUT_MS, requests:0, events:[], stopped:false};
}
function record(ctx, code, url, status) {
  var host = String(url||"").match(/^https?:\/\/([^/?#]+)/i);
  var event = {code:code};
  if(host) event.host = host[1];
  if(status) event.status = status;
  if(ctx.events.length<40) ctx.events.push(event);
  try { console.info("[AsiaLiveAction] " + JSON.stringify(event)); } catch (_) {}
}
function integer(v, minimum) {
  return /^\d+$/.test(String(v)) && Number(v)>=minimum && Number(v)<=2147483647;
}

function tmdbKey() {
  try { if (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) return String(TMDB_API_KEY); } catch (_) {}
  try { if (globalThis && globalThis.TMDB_API_KEY) return String(globalThis.TMDB_API_KEY); } catch (_) {}
  return "";
}
function normType(v) {
  v = String(v || "").toLowerCase();
  return (v === "tv" || v === "series" || v === "show") ? "tv" : (v === "movie" ? "movie" : null);
}
function decodeHtml(v) {
  return String(v || "").replace(/&amp;/gi,"&").replace(/&#038;/gi,"&").replace(/&quot;/gi,'"')
    .replace(/&#039;|&apos;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">");
}
// Resolve without relying on the host application's partial URL polyfill.
function absoluteUrl(url, base) {
  if (!url) return null;
  var v=decodeHtml(String(url).trim()).replace(/\\\//g,"/");
  if (!v || /[\s\\<>"'`]/.test(v) || /\$\{/.test(v)) return null;
  var origin=String(base||ALA_BASE).match(/^(https?:\/\/[^/?#]+)([^?#]*)/i);
  if (!origin) return null;
  if (/^\/\//.test(v)) v=origin[1].split(':')[0]+':'+v;
  else if (!/^https?:\/\//i.test(v)) {
    if (/^[a-z][\w+.-]*:/i.test(v)) return null;
    if (v.charAt(0)==='#') return null;
    var path=origin[2]||'/';
    v=origin[1]+(v.charAt(0)==='/' ? v : v.charAt(0)==='?' ? path+v : path.replace(/[^/]*$/,'')+v);
  }
  var m=v.match(/^(https?:\/\/)([^/?#]+)([^?#]*)([?#].*)?$/i);
  if(!m || /@|%/.test(m[2])) return null;
  var authority=m[2].toLowerCase();
  // Reject ambiguous or non-public network authorities before making any request.
  if(!/^[a-z0-9.-]+(?::\d{1,5})?$/.test(authority)) return null;
  var port=authority.match(/:(\d{1,5})$/);
  if(port && (Number(port[1])<1 || Number(port[1])>65535)) return null;
  var host=authority.replace(/:\d+$/,'');
  if(!host || host.slice(-1)==='.' || host.indexOf('..')!==-1 ||
     /(?:^|\.)(?:localhost|local|lan|internal)$/.test(host) ||
     /(?:^|\.)home\.arpa$/.test(host) ||
     /^\d+(?:\.\d+)*$|^0x/i.test(host)) return null;
  var parts=m[3].split('/'), clean=[];
  for(var i=0;i<parts.length;i++) {
    if(parts[i]==='..') clean.pop();
    else if(parts[i]!=='.' && parts[i]!=='') clean.push(parts[i]);
  }
  return m[1].toLowerCase()+m[2].toLowerCase()+'/'+clean.join('/')+(m[3].slice(-1)==='/'&&clean.length?'/':'')+(m[4]||'');
}
function headers(referer, accept) {
  var h = {"User-Agent":ALA_UA, "Accept":accept || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"};
  if (referer) h["Referer"] = referer;
  return h;
}

var MAX_REDIRECTS = 4;
// The Nuvio fetch bridge buffers response bodies before returning them to JS.
// Follow redirects manually so an embed's Location: .../video.m3u8 never
// downloads the entire video into the plugin runtime.
async function getPage(url, referer, ctx, json) {
  var current=absoluteUrl(url,referer), from=referer, seen=Object.create(null);
  if(!current) return null;
  for(var hop=0;hop<=MAX_REDIRECTS;hop++) {
    if(ctx.stopped||Date.now()>=ctx.deadline||ctx.requests>=MAX_REQUESTS) {
      record(ctx,"budget_exhausted"); return null;
    }
    if(seen[current]) { record(ctx,"redirect_cycle",current); return null; }
    seen[current]=true;
    if(!json && mediaUrl(current)) return {url:current,body:"",directMedia:true,referer:from};
    ctx.requests++;
    var controller=typeof AbortController!=="undefined" ? new AbortController() : null;
    var timer, timedOut=false;
    var target=current;
    var work=(async function() {
      var options={headers:headers(from,json?"application/json":null),redirect:"manual"};
      if(controller) options.signal=controller.signal;
      var response=await fetch(target,options);
      if(!response) { record(ctx,"network_error",target); return null; }
      var responseUrl=absoluteUrl(response.url||target,target);
      if(!responseUrl) { record(ctx,"invalid_redirect"); return null; }
      var status=Number(response.status)||0, location=null, mime="";
      try {
        if(response.headers && typeof response.headers.get==="function") {
          location=response.headers.get("location");
          mime=String(response.headers.get("content-type")||"").toLowerCase();
        }
      } catch (_) {}
      // Do not ask the native network bridge to fetch media URL targets.
      if([301,302,303,307,308].indexOf(status)>=0) {
        var next=absoluteUrl(location,responseUrl);
        if(!next) { record(ctx,"invalid_redirect",responseUrl); return null; }
        return {redirect:next,url:responseUrl};
      }
      if(!response.ok) {record(ctx,"http_error",responseUrl,status);return null;}
      // Host runtimes which ignore redirect:manual can still report a final URL.
      // This fallback avoids JS text parsing, but the host may already have buffered the body.
      if(!json && mediaUrl(responseUrl) && !/(?:text\/html|application\/xhtml\+xml|application\/json)/.test(mime))
        return {url:responseUrl,body:"",directMedia:true,referer:from};
      var body=await response.text();
      if(body.length>MAX_BODY_CHARS) {record(ctx,"body_too_large",responseUrl);return null;}
      return {url:responseUrl,body:body};
    })();
    var page=null;
    try {
      if(typeof setTimeout!=="function") page=await work;
      else page=await Promise.race([work,new Promise(function(resolve) {
        timer=setTimeout(function() {
          timedOut=true;ctx.stopped=true;
          if(controller) controller.abort();
          record(ctx,"request_timeout",target);resolve(null);
        },Math.min(REQUEST_TIMEOUT_MS,Math.max(1,ctx.deadline-Date.now())));
      })]);
    } catch (_) {
      if(!timedOut) record(ctx,"network_error",target);
      return null;
    } finally {if(timer && typeof clearTimeout==="function") clearTimeout(timer);}
    if(!page) return null;
    if(!page.redirect) return page;
    from=page.url;
    current=page.redirect;
  }
  record(ctx,"redirect_limit",current);
  return null;
}
async function tmdbMeta(id, mediaType, ctx) {
  var key=tmdbKey(); if(!key) { record(ctx,"tmdb_key_missing"); return null; }
  var page=await getPage("https://api.themoviedb.org/3/"+mediaType+"/"+id+
    "?api_key="+encodeURIComponent(key)+"&language=es-ES",null,ctx,true);
  if(!page) return null;
  try {
    var d=JSON.parse(page.body);
    if(String(d.id)!==String(id)) return null;
    return {title:d.title||d.name||"",originalTitle:d.original_title||d.original_name||""};
  } catch (_) { record(ctx,"tmdb_invalid_json"); return null; }
}
function slugify(v) {
  return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
    .replace(/&/g," y ").replace(/['’`]/g,"").replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"").replace(/-+/g,"-");
}
function unique(values) {
  var seen={}, out=[];
  for (var i=0;i<values.length;i++) {
    var v=String(values[i]||"").trim(), k=v.toLowerCase();
    if (v && !seen[k]) { seen[k]=true; out.push(v); }
  }
  return out;
}
function directCandidates(id, mediaType, season, meta) {
  var t=normType(mediaType), s=(season == null ? 1 : Number(season)), out=[], seen={};
  var titles=unique([meta && meta.title, meta && meta.originalTitle]);
  for (var i=0;i<titles.length;i++) {
    var slug=slugify(titles[i]); if (!slug) continue;
    var c=[];
    if (t==="movie") {
      c.push(
        ALA_BASE + "/pelicula/" + id + "-" + slug + "-sub-espanol/",
        ALA_BASE + "/pelicula/" + id + "-" + slug + "/"
      );
    } else {
      c.push(
        ALA_BASE + "/tv/" + id + "t" + s + "-" + slug + "-sub-espanol/",
        ALA_BASE + "/tv/" + id + "t" + s + "-" + slug + "-" + s + "-temporada-" + s + "-sub-espanol/",
        ALA_BASE + "/tv/" + id + "t" + s + "-" + slug + "-temporada-" + s + "-sub-espanol/"
      );
    }
    for (var j=0;j<c.length;j++) if (!seen[c[j]]) { seen[c[j]]=true; out.push(c[j]); }
  }
  return out;
}
function extractHrefs(html, base) {
  var out=[], seen={}, re=/href\s*=\s*["']([^"']+)["']/gi, m;
  while ((m=re.exec(html||""))!==null) {
    var u=absoluteUrl(m[1],base);
    if (u && !seen[u]) { seen[u]=true; out.push(u); }
  }
  return out;
}
function exactDetailFromSearch(html,id,mediaType,season) {
  var hrefs=extractHrefs(html,ALA_BASE), t=normType(mediaType), s=(season == null ? 1 : Number(season));
  var p=t==="movie"
    ? new RegExp("^https?://(?:www\\.)?asialiveaction\\.com/pelicula/"+String(id).replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"-","i")
    : new RegExp("^https?://(?:www\\.)?asialiveaction\\.com/tv/"+String(id).replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"t"+s+"-","i");
  for (var i=0;i<hrefs.length;i++) if (p.test(hrefs[i])) return hrefs[i];
  return null;
}
function playbackLinks(html,detailUrl,id,mediaType,season,episode) {
  if(!integer(id,1) || !normType(mediaType)) return [];
  var hrefs=extractHrefs(html,detailUrl), t=normType(mediaType);
  if(t==='tv' && (!integer(season,0)||!integer(episode,1))) return [];
  var path=t==='movie' ? '/f/\\d+/'+Number(id)+'/' : '/e/\\d+/'+Number(id)+'t'+Number(season)+'/'+Number(episode)+'/';
  var re=new RegExp('^https?://(?:www\\.)?asialiveaction\\.com'+path,'i');
  return hrefs.filter(function(u){return re.test(u);}).slice(0,MAX_EMBEDS);
}
function playbackLink(html,detailUrl,id,mediaType,season,episode) {
  return playbackLinks(html,detailUrl,id,mediaType,season,episode)[0]||null;
}
async function locateDetail(id,mediaType,season,episode,meta,ctx) {
  var direct=directCandidates(id,mediaType,season,meta), tried=Object.create(null);
  async function check(url) {
    if(tried[url]) return null; tried[url]=true;
    var page=await getPage(url,ALA_BASE+'/',ctx); if(!page) return null;
    // Redirects must still identify the requested title and season.
    var exact=exactDetailFromSearch('<a href="'+page.url+'">',id,mediaType,season);
    if(!exact) return null;
    var players=playbackLinks(page.body,page.url,id,mediaType,season,episode);
    return players.length ? {url:page.url,players:players} : null;
  }
  for(var i=0;i<direct.length;i++) {
    var result=await check(direct[i]); if(result) return result;
    if(ctx.stopped) return null;
  }
  // ID search makes lookup possible even without injected TMDB metadata.
  var terms=unique([meta&&meta.title,meta&&meta.originalTitle,String(id)]);
  for(var j=0;j<terms.length;j++) {
    var search=await getPage(ALA_BASE+'/?s='+encodeURIComponent(terms[j]),ALA_BASE+'/',ctx);
    if(!search) continue;
    var url=exactDetailFromSearch(search.body,id,mediaType,season);
    if(url) { var found=await check(url); if(found) return found; }
  }
  return null;
}
function mediaUrl(u) {
  if (!u) return false;
  u=String(u).toLowerCase();
  return /\.m3u8(?:[?#]|$)/.test(u)||/\.(?:mp4|mkv|webm)(?:[?#]|$)/.test(u);
}
function typeFromUrl(u) {
  u=String(u||"").toLowerCase();
  if (/\.m3u8(?:[?#]|$)/.test(u)) return "hls";
  if (/\.mpd(?:[?#]|$)/.test(u)) return "dash";
  return "mp4";
}
function quality(v) {
  // Only explicit resolution markers; token digits are not evidence of quality.
  var path=String(v||"").split(/[?#]/)[0].toLowerCase();
  var m=path.match(/(?:^|[\/_.-])(2160p|1080p|720p|480p|360p|4k)(?=[\/_.-]|$)/);
  return m ? (m[1]==="2160p"||m[1]==="4k" ? "4K" : m[1]) : "Auto";
}
function directMedia(html,base) {
  var s=decodeHtml(String(html||'')).replace(/\\\//g,'/'), out=[], seen=Object.create(null);
  // Read media assignments only: arbitrary URLs in ads/scripts are not streams.
  var patterns=[/(?:["']?(?:file|src|hls)["']?)\s*[:=]\s*["']([^"'<>\s]+)["']/gi];
  for(var p=0;p<patterns.length;p++) {
    var m; while((m=patterns[p].exec(s))!==null) {
      var u=absoluteUrl(m[1],base);
      if(u&&mediaUrl(u)&&!seen[u]) {seen[u]=true;out.push(u);}
      if(out.length>=MAX_EMBEDS) return out;
    }
  }
  return out;
}
// Parse a JSON object literal, never execute remote JavaScript.
function allVideos(html,base) {
  var match=/\b(?:var|let|const)\s+allVideos\s*=\s*/.exec(html||'');
  if(!match) return [];
  var start=match.index+match[0].length, depth=0, quoted=false, escaped=false, end=-1;
  if(html[start]!=='{') return [];
  for(var i=start;i<html.length;i++) {
    var ch=html[i];
    if(quoted) {if(escaped) escaped=false;else if(ch==='\\') escaped=true;else if(ch==='"') quoted=false;}
    else if(ch==='"') quoted=true;
    else if(ch==='{') depth++;
    else if(ch==='}' && --depth===0) {end=i+1;break;}
  }
  if(end<0) return [];
  try {
    var data=JSON.parse(html.slice(start,end)),out=[];
    Object.keys(data).some(function(key) {
      if(!Array.isArray(data[key])) return false;
      return data[key].some(function(row) {
        var u=Array.isArray(row)&&typeof row[1]==='string' ? absoluteUrl(row[1],base) : null;
        if(u&&out.indexOf(u)===-1) out.push(u);
        return out.length>=MAX_EMBEDS;
      });
    });
    return out;
  } catch (_) {return [];}
}
function iframeUrls(html,base) {
  var out=allVideos(html,base),seen=Object.create(null),re=/<iframe\b[^>]*>/gi,m;
  out.forEach(function(u){seen[u]=true;});
  while(out.length<MAX_EMBEDS && (m=re.exec(html||''))!==null) {
    var attr=/\b(?:data-src|src)\s*=\s*["']([^"']*)["']/gi,a;
    while((a=attr.exec(m[0]))!==null) {
      var u=absoluteUrl(a[1],base);
      if(u&&!seen[u]&&!/^https?:\/\/(?:www\.)?(?:facebook\.com|youtube\.com|google\.com|doubleclick\.net)\//i.test(u)) {
        seen[u]=true;out.push(u);break;
      }
    }
  }
  return out;
}
async function resolvePage(url,referer,depth,visited,ctx) {
  if(!url||depth>MAX_EMBED_DEPTH||ctx.stopped||visited[url]) return [];
  visited[url]=true;
  if(mediaUrl(url)) return [{url:url,referer:referer,type:typeFromUrl(url),quality:quality(url)}];
  var page=await getPage(url,referer,ctx); if(!page) return [];
  if(page.directMedia) return [{url:page.url,referer:page.referer||referer,type:typeFromUrl(page.url),quality:quality(page.url)}];
  var d=directMedia(page.body,page.url),out=[];
  for(var i=0;i<d.length;i++) out.push({url:d[i],referer:page.url,type:typeFromUrl(d[i]),quality:quality(d[i])});
  if(out.length) return out;
  var frames=iframeUrls(page.body,page.url);
  if(!frames.length) record(ctx,"no_supported_media",page.url);
  for(var j=0;j<frames.length && out.length<MAX_EMBEDS;j++) {
    var n=await resolvePage(frames[j],page.url,depth+1,visited,ctx);
    out=out.concat(n).slice(0,MAX_EMBEDS);
  }
  return out;
}
function dedupe(list) {
  var seen={},out=[];
  for(var i=0;i<list.length;i++){var x=list[i];if(x&&x.url&&!seen[x.url]){seen[x.url]=true;out.push(x);}}
  return out;
}

async function lookup(tmdbId,mediaType,season,episode,ctx) {
  try {
    var t=normType(mediaType);
    if(!integer(tmdbId,1)||!t||(t==="tv"&&(!integer(season,0)||!integer(episode,1)))) {
      record(ctx,"invalid_input");return [];
    }
    tmdbId=String(Number(tmdbId));
    var meta=await tmdbMeta(tmdbId,t,ctx);
    var detail=await locateDetail(tmdbId,t,season,episode,meta,ctx);
    if(!detail) {record(ctx,"detail_not_found");return [];}
    var resolved=[], visited=Object.create(null);
    for(var j=0;j<detail.players.length&&resolved.length<MAX_EMBEDS&&!ctx.stopped;j++) {
      resolved=dedupe(resolved.concat(await resolvePage(detail.players[j],detail.url,0,visited,ctx)));
    }
    if(!resolved.length) record(ctx,"stream_not_resolved");
    return resolved.slice(0,MAX_EMBEDS).map(function(x) {
      return {name:"Asia Live Action",title:x.quality+" · Asia Live Action",url:x.url,
        quality:x.quality,provider:"Asia Live Action",type:x.type,
        headers:{"User-Agent":ALA_UA,"Referer":x.referer}};
    });
  } catch (_) {record(ctx,"provider_error");return [];}
}
async function getStreams(tmdbId,mediaType,season,episode) {
  return lookup(tmdbId,mediaType,season,episode,context());
}
// Explicit diagnostics for maintainers; never disguised as playable video rows.
async function diagnose(tmdbId,mediaType,season,episode) {
  var ctx=context(),streams=await lookup(tmdbId,mediaType,season,episode,ctx);
  return {version:"0.1.6",streamCount:streams.length,requests:ctx.requests,events:ctx.events};
}
if(typeof module!=="undefined"&&module.exports) {
  module.exports={getStreams:getStreams,diagnose:diagnose,_test:{slugify:slugify,
    directCandidates:directCandidates,playbackLink:playbackLink,playbackLinks:playbackLinks,
    directMedia:directMedia,allVideos:allVideos,iframeUrls:iframeUrls,absoluteUrl:absoluteUrl,
    exactDetailFromSearch:exactDetailFromSearch}};
}
