// The native chat, part 8: searching inside one conversation, and the
// full-screen picture viewer.
;(function () {
	'use strict'

	var C = window.MNA.chat
	var DEBOUNCE_MS = 300
	var input = null
	var results = null
	var timer = null
	var token = 0

	function box() {
		return C.dom.searchHost
	}

	function draw(rows, query) {
		results.replaceChildren()
		if (rows && rows.length) {
			rows.forEach(function (r) {
				var button = C.el('button', 'mna-c-hit')
				button.type = 'button'
				button.appendChild(C.el('span', 'mna-c-hit-name', r.sender_name + ':'))
				button.appendChild(
					document.createTextNode(' ' + (C.isHtml(r.content) ? C.plainText(r.content) : r.content))
				)
				button.addEventListener('click', function () {
					C.closeSearch()
					C.jumpTo(r.name)
				})
				results.appendChild(button)
			})
		} else if (query) {
			results.appendChild(C.el('p', 'mna-c-hit-none', 'No matches.'))
		}
	}

	function run() {
		var query = input.value.trim()
		var mine = ++token
		if (!query) {
			draw(null, '')
			return
		}
		C.fetch('search_messages', { conversation: C.state.active, query: query }).then(
			function (rows) {
				if (mine === token) draw(rows || [], query)
			},
			function () {
				if (mine === token) draw([], query)
			}
		)
	}

	function build() {
		box().replaceChildren()
		input = C.el('input', 'mna-c-search-input')
		input.type = 'text'
		input.placeholder = 'Search in this conversation'
		input.setAttribute('aria-label', 'Search in this conversation')
		input.addEventListener('input', function () {
			clearTimeout(timer)
			timer = setTimeout(run, DEBOUNCE_MS)
		})
		results = C.el('div', 'mna-c-hits')
		box().appendChild(input)
		box().appendChild(results)
	}

	C.closeSearch = function () {
		token++
		if (box()) {
			box().hidden = true
			box().replaceChildren()
		}
	}

	C.toggleSearch = function () {
		if (!box().hidden) {
			C.closeSearch()
			return
		}
		build()
		box().hidden = false
		input.focus()
	}

	C.on('open', function () {
		if (C.dom && C.dom.searchHost) C.closeSearch()
	})

	// ---- The picture viewer ----
	var overlay = null
	var index = 0
	var images = []

	function close() {
		if (!overlay) return
		overlay.remove()
		overlay = null
		document.removeEventListener('keydown', onKey)
	}

	function onKey(event) {
		if (event.key === 'Escape') close()
		else if (event.key === 'ArrowRight') step(1)
		else if (event.key === 'ArrowLeft') step(-1)
	}

	function step(by) {
		if (images.length < 2) return
		index = (index + by + images.length) % images.length
		show()
	}

	function round(icon, label, className, onClick) {
		var button = C.el('button', 'mna-c-lb-btn ' + className)
		button.type = 'button'
		button.setAttribute('aria-label', label)
		button.appendChild(C.icon(icon, 'mna-c-medium'))
		button.addEventListener('click', function (event) {
			event.stopPropagation()
			onClick()
		})
		return button
	}

	function show() {
		var current = images[index]
		overlay.replaceChildren()
		overlay.appendChild(round('x', 'Close', 'close', close))
		var download = C.el('a', 'mna-c-lb-btn download')
		download.href = current.file_url
		download.download = current.file_name || ''
		download.target = '_blank'
		download.rel = 'noopener'
		download.setAttribute('aria-label', 'Download')
		download.appendChild(C.icon('download', 'mna-c-medium'))
		download.addEventListener('click', function (event) {
			event.stopPropagation()
		})
		overlay.appendChild(download)
		if (images.length > 1) {
			overlay.appendChild(
				round('chevron-left', 'Previous', 'prev', function () {
					step(-1)
				})
			)
			overlay.appendChild(
				round('chevron-right', 'Next', 'next', function () {
					step(1)
				})
			)
			overlay.appendChild(C.el('div', 'mna-c-lb-count', index + 1 + ' / ' + images.length))
		}
		var img = C.el('img', 'mna-c-lb-img')
		img.src = current.file_url
		img.alt = ''
		img.addEventListener('click', function (event) {
			event.stopPropagation()
		})
		overlay.appendChild(img)
	}

	// `pictures` is every image of the message, so the arrows go past the "+N" one.
	C.lightbox = function (pictures, start) {
		images = pictures
		index = start
		overlay = C.el('div', 'mna-c-lb')
		overlay.addEventListener('click', close)
		document.body.appendChild(overlay)
		document.addEventListener('keydown', onKey)
		show()
	}
})()
