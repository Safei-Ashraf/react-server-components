// 💰 you'll need these
// import { createRequire } from 'node:module'
// import path from 'node:path'
import closeWithGrace from 'close-with-grace'
import compress from 'compression'
import express from 'express'
import { createElement as h } from 'react'
import { renderToPipeableStream } from 'react-dom/server'
import { Document } from '../src/app.js'
import { shipDataStorage } from './async-storage.js'

const PORT = process.env.PORT || 3000

const app = express()

app.use(compress())

app.head('/', (req, res) => res.status(200).end())

app.use(express.static('public'))
app.use('/js/src', express.static('src'))

// 🐨 add a middleware for serving the react-server-dom-esm/client module
// we have to server this file from our own server so dynamic imports are
// relative to our own server (this module is what loads client-side modules!)
// 💰 this isn't a node/express workshop, so I've just written it for you:
// app.use('/js/react-server-dom-esm/client', (req, res) => {
// 	const require = createRequire(import.meta.url)
// 	const pkgPath = require.resolve('react-server-dom-esm')
// 	const modulePath = path.join(
// 		path.dirname(pkgPath),
// 		'esm',
// 		'react-server-dom-esm-client.browser.development.js',
// 	)
// 	res.sendFile(modulePath)
// })

app.get('/:shipId?', async function (req, res) {
	try {
		const shipId = req.params.shipId || null
		const search = req.query.search || ''
		res.set('Content-type', 'text/html')
		shipDataStorage.run({ shipId, search }, () => {
			const root = h(Document)
			const { pipe } = renderToPipeableStream(root, {
				bootstrapModules: ['/js/src/index.js'],
				// 🐨 add an importMap object here with imports for:
				// react, react-dom, react-error-boundary, and react-server-dom-esm/client
				// 🦉 It's enough for you to just know that you need to have a way to
				// load these modules in the browser. You don't need to learn how to
				// configure these URLs specifically. In a real world framework, you'd
				// have a bundler that generates a manifest for you.
				// 💰 delete this if you really want to try and figure this out yourself
				// otherwise, simply uncomment it:
				// importMap: {
				// 	imports: {
				// 		react:
				// 			'https://esm.sh/react@0.0.0-experimental-2b036d3f1-20240327?pin=v126&dev',
				// 		'react-dom':
				// 			'https://esm.sh/react-dom@0.0.0-experimental-2b036d3f1-20240327?pin=v126&dev',
				// 		'react-dom/':
				// 			'https://esm.sh/react-dom@0.0.0-experimental-2b036d3f1-20240327&pin=v126&dev/',
				// 		'react-error-boundary':
				// 			'https://esm.sh/react-error-boundary@4.0.13?pin=126&dev',
				// 		'react-server-dom-esm/client': '/js/react-server-dom-esm/client',
				// 	},
				// },
			})
			pipe(res)
		})
	} catch (e) {
		console.error(`Failed to SSR: ${e.stack}`)
		res.statusCode = 500
		res.end(`Failed to SSR: ${e.stack}`)
	}
})

const server = app.listen(PORT, () => {
	console.log(`✅ SSR: http://localhost:${PORT}`)
})

closeWithGrace(async ({ signal, err }) => {
	if (err) console.error('Shutting down server due to error', err)
	else console.log('Shutting down server due to signal', signal)

	await new Promise((resolve, reject) => {
		server.close(err => {
			if (err) reject(err)
			else resolve()
		})
	})
})
