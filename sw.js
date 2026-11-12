// Serves saved slides from Cache Storage (with Range support for <video>) so the deck plays smoothly and offline.
const CACHE="hang-chau-v2";
// When this worker replaces an older one, open pages are reloaded once so they run the new version.
let replacing=false;
self.addEventListener('install',e=>{replacing=!!self.registration.active;e.waitUntil(caches.open(CACHE).then(c=>c.add(new Request('./',{cache:'no-cache'}))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('hang-chau-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()).then(async()=>{if(replacing)for(const c of await self.clients.matchAll({type:'window'}))c.navigate(c.url);}));});
self.addEventListener('fetch',e=>{
 const req=e.request;
 if(req.method!=='GET'||new URL(req.url).origin!==location.origin)return;
 e.respondWith(req.mode==='navigate'?page(e):media(req));
});
// Page: network first. If GitHub is slow (3 s) the saved copy opens at once (venue wifi without internet must not hang),
// but the new page keeps loading and is saved when it arrives; if it differs and arrives within 20 s of opening,
// the page reloads into it (never later: the presentation may have started).
// no-cache: always ask GitHub whether the page changed, so a new version is never hidden by the browser's 10-minute cache.
async function page(e){
 const cache=await caches.open(CACHE),opened=Date.now();
 const network=fetch(e.request.url,{cache:'no-cache'}).then(async r=>{if(r.ok&&!r.redirected)await cache.put('./',r.clone());return r;});
 const first=await Promise.race([network.catch(()=>'offline'),new Promise(ok=>setTimeout(ok,3000,'slow'))]);
 if(first instanceof Response&&first.ok)return first;
 const saved=await cache.match('./');
 if(!saved)return first instanceof Response?first:network.catch(()=>Response.error());
 if(first==='slow'){
  const was=saved.clone().text();
  e.waitUntil(network.then(async r=>{
   if(!r.ok||Date.now()-opened>20000||(await r.clone().text())===(await was))return;
   const client=await self.clients.get(e.resultingClientId);
   if(client)await client.navigate(client.url);
  }).catch(()=>{}));
 }
 return saved;
}
// [start, end] for a Range header against a file of `size` bytes; null without one, 'bad' if unsatisfiable.
function byteRange(header,size){
 const m=/^bytes=(\d*)-(\d*)$/.exec(header||'');
 if(!m)return null;
 let start=+m[1],end=m[2]?Math.min(+m[2],size-1):size-1;
 if(!m[1]){start=Math.max(0,size-(+m[2]));end=size-1;}
 return start>=size?'bad':[start,end];
}
const partial=(body,type,start,end,size)=>new Response(body,{status:206,headers:{'Content-Type':type,'Content-Range':'bytes '+start+'-'+end+'/'+size,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes'}});
const unsatisfiable=size=>new Response(null,{status:416,headers:{'Content-Range':'bytes */'+size}});
// Media: saved copy first; <video> asks for byte ranges, so slice the saved file and answer 206.
async function media(req){
 const hit=await (await caches.open(CACHE)).match(req.url);
 if(!hit)return fetch(req);
 if(!req.headers.has('range'))return hit; // images: the whole saved file (do not read its body first)
 const blob=await hit.blob(),range=byteRange(req.headers.get('range'),blob.size);
 if(!range)return hit;
 if(range==='bad')return unsatisfiable(blob.size);
 return partial(blob.slice(range[0],range[1]+1),hit.headers.get('Content-Type')||'application/octet-stream',range[0],range[1],blob.size);
}
