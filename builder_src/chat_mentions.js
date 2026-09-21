// The native chat, part 11: typing @ in the composer offers the people you
// can mention.
;(function () {
	'use strict'

	var C = window.MNA.chat
	var MAX_SHOWN = 8
	var users = []
	var popup = null
	var matches = []
	var chosen = 0
	var range = null

	C.mentionOpen = function () {
		return !!popup
	}

	function candidates() {
		var list = users.map(function (u) {
			return {
				id: u.name,
				label: u.username || u.full_name || u.name,
				full_name: u.full_name,
				email: u.name,
				image: u.user_image,
			}
		})
		var conversation = C.state.conversation
		if (conversation && conversation.is_group)
			list.unshift({ id: 'all', label: 'all', full_name: 'Everyone in this group', email: '' })
		return list
	}

	function close() {
		if (popup) {
			popup.remove()
			popup = null
		}
		range = null
	}

	function insert(item) {
		var editor = C.editor()
		editor
			.chain()
			.focus()
			.insertContentAt({ from: range.from, to: range.to }, [
				{ type: 'mention', attrs: { id: item.id, label: item.label } },
				{ type: 'text', text: ' ' },
			])
			.run()
		close()
	}

	function draw() {
		popup.replaceChildren()
		matches.forEach(function (item, i) {
			var row = C.el('button', 'mna-c-mention' + (i === chosen ? ' on' : ''))
			row.type = 'button'
			row.appendChild(C.el('span', 'mna-c-mention-label', '@' + item.label))
			if (item.full_name && item.full_name !== item.label)
				row.appendChild(C.el('span', 'mna-c-mention-name', item.full_name))
			// mousedown, so the editor keeps its selection.
			row.addEventListener('mousedown', function (event) {
				event.preventDefault()
				insert(item)
			})
			popup.appendChild(row)
		})
	}

	function place() {
		var box = C.dom.composerHost.getBoundingClientRect()
		popup.style.left = box.left + 12 + 'px'
		popup.style.top = Math.max(8, box.top - popup.offsetHeight - 8) + 'px'
	}

	function update(editor) {
		var selection = editor.state.selection
		if (!selection.empty) {
			close()
			return
		}
		var end = selection.from
		var before = editor.state.doc.textBetween(Math.max(0, end - 40), end, '\n', '￼')
		var found = /(^|\s)@([\w.\-]*)$/.exec(before)
		if (!found) {
			close()
			return
		}
		var query = found[2].toLowerCase()
		matches = candidates()
			.filter(function (u) {
				return (
					!query ||
					u.label.toLowerCase().indexOf(query) !== -1 ||
					(u.full_name || '').toLowerCase().indexOf(query) !== -1
				)
			})
			.slice(0, MAX_SHOWN)
		if (!matches.length) {
			close()
			return
		}
		range = { from: end - query.length - 1, to: end }
		chosen = 0
		if (!popup) {
			popup = C.el('div', 'mna-c-mentions')
			document.body.appendChild(popup)
		}
		draw()
		place()
	}

	function onKey(event) {
		if (!popup) return
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault()
			event.stopPropagation()
			chosen = (chosen + (event.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length
			draw()
		} else if (event.key === 'Enter' || event.key === 'Tab') {
			event.preventDefault()
			event.stopPropagation()
			insert(matches[chosen])
		} else if (event.key === 'Escape') {
			event.stopPropagation()
			close()
		}
	}

	C.on('composer-input', update)
	C.on('thread-ready', function () {
		users = []
		C.fetch('list_mentionable_users', { conversation: C.state.active }).then(
			function (rows) {
				users = rows || []
			},
			function () {}
		)
		// Capture, so the arrows and Enter reach here before the composer's own keys.
		var host = C.dom.composerHost
		if (!host.__mentionKeys) {
			host.addEventListener('keydown', onKey, true)
			host.__mentionKeys = true
		}
	})
	C.on('open', close)
	document.addEventListener('mousedown', function (event) {
		if (popup && !popup.contains(event.target)) close()
	})
})()
