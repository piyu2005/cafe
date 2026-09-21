// Publications, part 4: /invite?pub=<handle>: find someone and invite them to
// a publication as a member or an editor.
;(function () {
	'use strict'

	var P = window.MNA.pub
	var MNA = window.MNA
	var DEBOUNCE_MS = 200
	var handle
	var title = 'Publication'
	var box
	var input
	var results
	var heading
	var people = null
	var taken = {} // users who are already in, or already invited
	var selected = null
	var role = 'Member'
	var timer = null
	var token = 0

	function pick(person) {
		selected = person
		role = 'Member'
		draw()
	}

	function send(person, button) {
		button.disabled = true
		P.call('invite_to_publication', { publication: handle, user: person.name, role: role }).then(
			function () {
				MNA.toast('Invitation sent')
				taken[person.name] = true
				selected = null
				input.value = ''
				loadPeople()
				loadTaken()
			},
			function (error) {
				button.disabled = false
				P.errorToast(error)
			}
		)
	}

	function row(person) {
		var button = P.el('button', 'mna-p-person')
		button.type = 'button'
		button.appendChild(P.avatar(person.user_image, person.full_name, 'md'))
		var text = P.el('div', 'mna-p-person-text')
		text.appendChild(P.el('span', 'mna-p-person-name', person.full_name))
		if (person.username) text.appendChild(P.el('span', 'mna-p-person-user', '@' + person.username))
		button.appendChild(text)
		button.addEventListener('click', function () {
			pick(person)
		})
		return button
	}

	function selectedCard(person) {
		var card = P.el('div', 'mna-p-selected')
		var top = P.el('div', 'mna-p-selected-top')
		top.appendChild(P.avatar(person.user_image, person.full_name, 'md'))
		var text = P.el('div', 'mna-p-person-text')
		text.appendChild(P.el('div', 'mna-p-selected-name', person.full_name))
		if (person.username) text.appendChild(P.el('div', 'mna-p-person-user', '@' + person.username))
		top.appendChild(text)
		top.appendChild(P.icon('check', 'mna-p-small'))
		var clear = P.el('button', 'mna-p-x')
		clear.type = 'button'
		clear.setAttribute('aria-label', 'Deselect')
		clear.appendChild(P.icon('x', 'mna-p-tiny'))
		clear.addEventListener('click', function () {
			selected = null
			draw()
		})
		top.appendChild(clear)
		card.appendChild(top)
		var field = P.el('div', 'mna-field grow')
		field.appendChild(P.el('label', '', 'Select Role'))
		var select = P.el('select')
		;['Member', 'Editor'].forEach(function (name) {
			var option = P.el('option', '', name)
			option.value = name
			select.appendChild(option)
		})
		select.value = role
		select.addEventListener('change', function () {
			role = select.value
		})
		field.appendChild(select)
		card.appendChild(field)
		var go = P.el('button', 'mna-btn mna-btn-solid mna-p-send', 'Send invitation')
		go.type = 'button'
		go.addEventListener('click', function () {
			send(person, go)
		})
		card.appendChild(go)
		return card
	}

	function draw() {
		results.replaceChildren()
		if (people === null) {
			results.appendChild(P.skeleton(4))
			return
		}
		var shown = people.filter(function (p) {
			return !taken[p.name]
		})
		if (!shown.length) {
			results.appendChild(P.el('p', 'mna-p-empty', 'No people found.'))
			return
		}
		shown.forEach(function (p) {
			results.appendChild(selected && selected.name === p.name ? selectedCard(p) : row(p))
		})
	}

	function loadPeople() {
		var mine = ++token
		MNA.get('cafe.chat.search_people_to_message', { query: input.value.trim() }).then(
			function (rows) {
				if (mine !== token) return
				people = rows || []
				draw()
			},
			function () {
				if (mine === token) {
					people = []
					draw()
				}
			}
		)
	}

	// People already in, or already invited, are left out of the results.
	function loadTaken() {
		return P.get('list_publication_members', { publication: handle }).then(
			function (data) {
				taken = {}
				data.editors.concat(data.members).forEach(function (m) {
					taken[m.user] = true
				})
				data.pending_invites.forEach(function (p) {
					taken[p.invited_user] = true
				})
				draw()
			},
			function () {}
		)
	}

	document.addEventListener('DOMContentLoaded', function () {
		box = document.getElementById('mna-invite')
		if (!box) return
		handle = new URLSearchParams(location.search).get('pub') || box.getAttribute('data-handle') || ''
		heading = document.getElementById('mna-p-invite-title')
		var back = document.querySelector('.mna-mobile-back')
		if (back) back.setAttribute('href', '/publications/' + encodeURIComponent(handle))
		var search = P.el('div', 'mna-p-search')
		search.appendChild(P.icon('search', 'mna-p-search-icon'))
		input = P.el('input')
		input.type = 'text'
		input.placeholder = 'Search'
		input.setAttribute('aria-label', 'Search people')
		input.autocomplete = 'off'
		input.addEventListener('input', function () {
			clearTimeout(timer)
			timer = setTimeout(function () {
				people = null
				draw()
				loadPeople()
			}, DEBOUNCE_MS)
		})
		search.appendChild(input)
		results = P.el('div', 'mna-p-results')
		box.replaceChildren(search, results)
		input.focus()
		draw()
		loadPeople()
		loadTaken()
		P.get('get_publication', { handle: handle }).then(
			function (pub) {
				title = pub.title
				if (heading) heading.textContent = 'Invite people to ' + title
				var crumb = document.getElementById('mna-p-crumb-pub')
				if (crumb) {
					crumb.textContent = title
					crumb.setAttribute('href', '/publications/' + encodeURIComponent(handle))
				}
			},
			function () {}
		)
	})
})()
