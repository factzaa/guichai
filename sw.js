// กุยช่ายสวรรค์ Service Worker
// version: bump เลขเมื่ออัปเดต index.html เพื่อให้ client โหลดเวอร์ชันใหม่
const CACHE_VERSION = 'guichai-v4';
const CACHE_FILES = ['./', './index.html', './records.html', './expenses-report.html',
                     './activities.html',
                     './stock-dashboard.html',
                     './stock-view.html', './stock-history.html', './stock-withdraw.html', './stock-receive.html',
                     './stock-close.html', './stock-audit.html', './stock-audit-report.html', './stock-manage.html',
                     './attend.html', './attend-report.html', './attend-setup.html', './payments.html', './cash-remit.html', './assistant.html',
                     './manual.html',
                     './shared.css', './shared.js', './maru-chick.png',
                     './Logo.png','./ic-overview.png','./ic-record.png','./ic-expense.png','./ic-receive.png','./ic-attend.png','./ic-sales.png','./ic-audit.png','./ic-attendreport.png','./ic-branch.png','./ic-finance.png','./icon-faq.png','./icon-contact.png',
                     './manifest.webmanifest',
                     './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // เพิ่มทีละไฟล์ ถ้าไฟล์ไหนหาย (404) ก็ข้าม ไม่ทำให้ติดตั้งล้มทั้งก้อน
      Promise.all(CACHE_FILES.map((f) => cache.add(f).catch(() => null)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // ไม่ cache request ไปยัง Apps Script (API call) หรือ ImgBB upload
  if (url.hostname.includes('script.google.com') || url.hostname.includes('imgbb.com') || url.hostname.includes('api.line.me')) {
    return;  // ปล่อยให้ผ่าน network ปกติ
  }

  // Network-first สำหรับ HTML / JS / CSS — ได้เวอร์ชันล่าสุดเสมอเมื่อ online
  // กันปัญหา HTML ใหม่ + shared.js เก่าค้าง cache ไม่ตรงกัน (apiSWR undefined → หน้าค้าง)
  const path = url.pathname;
  const isCode = event.request.mode === 'navigate'
    || path.endsWith('/') || path.endsWith('.html')
    || path.endsWith('.js') || path.endsWith('.css');
  if (isCode) {
    event.respondWith(
      fetch(event.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(event.request, copy));
        return res;
      }).catch(() => caches.match(event.request).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first เฉพาะไฟล์นิ่ง (ไอคอน, manifest, font)
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
