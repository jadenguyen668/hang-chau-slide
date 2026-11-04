// Serves saved slides from Cache Storage (with Range support for <video>) so the deck plays smoothly and offline.
const CACHE="hang-chau-24f56d52";
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
// Media: saved copy first; <video> asks for byte ranges, so slice the saved file and answer 206.
async function media(req){
 const hit=await (await caches.open(CACHE)).match(req.url);
 if(!hit)return fetch(req);
 const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range')||'');
 if(!range)return hit;
 const blob=await hit.blob(),size=blob.size;
 let start=+range[1],end=range[2]?Math.min(+range[2],size-1):size-1;
 if(!range[1]){start=Math.max(0,size-(+range[2]));end=size-1;}
 if(start>=size)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+size}});
 return new Response(blob.slice(start,end+1),{status:206,headers:{'Content-Type':hit.headers.get('Content-Type')||'application/octet-stream','Content-Range':'bytes '+start+'-'+end+'/'+size,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes'}});
}
