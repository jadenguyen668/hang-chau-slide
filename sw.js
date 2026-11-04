// Serves saved slides from Cache Storage (with Range support for <video>) so the deck plays smoothly and offline.
const CACHE="hang-chau-253e3a3b";
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.add('./')).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('hang-chau-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
 const req=e.request;
 if(req.method!=='GET'||new URL(req.url).origin!==location.origin)return;
 e.respondWith(req.mode==='navigate'?page(req):media(req));
});
// Page: network first (3 s limit, so venue wifi without internet does not hang), saved copy otherwise.
async function page(req){
 const cache=await caches.open(CACHE);
 try{
  const r=await Promise.race([fetch(req),new Promise((_,reject)=>setTimeout(reject,3000))]);
  if(r.ok&&!r.redirected)cache.put('./',r.clone());
  return r;
 }catch{return (await cache.match('./'))||Response.error();}
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
