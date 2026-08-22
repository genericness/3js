const swBase = self.location.pathname.replace(/bbritt\.js$/, '')

importScripts(swBase + 'lpg/cifk.bundle.js')
importScripts(swBase + 'lpg/cifk.config.js')
importScripts(__udx$config.sw || swBase + 'lpg/cifk.sw.js')

importScripts(swBase + 'earn/ikqf.all.js')

const uv = new UVServiceWorker()

let scramjet = null
let scramjetInitialized = false

// Keep identical to SCRAMJET_XOR_CODEC in src/lib/encode.ts (enforced by
// src/lib/encode.test.ts).
const SJ_XOR_ENCODE =
	'function(e){if(!e)return e;var s=e.toString();if(!/^https?:/i.test(s))return s;return encodeURIComponent(s.split("").map(function(c,i){return i%2?String.fromCharCode(c.charCodeAt(0)^2):c}).join(""))}'
const SJ_XOR_DECODE =
	'function(e){if(!e)return e;var s=e.toString(),h=s.indexOf("#"),a=h<0?s:s.slice(0,h),r=h<0?"":s.slice(h),d=a;try{d=decodeURIComponent(a)}catch(t){}var x=d.split("").map(function(c,i){return i%2?String.fromCharCode(c.charCodeAt(0)^2):c}).join("");return(/^https?:/i.test(x)?x:d)+r}'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim())
})

function patchSjDestCodec() {
	return new Promise((resolve) => {
		let settled = false
		const done = () => {
			if (settled) return
			settled = true
			resolve()
		}
		try {
			const req = indexedDB.open('$xtxydhzk', 1)
			// Only patch a config the controller already persisted. If the DB
			// doesn't exist yet, abort the upgrade so we don't leave behind an
			// empty v1 database that would make the controller's own
			// `openDB('$xtxydhzk', 1, { upgrade })` skip creating its stores.
			req.onupgradeneeded = () => {
				try {
					req.transaction?.abort()
				} catch {}
			}
			req.onerror = done
			req.onsuccess = () => {
				const db = req.result
				if (!db.objectStoreNames.contains('config')) {
					db.close()
					done()
					return
				}
				try {
					const tx = db.transaction('config', 'readwrite')
					const store = tx.objectStore('config')
					const get = store.get('config')
					get.onsuccess = () => {
						const cfg = get.result
						if (cfg && cfg.codec) {
							cfg.codec.encode = SJ_XOR_ENCODE
							cfg.codec.decode = SJ_XOR_DECODE
							store.put(cfg, 'config')
						}
					}
					tx.oncomplete = () => {
						db.close()
						done()
					}
					tx.onerror = tx.onabort = () => {
						db.close()
						done()
					}
				} catch {
					db.close()
					done()
				}
			}
		} catch {
			done()
		}
	})
}

async function getScramjet() {
	if (!scramjet) {
		const { ScramjetServiceWorker } = $scramjetLoadWorker()
		scramjet = new ScramjetServiceWorker()
	}
	return scramjet
}

async function handleScramjetRequest(event) {
	try {
		const s = await getScramjet()
		if (!scramjetInitialized) {
			try {
				await patchSjDestCodec()
				await s.loadConfig()
				scramjetInitialized = true
			} catch (e) {
				return new Response(
					`
					<!DOCTYPE html>
					<html>
					<head>
						<meta http-equiv="refresh" content="0.5">
						<style>
							body { font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #1a1a1a; color: #fff; }
							.loader { text-align: center; }
							.spinner { border: 3px solid #333; border-top: 3px solid #fff; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 20px; }
							@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
						</style>
					</head>
					<body>
						<div class="loader">
							<div class="spinner"></div>
						<p>Initializing content handler...</p>
						</div>
					</body>
					</html>
				`,
					{
						status: 200,
						headers: { 'Content-Type': 'text/html' }
					}
				)
			}
		}
		if (s.route(event)) {
			return await s.fetch(event)
		}
	} catch (e) {
		return new Response('Request handler error: ' + e.message, { status: 500 })
	}
	return await fetch(event.request)
}

self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url)

	if (url.pathname.startsWith(swBase + 'uaeq/')) {
		event.respondWith(handleScramjetRequest(event))
		return
	}

	if (uv.route(event)) {
		event.respondWith(uv.fetch(event))
		return
	}
})

// ── Web Push (community chat notifications) ──
self.addEventListener('push', (e) => {
	let d = {}
	try {
		d = e.data.json()
	} catch {}
	e.waitUntil(
		self.registration.showNotification(d.title || '\x46\x65\x72\x6e', {
			body: d.body || '',
			icon: d.icon,
			data: { url: d.url || '/chat' },
			tag: d.tag
		})
	)
})

self.addEventListener('notificationclick', (e) => {
	e.notification.close()
	const url = (e.notification.data && e.notification.data.url) || '/chat'
	e.waitUntil(
		self.clients
			.matchAll({ type: 'window', includeUncontrolled: true })
			.then((cs) => {
				for (const c of cs) {
					if ('focus' in c) {
						c.navigate && c.navigate(url)
						return c.focus()
					}
				}
				return self.clients.openWindow(url)
			})
	)
})
