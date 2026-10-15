/* Service worker สำหรับติดตั้งเป็นแอปและใช้งานออฟไลน์
   - ไฟล์หลักของแอป: ใช้ของในแคชก่อน แล้วอัปเดตเบื้องหลัง
   - ไลบรารีและฟอนต์จาก CDN: เก็บแคชไว้ตอนใช้งานครั้งแรก
   - ภาพแผนที่ (tiles): ไม่เก็บแคช ปล่อยให้เบราว์เซอร์จัดการเอง */
const VERSION = 'v3';
const SHELL = `shell-${VERSION}`;
const LIBS = `libs-${VERSION}`;
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];
const LIB_HOSTS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await Promise.allSettled(SHELL_FILES.map(f => c.add(new Request(f, { cache: 'reload' }))));
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== SHELL && k !== LIBS).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // หน้าเว็บหลัก: ลองออนไลน์ก่อน ถ้าไม่ได้ใช้ของในแคช
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const net = await fetch(req);
        const c = await caches.open(SHELL);
        c.put('./index.html', net.clone());
        return net;
      } catch (err) {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // ไฟล์ของแอปเอง: ใช้แคชก่อน แล้วอัปเดตเบื้องหลัง
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      const net = fetch(req).then(async res => {
        if (res && res.ok) (await caches.open(SHELL)).put(req, res.clone());
        return res;
      }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
    return;
  }

  // ไลบรารีและฟอนต์: ใช้แคชก่อน ถ้ายังไม่มีจึงโหลดแล้วเก็บไว้
  if (LIB_HOSTS.includes(url.hostname)) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) (await caches.open(LIBS)).put(req, res.clone());
        return res;
      } catch (err) {
        return Response.error();
      }
    })());
  }
  // อื่น ๆ (ภาพแผนที่) ปล่อยผ่านตามปกติ
});
