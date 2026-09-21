// The native chat, part 7: what you can do to a message you see.
;(function () {
	'use strict'

	var C = window.MNA.chat
	var HIGHLIGHT_MS = 1500
	var MORE_HISTORY = 200

	function find(name) {
		var list = C.state.messages
		for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i]
		return null
	}

	// ---- Reactions ----

	// The same change the server will make, shown before it answers.
	function toggled(reactions, emoji) {
		var existing = reactions.filter(function (r) {
			return r.emoji === emoji
		})[0]
		if (existing && existing.reacted_by_me) {
			if (existing.count <= 1)
				return reactions.filter(function (r) {
					return r.emoji !== emoji
				})
			return reactions.map(function (r) {
				return r.emoji === emoji ? Object.assign({}, r, { count: r.count - 1, reacted_by_me: false }) : r
			})
		}
		if (existing)
			return reactions.map(function (r) {
				return r.emoji === emoji ? Object.assign({}, r, { count: r.count + 1, reacted_by_me: true }) : r
			})
		return reactions.concat([{ emoji: emoji, count: 1, reacted_by_me: true }])
	}

	C.react = function (m, emoji) {
		var target = find(m.name)
		if (!target) return
		var before = target.reactions
		target.reactions = toggled(before, emoji)
		C.renderMessages()
		C.call('toggle_reaction', { message: target.name, emoji: emoji }).then(
			function (result) {
				target.reactions = result || before
				C.renderMessages()
			},
			function (error) {
				target.reactions = before
				C.renderMessages()
				C.errorToast(error)
			}
		)
	}

	C.pickReaction = function (m, anchor) {
		C.emojiPicker(anchor, function (emoji) {
			C.react(m, emoji)
		})
	}

	// ---- The ... menu ----

	C.messageMenu = function (m, anchor) {
		var own = m.sender === C.me
		var items = [
			{
				label: 'Forward',
				icon: 'forward',
				onClick: function () {
					if (C.forwardDialog) C.forwardDialog(m)
				},
			},
		]
		if (own) {
			items.push({
				label: 'Edit',
				icon: 'pencil',
				onClick: function () {
					C.startEdit(m)
				},
			})
			items.push({
				label: 'Delete',
				icon: 'trash-2',
				onClick: function () {
					confirmDelete(m)
				},
			})
		}
		C.menu(anchor, items, own ? 'right' : 'left')
	}

	function confirmDelete(m) {
		MNA.confirm({
			title: 'Delete message?',
			message: "This can't be undone. This message will be removed for everyone in this conversation.",
			confirmLabel: 'Delete',
			danger: true,
		}).then(function (ok) {
			if (!ok) return
			C.call('delete_message', { message: m.name }).then(function () {
				C.markDeleted(m.name)
				C.loadConversations()
			}, C.errorToast)
		})
	}

	C.markDeleted = function (name) {
		var target = find(name)
		if (!target) return
		Object.assign(target, {
			is_deleted: 1,
			content: null,
			attachments: [],
			shared_post: null,
			poll: null,
			poll_data: null,
			link_url: null,
			link_title: null,
			link_description: null,
			link_image: null,
			reactions: [],
		})
		if (C.state.editing && C.state.editing.name === name) C.cancelEdit()
		C.renderMessages()
	}

	// ---- Jumping to a message (a reply's quote, a search hit) ----

	C.jumpTo = function (name) {
		var box = C.dom.list
		function show() {
			var row = box.querySelector('[data-message-id="' + name + '"]')
			if (!row) return false
			row.scrollIntoView({ behavior: 'smooth', block: 'center' })
			row.classList.add('flash')
			setTimeout(function () {
				row.classList.remove('flash')
			}, HIGHLIGHT_MS)
			return true
		}
		if (show()) return
		// An older message: load more history once and look again.
		var id = C.state.active
		C.fetch('get_messages', { conversation: id, limit: C.state.messages.length + MORE_HISTORY }).then(
			function (rows) {
				if (id !== C.state.active) return
				C.state.messages = rows || []
				C.renderMessages()
				if (!show()) MNA.toast("Couldn't find that message", 'error')
			},
			function () {
				MNA.toast("Couldn't find that message", 'error')
			}
		)
	}

	// ---- Polls ----

	function withVote(data, optionName) {
		var clicked = data.options.filter(function (o) {
			return o.name === optionName
		})[0]
		if (!clicked) return data
		var was = clicked.voted_by_me
		var previous = data.allow_multiple
			? null
			: data.options.filter(function (o) {
					return o.name !== optionName && o.voted_by_me
			  })[0]
		var delta = 0
		var options = data.options.map(function (o) {
			if (o.name === optionName) {
				delta += was ? -1 : 1
				return Object.assign({}, o, { voted_by_me: !was, vote_count: o.vote_count + (was ? -1 : 1) })
			}
			if (previous && o.name === previous.name) {
				delta -= 1
				return Object.assign({}, o, { voted_by_me: false, vote_count: Math.max(0, o.vote_count - 1) })
			}
			return o
		})
		return Object.assign({}, data, { options: options, total_votes: data.total_votes + delta })
	}

	C.votePoll = function (m, option) {
		var target = find(m.name)
		if (!target || !target.poll_data || target.poll_data.is_closed) return
		var before = target.poll_data
		target.poll_data = withVote(before, option.name)
		C.renderMessages()
		C.call('toggle_poll_vote', { option: option.name }).then(
			function (result) {
				target.poll_data = result || before
				C.renderMessages()
			},
			function (error) {
				target.poll_data = before
				C.renderMessages()
				C.errorToast(error)
			}
		)
	}
})()
