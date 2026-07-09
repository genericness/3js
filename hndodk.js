/*global UVServiceWorker,__uv$config*/

const swBase = self.location.pathname.replace(/hndodk\.js$/, '')

importScripts(swBase + 'tfg/hpub.bundle.js')
importScripts(swBase + 'tfg/hpub.config.js')
importScripts(__uv$config.sw || swBase + 'tfg/hpub.sw.js')

importScripts(swBase + 'ybii/zwxy.all.js')

const uv = new UVServiceWorker()

let scramjet = null
let scramjetInitialized = false

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim())
})

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

	if (url.pathname.startsWith(swBase + 'pgox/')) {
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
		self.registration.showNotification(d.title || 'Fern', {
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
