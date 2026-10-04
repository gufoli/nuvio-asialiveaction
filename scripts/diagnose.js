'use strict';
// No key is stored in the repository. Optional local environment only.
globalThis.TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const {diagnose} = require('../providers/asialiveaction.js');
const [id, type = 'movie', season, episode] = process.argv.slice(2);
if (!id) {
  console.error('Usage: npm run diagnose -- TMDB_ID movie|tv [SEASON EPISODE]');
  process.exitCode = 2;
} else {
  diagnose(id,type,season,episode).then(report=>{
    console.log(JSON.stringify(report,null,2));
    process.exitCode = report.streamCount ? 0 : 1;
  }).catch(()=>{ console.error('Diagnostic failed');process.exitCode=2; });
}
