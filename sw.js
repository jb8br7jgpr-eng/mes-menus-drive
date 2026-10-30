const CACHE='menus-drive-v41-3-ux-20261030';
const ASSETS=['./','./index.html','./styles.css?v=20261030-40-1','./stock-ui-v41.css?v=20261030-41-3-release','./app.js?v=20261030-41-3-release','./stock-engine-v41.mjs','./stock-week-v41.mjs','./stock-ui-v41.mjs','./stock-actions-v41.mjs','./stock-preview-v413.mjs','./manifest.webmanifest?v=20261029-31','./speedrive-logo-v2.PNG?v=20261029-31','./speedrive-icon-v2.PNG?v=20261029-31'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('menus-drive-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
  event.respondWith(fetch(req).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{});}
    return response;
  }).catch(()=>caches.match(req).then(cached=>cached||Response.error())));
});
