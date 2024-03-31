import {
	createElement as h,
	startTransition,
	use,
	useDeferredValue,
	useEffect,
	useReducer,
	useRef,
	useState,
	useTransition,
} from 'react'
import { createRoot } from 'react-dom/client'
import * as RSC from 'react-server-dom-esm/client'
import { RouterContext } from './router.js'

const getGlobalLocation = () =>
	window.location.pathname + window.location.search

function fetchContent(location) {
	return fetch(`/rsc${location}`)
}

const moduleBaseURL = '/js/src'

function generateKey() {
	return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

function updateContentKey() {
	console.error('updateContentKey called before it was set!')
}
const contentCache = new Map()

function createFromFetch(fetchPromise) {
	return RSC.createFromFetch(fetchPromise, { moduleBaseURL, callServer })
}

async function callServer(id, args) {
	// using the global location to avoid a stale closure over the location
	const fetchPromise = fetch(`/action${getGlobalLocation()}`, {
		method: 'POST',
		headers: { Accept: 'text/x-component', 'rsc-action': id },
		body: await RSC.encodeReply(args),
	})
	const contentKey = window.history.state?.key ?? generateKey()
	onStreamFinished(fetchPromise, () => {
		updateContentKey(contentKey, true)
	})
	const actionResponsePromise = createFromFetch(fetchPromise)
	contentCache.set(contentKey, actionResponsePromise)
	const { returnValue } = await actionResponsePromise
	return returnValue
}

const initialLocation = getGlobalLocation()
const initialContentPromise = createFromFetch(fetchContent(initialLocation))

let initialContentKey = window.history.state?.key
if (!initialContentKey) {
	initialContentKey = generateKey()
	window.history.replaceState({ key: initialContentKey }, '')
}
contentCache.set(initialContentKey, initialContentPromise)

function onStreamFinished(fetchPromise, onFinished) {
	// create a promise chain that resolves when the stream is completely consumed
	return (
		fetchPromise
			// clone the response so createFromFetch can use it (otherwise we lock the reader)
			// and wait for the text to be consumed so we know the stream is finished
			.then(response => response.clone().text())
			.then(onFinished)
	)
}

export function Root() {
	const [, forceRender] = useReducer(() => Symbol(), Symbol())
	const latestNav = useRef(null)
	const [nextLocation, setNextLocation] = useState(getGlobalLocation)
	const [contentKey, setContentKey] = useState(initialContentKey)
	const [isPending, startTransition] = useTransition()

	// update the updateContentKey function to the latest every render
	useEffect(() => {
		updateContentKey = (newContentKey, triggerRerender = false) => {
			startTransition(() => setContentKey(newContentKey))
			if (triggerRerender) forceRender()
		}
	})

	const location = useDeferredValue(nextLocation)
	const contentPromise = contentCache.get(contentKey)

	useEffect(() => {
		function handlePopState() {
			const nextLocation = getGlobalLocation()
			setNextLocation(nextLocation)
			const historyKey = window.history.state?.key ?? generateKey()

			const thisNav = Symbol(`Nav for ${historyKey}`)
			latestNav.current = thisNav

			let nextContentPromise
			const fetchPromise = fetchContent(nextLocation)
			onStreamFinished(fetchPromise, () => {
				contentCache.set(historyKey, nextContentPromise)
				if (thisNav === latestNav.current) {
					// trigger a rerender now that the updated content is in the cache
					startTransition(() => forceRender())
				}
			})
			nextContentPromise = createFromFetch(fetchPromise)

			if (!contentCache.has(historyKey)) {
				// if we don't have this key in the cache already, set it now
				contentCache.set(historyKey, nextContentPromise)
			}

			updateContentKey(historyKey)
		}
		window.addEventListener('popstate', handlePopState)
		return () => window.removeEventListener('popstate', handlePopState)
	}, [])

	async function navigate(nextLocation, { replace = false, contentKey } = {}) {
		setNextLocation(nextLocation)
		const thisNav = Symbol()
		latestNav.current = thisNav

		const newContentKey = contentKey ?? generateKey()
		const nextContentPromise = createFromFetch(
			fetchContent(nextLocation).then(response => {
				if (thisNav !== latestNav.current) return
				if (replace) {
					window.history.replaceState({ key: newContentKey }, '', nextLocation)
				} else {
					window.history.pushState({ key: newContentKey }, '', nextLocation)
				}
				return response
			}),
		)

		contentCache.set(newContentKey, nextContentPromise)
		updateContentKey(newContentKey)
	}

	return h(
		RouterContext.Provider,
		{
			value: {
				location,
				nextLocation: isPending ? nextLocation : location,
				navigate,
				isPending,
			},
		},
		use(contentPromise).root,
	)
}

startTransition(() => {
	createRoot(document.getElementById('root')).render(h(Root))
})
