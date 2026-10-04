'use strict';
// Limited to two public HTML pages, no login, DRM, playback requests, or token logging.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const cp=require('node:child_process');
const { _test }=require('../providers/asialiveaction.js');
const BASE='https://asialiveaction.com';
const DETAIL=BASE+'/pelicula/670-oldboy-sub-espanol/';
const UA='Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36';

function downloadHtml(url, referer) {
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'ala-public-'));
  const dest=path.join(folder,'response.html');
  try {
    const args=['--silent','--location','--max-redirs','4','--max-time','15',
      '--connect-timeout','6','--max-filesize','2000000','--output',dest,
      '--write-out','%{http_code}','--user-agent',UA,'--header','Accept: text/html,application/xhtml+xml'];
    if(referer) args.push('--referer',referer);
    args.push(url);
    let response;
    try {
      response=cp.spawnSync('curl',args,{encoding:'utf8',timeout:18000,maxBuffer:1024*1024});
    } catch (_) {return {status:0,accessible:false};}
    const status=Number(String(response.stdout||'').trim())||0;
    if(response.error||response.status!==0||status!==200) return {status,accessible:false};
    const stat=fs.statSync(dest);
    if(stat.size>2000000) return {status,accessible:false};
    return {status,accessible:true,html:fs.readFileSync(dest,'utf8')};
  } finally {fs.rmSync(folder,{recursive:true,force:true});}
}
function hosts(urls){
  const seen=new Set();
  return urls.map(u=>{
    try{return new URL(u).hostname.toLowerCase();}catch(_){return null;}
  }).filter(h=>h&&h!== 'asialiveaction.com'&&h!== 'www.asialiveaction.com'&&!seen.has(h)&&seen.add(h));
}
const output={site:'Asia Live Action',content:'Oldboy (2003)',detailHttp:0,detailFound:false,
  playerHttp:0,playerFound:false,publicVideoHosts:[],directMediaCount:0,sitePlayable:false};
const d=downloadHtml(DETAIL);
output.detailHttp=d.status;
if(d.accessible){
  const players=_test.playbackLinks(d.html,DETAIL,'670','movie');
  output.detailFound=players.length>0;
  if(players.length){
    // Only public playback page on same site; do not request external hosts or video files.
    const player=players[0];
    const s=downloadHtml(player,DETAIL);
    output.playerHttp=s.status;
    if(s.accessible){
      output.playerFound=true;
      output.publicVideoHosts=hosts(_test.allVideos(s.html,player));
      output.directMediaCount=_test.directMedia(s.html,player).length;
    }
  }
}
console.log(JSON.stringify(output,null,2));
// A blocked public website is evidence, not a CI failure. No false "playable" status.
