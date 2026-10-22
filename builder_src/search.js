// Search page: one search bar, filtering whichever tab (Writers or
// Publications) is active. Each tab's first list is rendered by the server
// (the page's data script), so this only fetches when the query changes, or
// if the active tab's list came up empty. Same API and result rows as the
// old SearchPeople page, plus a parallel Publications search.
;(function () {
	'use strict'

	var DEBOUNCE_MS = 200

	var TABS = {
		writers: {
			listId: 'cafe-people',
			title: 'Writers at Cafe',
			placeholder: 'Search writers',
			emptyText: 'No writers found.',
			errorText: "Couldn't load writers. Please try again.",
			fetchUrl: function (query) {
				return '/api/v2/method/cafe.api.list_people?query=' + encodeURIComponent(query)
			},
			renderRow: function (person) {
				var row = el('a', 'cafe-person')
				row.href = '/profile/' + encodeURIComponent(person.username || person.name)
				row.appendChild(avatar(person.user_image, person.full_name || person.name))
				row.appendChild(el('span', 'cafe-person-name', person.full_name || person.name))
				row.appendChild(el('span', 'cafe-points-badge', String(person.points || 0)))
				return row
			},
		},
		publications: {
			listId: 'cafe-publications',
			title: 'Publications on Cafe',
			placeholder: 'Search publications',
			emptyText: 'No publications found.',
			errorText: "Couldn't load publications. Please try again.",
			fetchUrl: function (query) {
				return '/api/v2/method/cafe.api.list_publications?query=' + encodeURIComponent(query)
			},
			renderRow: function (pub) {
				var row = el('a', 'cafe-person')
				row.href = '/publications/' + encodeURIComponent(pub.handle)
				row.appendChild(el('span', 'cafe-pub-tile', (pub.title || pub.handle || '?').trim().charAt(0)))
				row.appendChild(el('span', 'cafe-person-name', pub.title || pub.handle))
				return row
			},
		},
	}

	var input, title
	var current = 'writers'
	var latestRequest = 0
	var timer = null

	function el(tag, className, text) {
		var node = document.createElement(tag)
		if (className) node.className = className
		if (text) node.textContent = text
		return node
	}

	function avatar(image, label) {
		var box = el('span', 'cafe-avatar')
		if (image) {
			var img = el('img')
			img.src = image
			img.alt = ''
			box.appendChild(img)
		} else {
			box.textContent = (label || '?').trim().charAt(0)
		}
		return box
	}

	function currentList() {
		return document.getElementById(TABS[current].listId)
	}

	function renderRows(rows) {
		var cfg = TABS[current]
		var list = currentList()
		list.replaceChildren()
		if (!rows.length) {
			list.appendChild(el('p', 'cafe-empty', cfg.emptyText))
			return
		}
		rows.forEach(function (row) {
			list.appendChild(cfg.renderRow(row))
		})
	}

	function load(query) {
		var cfg = TABS[current]
		var request = ++latestRequest
		// Built from location.origin, not a relative URL: Builder's editor Preview adds a
		// <base href> (from the site's host_name) that can point at another origin.
		var url = location.origin + cfg.fetchUrl(query)
		fetch(url, { credentials: 'same-origin' })
			.then(function (r) {
				if (r.status === 401 || r.status === 403) {
					location.assign('/login?redirect=' + encodeURIComponent(location.pathname))
					return null
				}
				if (!r.ok) throw new Error('HTTP ' + r.status)
				return r.json()
			})
			.then(function (body) {
				if (!body || request !== latestRequest) return
				renderRows(body.data || [])
			})
			.catch(function () {
				if (request !== latestRequest) return
				currentList().replaceChildren(el('p', 'cafe-empty', cfg.errorText))
			})
	}

	function switchTab(tab) {
		if (tab === current || !TABS[tab]) return
		current = tab
		var cfg = TABS[current]
		document.querySelectorAll('.cafe-tab-btn').forEach(function (b) {
			b.setAttribute('aria-selected', b.getAttribute('data-tab') === tab ? 'true' : 'false')
		})
		document.querySelectorAll('[role="tabpanel"]').forEach(function (panel) {
			panel.hidden = panel.id !== 'cafe-panel-' + tab
		})
		if (title) title.textContent = cfg.title
		input.placeholder = cfg.placeholder
		input.setAttribute('aria-label', cfg.placeholder)
		input.value = ''
		// The newly active panel already has its own server-rendered first
		// paint - only fetch if it genuinely came up empty.
		if (!currentList().querySelector('.cafe-person')) load('')
	}

	document.addEventListener('DOMContentLoaded', function () {
		input = document.getElementById('cafe-search-input')
		title = document.getElementById('cafe-search-title')
		if (!input) return

		document.querySelectorAll('.cafe-tab-btn').forEach(function (button) {
			button.addEventListener('click', function () {
				switchTab(button.getAttribute('data-tab'))
			})
		})

		if (!currentList().querySelector('.cafe-person')) load('')
		input.focus()
		input.addEventListener('input', function () {
			clearTimeout(timer)
			timer = setTimeout(function () {
				load(input.value.trim())
			}, DEBOUNCE_MS)
		})
	})
})()
