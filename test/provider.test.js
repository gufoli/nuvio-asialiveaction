const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../providers/asialiveaction.js'), 'utf8');
const BASE = 'https://asialiveaction.com';
const detail = BASE + '/pelicula/670-oldboy-sub-espanol/';
const player = BASE + '/f/1/670/0018111/';
const iframe = 'https://player.example/embed/one';
const media = 'https://cdn.example/video/master.m3u8?token=secret';
const api = 'https://api.themoviedb.org/3/movie/670?api_key=private-key&language=es-ES';
function runtime(routes = {}, options = {}) {
  const calls = [], logs = [];
  const sandbox = {
    module: {exports:{}}, console:{info:(v)=>logs.push(v)},
    TMDB_API_KEY: options.noKey ? '' : 'private-key',
    setTimeout: options.fastTimers ? (fn)=>setTimeout(fn, 5) : setTimeout,
    clearTimeout,
    fetch: async (url, init) => {
      calls.push({url,init});
      if(options.hang) return new Promise(()=>{});
      const value = routes[url];
      if (value instanceof Error) throw value;
      if (typeof value === 'function') return value(url, init);
      const row = typeof value === 'string' ? {body:value} : value || {status:404};
      return {ok:(row.status || 200)===200,status:row.status||200,url:row.url||url,headers:row.headers||null,text:row.text|| (async()=>row.body||'')};
    }
  };
  if (!options.noURL) sandbox.URL = URL;
  if (!options.noAbort) sandbox.AbortController = AbortController;
  vm.runInNewContext(source, sandbox);
  return {p:sandbox.module.exports,calls,logs};
}
const helpers = runtime().p._test;
function routes() {
  return {
    [api]: JSON.stringify({id:670,title:'Oldboy',original_title:'올드보이'}),
    [detail]: '<a href="/f/1/670/0018111/">Ver</a>',
    [player]: '<iframe src="'+iframe+'"></iframe>',
    [iframe]: '<script>var player={file:"'+media+'"};</script>'
  };
}
function plain(v) { return JSON.parse(JSON.stringify(v)); }

test('movie end-to-end preserves signed stream and playback headers', async()=>{
  const {p,calls}=runtime(routes());
  const result=await p.getStreams('670','movie');
  assert.equal(result.length,1); assert.equal(result[0].url,media);
  assert.equal(result[0].headers.Referer,iframe); assert.equal(result[0].type,'hls');
  assert.equal(result[0].quality,'Auto'); assert.equal(result[0].language,undefined);
  assert.equal(calls.length,4); assert.equal(calls[2].init.headers.Referer,detail);
});
test('parses current allVideos structure, ignores Facebook and template iframe',async()=>{
  const r=routes();r[player]=fs.readFileSync(__dirname+'/fixtures/current-player.html','utf8');
  r['https://player.example/e/current']='<source src="'+media+'">';
  const {p,calls}=runtime(r); const result=await p.getStreams('670','movie');
  assert.equal(result.length,1);
  assert.ok(!calls.some(x=>x.url.includes('facebook')||x.url.includes('${')));
});
test('empty or broken first player falls back to next exact player',async()=>{
  const r=routes();r[detail]+='<a href="/f/2/670/other/">2</a>';
  r[player]={status:503};r[BASE+'/f/2/670/other/']='<video src="/content/film.mp4">';
  const {p}=runtime(r);assert.equal((await p.getStreams('670','movie'))[0].url,BASE+'/content/film.mp4');
});
test('TV end-to-end selects S2E1 and never S1E1 or S2E10',async()=>{
  const d=BASE+'/tv/65693t2-good-morning-call-sub-espanol/';
  const r={
    ['https://api.themoviedb.org/3/tv/65693?api_key=private-key&language=es-ES']:JSON.stringify({id:65693,name:'Good Morning Call'}),
    [d]:'<a href="/e/1/65693t1/1/0/">wrong season</a><a href="/e/1/65693t2/10/0/">wrong episode</a><a href="/e/1/65693t2/1/0/">right</a>',
    [BASE+'/e/1/65693t2/1/0/']:'<source src="//cdn.example/episode.mp4">'
  };
  const {p,calls}=runtime(r);assert.equal((await p.getStreams('65693','series','2','1')).length,1);
  assert.equal(calls.length,3);
});
test('season zero is retained for specials',()=>{
  assert.ok(helpers.directCandidates('12','tv',0,{title:'Show'})[0].includes('/12t0-'));
  assert.equal(helpers.playbackLink('<a href="/e/1/12t0/1/0/">','https://asialiveaction.com/tv/12t0-show/','12','tv',0,1),BASE+'/e/1/12t0/1/0/');
});
test('strict identity rejects external host, query matches, wrong TMDB and episode prefixes',()=>{
  const html='<a href="https://evil.example/f/1/670/0/">x</a><a href="/?next=/f/1/670/">x</a><a href="/f/1/1670/0/">x</a>';
  assert.equal(helpers.playbackLink(html,detail,'670','movie'),null);
  assert.equal(helpers.playbackLink('<a href="/e/1/12t2/10/0/">',BASE,'12','tv',2,1),null);
});
test('invalid arguments fail before network I/O',async()=>{
  const {p,calls}=runtime();
  for(const args of [['670.*','movie'],['670','book'],['0','movie'],['1','tv',1,'1oops'],['1','tv',-1,1],['1','tv',1,0],['1','tv']])
    assert.equal((await p.getStreams(...args)).length,0);
  assert.equal(calls.length,0);
});
test('603 is a normal movie and never emits fake diagnostic streams',async()=>{
  const {p}=runtime(); assert.equal((await p.getStreams('603','movie')).length,0);
});
test('missing key falls back to numeric site search with exact identity',async()=>{
  const r=routes();r[BASE+'/?s=670']='<a href="'+detail+'">Oldboy</a>';
  const {p,calls}=runtime(r,{noKey:true});assert.equal((await p.getStreams('670','movie')).length,1);
  assert.equal(calls[0].url,BASE+'/?s=670');
});
test('failed TMDB can use site search but never loose title matching',async()=>{
  const {p}=runtime({[api]:{status:401},[BASE+'/?s=670']:'<a href="/pelicula/123-oldboy/">Oldboy</a>'});
  assert.equal((await p.getStreams('670','movie')).length,0);
});
test('redirected detail with different identity is rejected',async()=>{
  const r=routes();r[detail]={url:BASE+'/pelicula/123-wrong/',body:r[detail]};
  const {p,calls}=runtime(r);assert.equal((await p.getStreams('670','movie')).length,0);
  assert.ok(!calls.some(x=>x.url===player));
});
test('redirected player uses final location for relative URLs and Referer',async()=>{
  const r=routes();r[player]={url:'https://player.example/nested/frame',body:'<source src="../master.m3u8?x=1&amp;y=2">'};
  const {p}=runtime(r);const result=await p.getStreams('670','movie');
  assert.equal(result[0].url,'https://player.example/master.m3u8?x=1&y=2');
  assert.equal(result[0].headers.Referer,'https://player.example/nested/frame');
});
test('URL resolution works without native URL or AbortController',async()=>{
  const {p}=runtime(routes(),{noURL:true,noAbort:true});assert.equal((await p.getStreams('670','movie')).length,1);
  assert.equal(p._test.absoluteUrl('../a.mp4','https://host.example/a/b/c'),'https://host.example/a/a.mp4');
});
test('URL safety rejects non-HTTP, credentials, template text and literal local addresses',()=>{
  for(const value of ['javascript:alert(1)','data:text/html,x','file:///tmp/a','https://user:pass@host.example/a','${video[1]}','http://127.0.0.1/a','http://localhost/a','http://[::1]/a'])
    assert.equal(helpers.absoluteUrl(value,BASE),null,value);
});
test('allVideos accepts only JSON data and caps candidates',()=>{
  assert.equal(helpers.allVideos('var allVideos = {a: evil()};',BASE).length,0);
  const data={x:Array.from({length:30},(_,i)=>['FM','https://player.example/'+i])};
  assert.equal(helpers.allVideos('const allVideos = '+JSON.stringify(data)+';',BASE).length,6);
});
test('lazy iframe src and escaped media assignments work',()=>{
  assert.deepEqual(plain(helpers.iframeUrls('<iframe src="" data-src="//player.example/embed">',BASE)),['https://player.example/embed']);
  assert.deepEqual(plain(helpers.directMedia('{"file":"https:\\/\\/cdn.example\\/a.m3u8?x=1&amp;y=2"}',BASE)),['https://cdn.example/a.m3u8?x=1&y=2']);
});
test('does not turn arbitrary text URLs, TS segments or disguised extensions into videos',()=>{
  assert.equal(helpers.directMedia('https://cdn.example/ad.mp4 <source src="https://cdn.example/a.ts"> <source src="https://cdn.example/a.mp4.exe">',BASE).length,0);
});
test('duplicate streams returned once',async()=>{
  const r=routes();r[iframe]='<source src="'+media+'"><source src="'+media+'">';
  const {p}=runtime(r);assert.equal((await p.getStreams('670','movie')).length,1);
});
test('embed cycles terminate',async()=>{
  const r=routes();r[iframe]='<iframe src="'+player+'">';
  const {p,calls}=runtime(r);assert.equal((await p.getStreams('670','movie')).length,0);assert.equal(calls.length,4);
});
test('embed depth is bounded',async()=>{
  const r=routes();r[iframe]='<iframe src="https://player.example/two">';
  r['https://player.example/two']='<iframe src="https://player.example/three">';
  const {p,calls}=runtime(r);assert.equal((await p.getStreams('670','movie')).length,0);
  assert.ok(!calls.some(x=>x.url.endsWith('/three')));
});
test('hung fetch terminates even when AbortSignal is unavailable/ignored',async()=>{
  const {p,calls}=runtime({}, {hang:true,fastTimers:true,noAbort:true});
  const result=await p.diagnose('670','movie');assert.equal(result.streamCount,0);
  assert.ok(result.events.some(x=>x.code==='request_timeout'));assert.equal(calls.length,1);
});
test('hung response body is also bounded',async()=>{
  const r=routes();r[api]=async()=>({ok:true,url:api,text:()=>new Promise(()=>{})});
  const {p}=runtime(r,{fastTimers:true});const result=await p.diagnose('670','movie');
  assert.ok(result.events.some(x=>x.code==='request_timeout'));
});
test('network errors and malformed JSON fail without secrets in logs or diagnostics',async()=>{
  const {p,logs}=runtime({[api]:new Error('api_key=private-key token=secret')});
  const result=await p.diagnose('670','movie');
  assert.equal(result.streamCount,0);assert.ok(!JSON.stringify({result,logs}).includes('private-key'));
  assert.ok(!JSON.stringify({result,logs}).includes('token=secret'));
});
test('large HTML bodies are rejected',async()=>{
  const r=routes();r[detail]=' '.repeat(2000001);
  const {p}=runtime(r);assert.ok((await p.diagnose('670','movie')).events.some(x=>x.code==='body_too_large'));
});
test('branching embeds cannot exceed total request budget',async()=>{
  const r=routes();r[player]='var allVideos='+JSON.stringify({x:Array.from({length:6},(_,i)=>['FM','https://player.example/'+i])})+';';
  for(let i=0;i<6;i++) r['https://player.example/'+i]=Array.from({length:6},(_,j)=>'<iframe src="https://player.example/'+i+'/'+j+'">').join('');
  const {p,calls}=runtime(r);await p.getStreams('670','movie');assert.ok(calls.length<=18);
});
test('manifest versions and provider path remain consistent',()=>{
  const m=require('../manifest.json'),pkg=require('../package.json');
  assert.equal(m.version,pkg.version);assert.equal(m.scrapers[0].version,pkg.version);
  assert.ok(fs.existsSync(require('node:path').join(__dirname,'..',m.scrapers[0].filename)));
});
test('invalid JSON and mismatched TMDB metadata do not select another title',async()=>{
  for(const metadata of ['not json',JSON.stringify({id:12,title:'Wrong'})]) {
    const {p,calls}=runtime({[api]:metadata});assert.equal((await p.getStreams('670','movie')).length,0);
    assert.ok(!calls.some(x=>x.url.includes('wrong')));
  }
});
test('quality is not inferred from signed token digits',async()=>{
  const r=routes();r[iframe]='<source src="https://cdn.example/master.m3u8?token=1080abcdef">';
  const {p}=runtime(r);assert.equal((await p.getStreams('670','movie'))[0].quality,'Auto');
});
test('direct sources never exceed six returned streams',async()=>{
  const r=routes();r[iframe]=Array.from({length:50},(_,i)=>'<source src="https://cdn.example/v'+i+'.mp4">').join('');
  const {p}=runtime(r);assert.equal((await p.getStreams('670','movie')).length,6);
});

test('redirect to real HLS is returned without reading a binary media response',async()=>{
  const r=routes();let read=false;
  const redirected='https://cdn.example/media/master.m3u8?token=secret';
  r[player]=()=>({ok:true,status:200,url:redirected,
    headers:{get:()=> 'application/vnd.apple.mpegurl'},
    text:()=>{read=true;throw new Error('media must not be read as HTML');}});
  const {p}=runtime(r);const streams=await p.getStreams('670','movie');
  assert.equal(streams.length,1);
  assert.equal(streams[0].url,redirected);
  assert.equal(streams[0].type,'hls');
  assert.equal(streams[0].headers.Referer,detail);
  assert.equal(read,false);
});
test('redirect to HTML disguised as mp4 is not a playable stream',async()=>{
  const r=routes();let read=false;
  r[player]=()=>({ok:true,status:200,url:'https://cdn.example/watch.mp4',
    headers:{get:()=> 'text/html; charset=utf-8'},
    text:async()=>{read=true;return '<html><body>access denied</body></html>';}});
  const {p}=runtime(r);assert.equal((await p.getStreams('670','movie')).length,0);
  assert.equal(read,true);
});
test('unsafe final redirects are rejected and never become streams',async()=>{
  for(const u of ['http://localhost:8080/p.mp4','http://10.0.0.3/p.m3u8','https://private.internal/file.mp4']) {
    const r=routes();r[player]={url:u,body:'<source src="'+media+'">'};
    const {p}=runtime(r);assert.equal((await p.getStreams('670','movie')).length,0,u);
  }
});
test('host validation rejects non-public or invalid URL authority',()=>{
  for(const u of ['https://site.internal/a','http://host.lan/a','https://home.arpa/a',
    'http://localhost./a','http://foo..example/a','https://example.com:65536/a',
    'https://example.com:abc/a','http://[::ffff:127.0.0.1]/a']) {
    assert.equal(helpers.absoluteUrl(u,BASE),null,u);
  }
  assert.equal(helpers.absoluteUrl('https://cdn.example:8443/v.m3u8',BASE),'https://cdn.example:8443/v.m3u8');
});
