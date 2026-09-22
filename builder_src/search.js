// Search page: filters the writers as you type. The first list is rendered by
// the server (the page's data script), so this only fetches when the query
// changes, or if the server sent no rows. Same API and result rows as the old
// SearchPeople page.
;(function () {
	'use strict'

	var DEBOUNCE_MS = 200

	var input, list
	var latestRequest = 0
	var timer = null

	function el(tag, className, text) {
		var node = document.createElement(tag)
		if (className) node.className = className
		if (text) node.textContent = text
		return node
	}

	function avatar(person) {
		var box = el('span', 'cafe-avatar')
		if (person.user_image) {
			var img = el('img')
			img.src = person.user_image
			img.alt = ''
			box.appendChild(img)
		} else {
			box.textContent = (person.full_name || person.name || '?').trim().charAt(0)
		}
		return box
	}

	function renderPeople(people) {
		list.replaceChildren()
		if (!people.length) {
			list.appendChild(el('p', 'cafe-empty', 'No writers found.'))
			return
		}
		people.forEach(function (person) {
			var row = el('a', 'cafe-person')
			row.href = '/profile/' + encodeURIComponent(person.username || person.name)
			row.appendChild(avatar(person))
			row.appendChild(el('span', 'cafe-person-name', person.full_name || person.name))
			list.appendChild(row)
		})
	}

	function load(query) {
		var request = ++latestRequest
		// Built from location.origin, not a relative URL: Builder's editor Preview adds a
		// <base href> (from the site's host_name) that can point at another origin.
		var url = location.origin + '/api/v2/method/cafe.api.list_people?query=' + encodeURIComponent(query)
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
				renderPeople(body.data || [])
			})
			.catch(function () {
				if (request !== latestRequest) return
				list.replaceChildren(el('p', 'cafe-empty', "Couldn't load writers. Please try again."))
			})
	}

	document.addEventListener('DOMContentLoaded', function () {
		input = document.getElementById('cafe-search-input')
		list = document.getElementById('cafe-people')
		if (!input || !list) return

		if (!list.querySelector('.cafe-person')) load('')
		input.focus()
		input.addEventListener('input', function () {
			clearTimeout(timer)
			timer = setTimeout(function () {
				load(input.value.trim())
			}, DEBOUNCE_MS)
		})
	})
})()
