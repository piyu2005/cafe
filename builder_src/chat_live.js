// The native chat, part 9: things that arrive without you asking, over the
// page's live connection, and putting the chat on screen. Load this last.
;(function () {
	'use strict'

	var C = window.MNA.chat
	var TYPING_SHOWN_MS = 3000
	var typingTimer = null

	function find(name) {
		var list = C.state.messages
		for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i]
		return null
	}

	function here(payload) {
		return payload.conversation === C.state.active
	}

	var HANDLERS = {
		'chat:new_message': function (payload) {
			C.loadConversations()
			C.loadRequests()
			if (!here(payload)) return
			if (find(payload.name)) return
			C.addMessage(payload)
			C.call('mark_read', { conversation: C.state.active }).then(
				function () {
					C.loadConversations()
					if (window.MNA.refreshBadges) window.MNA.refreshBadges()
				},
				function () {}
			)
		},
		'chat:typing': function (payload) {
			if (!here(payload)) return
			C.setTyping(true)
			clearTimeout(typingTimer)
			typingTimer = setTimeout(function () {
				C.setTyping(false)
			}, TYPING_SHOWN_MS)
		},
		'chat:read': function (payload) {
			if (!here(payload) || !C.state.conversation) return
			C.state.conversation.other_last_read = new Date().toISOString()
			C.renderMessages()
		},
		'chat:reaction': function (payload) {
			var m = find(payload.message)
			if (m) {
				m.reactions = payload.reactions
				C.renderMessages()
			}
		},
		'chat:poll_update': function (payload) {
			var m = find(payload.message)
			if (m) {
				m.poll_data = payload.poll_data
				C.renderMessages()
			}
		},
		'chat:message_edited': function (payload) {
			var m = find(payload.message)
			if (m) {
				m.content = payload.content
				m.is_edited = payload.is_edited
				C.renderMessages()
			}
		},
		'chat:message_deleted': function (payload) {
			C.markDeleted(payload.message)
			C.loadConversations()
		},
	}

	function connect() {
		window.MNA.onSocket(function (socket) {
			Object.keys(HANDLERS).forEach(function (name) {
				socket.on(name, HANDLERS[name])
			})
		})
	}

	// ---- Start ----
	document.addEventListener('DOMContentLoaded', function () {
		var root = document.getElementById('mna-chat')
		if (!root) return
		var id = C.idFromAddress() || root.getAttribute('data-conversation') || null
		// The still picture the editor shows goes; the real chat takes its place.
		var list = C.el('div', 'mna-c-list')
		var thread = C.el('div', 'mna-c-thread')
		root.replaceChildren(list, thread)
		root.classList.add('ready')
		C.buildList(list)
		C.buildThread(root, thread)
		C.buildComposer(C.dom.composerHost)
		;['mna-new-group', 'mna-new-group-m'].forEach(function (name) {
			var button = document.getElementById(name)
			if (button) button.addEventListener('click', C.newGroupDialog)
		})
		connect()
		C.loadConversations()
		C.loadRequests()
		C.emit('open', id)
	})
})()
