// The native chat, part 10: dialogs. Forward a message, make a poll, start a
// group and manage one.
;(function () {
	'use strict'

	var C = window.CAFE.chat
	var SEARCH_MS = 200

	// A person's chip, with a x to take it off.
	function chip(label, username, image, onRemove) {
		var node = C.el('span', 'cafe-c-chip')
		node.appendChild(C.avatar(image, label, 'xs'))
		node.appendChild(document.createTextNode(label))
		if (username) node.appendChild(C.el('span', 'cafe-c-chip-user', '@' + username))
		var remove = C.el('button', 'cafe-c-chip-x')
		remove.type = 'button'
		remove.setAttribute('aria-label', 'Remove ' + label)
		remove.appendChild(C.icon('x', 'cafe-c-tiny'))
		remove.addEventListener('click', onRemove)
		node.appendChild(remove)
		return node
	}

	// A row you can click, for a result list.
	function pick(label, username, image, onClick) {
		var row = C.el('button', 'cafe-c-pick')
		row.type = 'button'
		row.appendChild(C.avatar(image, label, 'sm'))
		var text = C.el('div', 'cafe-c-pick-text')
		text.appendChild(C.el('span', 'cafe-c-pick-name', label))
		if (username) text.appendChild(C.el('span', 'cafe-c-pick-user', '@' + username))
		row.appendChild(text)
		row.addEventListener('click', onClick)
		return row
	}

	function searchBox(placeholder, onInput) {
		var wrap = C.el('div', 'cafe-c-search dialog')
		wrap.appendChild(C.icon('search', 'cafe-c-search-icon'))
		var input = C.el('input')
		input.type = 'text'
		input.placeholder = placeholder
		input.setAttribute('aria-label', placeholder)
		input.autocomplete = 'off'
		input.addEventListener('input', onInput)
		wrap.appendChild(input)
		return { node: wrap, input: input }
	}

	// Search people, pick several. `exclude` are user ids to leave out.
	function peoplePicker(exclude, onChange) {
		var chosen = []
		var wrap = C.el('div', 'cafe-c-picker')
		var chips = C.el('div', 'cafe-c-chips')
		var results = C.el('div', 'cafe-c-results')
		results.hidden = true
		var timer = null
		var token = 0
		var box = searchBox('Search by name', function () {
			clearTimeout(timer)
			if (!box.input.value.trim()) {
				token++
				results.hidden = true
				return
			}
			timer = setTimeout(search, SEARCH_MS)
		})
		function drawChips() {
			chips.replaceChildren()
			chips.hidden = !chosen.length
			chosen.forEach(function (p) {
				chips.appendChild(
					chip(p.full_name, p.username, p.user_image, function () {
						chosen = chosen.filter(function (x) {
							return x.name !== p.name
						})
						drawChips()
						onChange()
					})
				)
			})
		}
		function search() {
			var mine = ++token
			results.hidden = false
			results.replaceChildren(C.el('p', 'cafe-c-results-note', 'Searching…'))
			C.fetch('search_people_to_message', { query: box.input.value.trim() }).then(
				function (rows) {
					if (mine !== token) return
					var taken = chosen
						.map(function (x) {
							return x.name
						})
						.concat(exclude || [])
					rows = (rows || []).filter(function (p) {
						return taken.indexOf(p.name) === -1
					})
					results.replaceChildren()
					if (!rows.length) results.appendChild(C.el('p', 'cafe-c-results-note', 'No people found.'))
					rows.forEach(function (p) {
						results.appendChild(
							pick(p.full_name, p.username, p.user_image, function () {
								chosen.push(p)
								box.input.value = ''
								results.hidden = true
								drawChips()
								onChange()
							})
						)
					})
				},
				function () {
					if (mine === token) results.replaceChildren(C.el('p', 'cafe-c-results-note', 'No people found.'))
				}
			)
		}
		drawChips()
		wrap.appendChild(chips)
		wrap.appendChild(box.node)
		wrap.appendChild(results)
		return {
			node: wrap,
			chosen: function () {
				return chosen
			},
			reset: function () {
				chosen = []
				drawChips()
			},
		}
	}

	function labelled(text, node) {
		var wrap = C.el('div', 'cafe-field grow')
		wrap.appendChild(C.el('label', '', text))
		wrap.appendChild(node)
		return wrap
	}

	function textInput(placeholder) {
		var input = C.el('input')
		input.type = 'text'
		input.placeholder = placeholder || ''
		return input
	}

	// ---- Forward ----
	C.forwardDialog = function (message) {
		var chosen = []
		var sending = false
		var body = C.el('div', 'cafe-c-forward')
		var chips = C.el('div', 'cafe-c-chips')
		var results = C.el('div', 'cafe-c-results tall')
		var people = []
		var timer = null
		var box = searchBox('Search by name', function () {
			clearTimeout(timer)
			timer = setTimeout(load, SEARCH_MS)
		})
		var dialog
		var sendButton

		function key(t) {
			return t.kind + ':' + t.id
		}
		function drawChips() {
			chips.replaceChildren()
			chips.hidden = !chosen.length
			chosen.forEach(function (t) {
				chips.appendChild(
					chip(t.label, t.username, t.image, function () {
						chosen = chosen.filter(function (x) {
							return key(x) !== key(t)
						})
						draw()
					})
				)
			})
			if (sendButton) {
				sendButton.textContent = chosen.length > 1 ? 'Send (' + chosen.length + ')' : 'Send'
				sendButton.disabled = !chosen.length
			}
		}
		function candidates() {
			var q = box.input.value.trim().toLowerCase()
			var convs = C.state.conversations || []
			var dms = {}
			convs.forEach(function (c) {
				if (c.other_user) dms[c.other_user] = true
			})
			var rows = convs
				.filter(function (c) {
					return c.conversation !== C.state.active && (!q || c.display_name.toLowerCase().indexOf(q) !== -1)
				})
				.map(function (c) {
					return { kind: 'conversation', id: c.conversation, label: c.display_name, image: c.display_image }
				})
			people
				.filter(function (p) {
					return !dms[p.name]
				})
				.forEach(function (p) {
					rows.push({
						kind: 'person',
						id: p.name,
						label: p.full_name,
						username: p.username,
						image: p.user_image,
					})
				})
			var taken = chosen.map(key)
			return rows.filter(function (r) {
				return taken.indexOf(key(r)) === -1
			})
		}
		function draw() {
			drawChips()
			results.replaceChildren()
			var rows = candidates()
			if (!rows.length) results.appendChild(C.el('p', 'cafe-c-results-note', 'No matches found.'))
			rows.forEach(function (r) {
				results.appendChild(
					pick(r.label, r.username, r.image, function () {
						chosen.push(r)
						box.input.value = ''
						load()
					})
				)
			})
		}
		function load() {
			C.fetch('search_people_to_message', { query: box.input.value.trim() }).then(
				function (rows) {
					people = rows || []
					draw()
				},
				function () {
					people = []
					draw()
				}
			)
		}
		function send() {
			if (sending || !chosen.length) return
			sending = true
			dialog.setBusy(true)
			chosen
				.reduce(function (chain, target) {
					return chain.then(function () {
						var conv =
							target.kind === 'person'
								? C.call('start_dm', { other_user: target.id }).then(function (d) {
										return d.conversation
								  })
								: Promise.resolve(target.id)
						return conv.then(function (id) {
							return C.call('forward_message', { message: message.name, conversation: id })
						})
					})
				}, Promise.resolve())
				.then(
					function () {
						CAFE.toast(
							chosen.length > 1 ? 'Message forwarded to ' + chosen.length + ' chats' : 'Message forwarded'
						)
						C.loadConversations()
						dialog.close()
					},
					function (error) {
						sending = false
						dialog.setBusy(false)
						drawChips()
						dialog.setError(error.message || 'Could not forward message')
					}
				)
		}

		body.appendChild(chips)
		body.appendChild(box.node)
		body.appendChild(results)
		dialog = CAFE.dialog({
			title: 'Forward message',
			body: body,
			wide: true,
			actions: [
				{
					label: 'Cancel',
					kind: 'outline',
					onClick: function (d) {
						d.close()
					},
				},
				{ label: 'Send', kind: 'solid', onClick: send },
			],
		})
		sendButton = dialog.root.querySelector('.cafe-btn-solid')
		draw()
		load()
	}

	// ---- Poll ----
	C.pollDialog = function () {
		var conversation = C.state.active
		var body = C.el('div', 'cafe-form')
		var question = C.el('textarea')
		question.rows = 2
		question.placeholder = 'What would you like to ask?'
		body.appendChild(labelled('Question', question))
		var optionsBox = C.el('div', 'cafe-c-poll-inputs')
		var inputs = []
		function addOption() {
			var row = C.el('div', 'cafe-c-poll-input')
			var input = textInput('Option ' + (inputs.length + 1))
			inputs.push(input)
			row.appendChild(input)
			optionsBox.appendChild(row)
			removable()
		}
		function removable() {
			Array.prototype.forEach.call(optionsBox.children, function (row, i) {
				var old = row.querySelector('button')
				if (old) old.remove()
				if (inputs.length > 2) {
					var x = C.el('button', 'cafe-c-icon-btn')
					x.type = 'button'
					x.setAttribute('aria-label', 'Remove option')
					x.appendChild(C.icon('x', 'cafe-c-tiny'))
					x.addEventListener('click', function () {
						inputs.splice(i, 1)
						row.remove()
						removable()
					})
					row.appendChild(x)
				}
			})
		}
		addOption()
		addOption()
		var optionsField = C.el('div', 'cafe-field grow')
		optionsField.appendChild(C.el('label', '', 'Options'))
		optionsField.appendChild(optionsBox)
		var add = C.el('button', 'cafe-btn cafe-btn-subtle cafe-c-add-option')
		add.type = 'button'
		add.appendChild(C.icon('plus', 'cafe-c-small'))
		add.appendChild(document.createTextNode('Add option'))
		add.addEventListener('click', addOption)
		optionsField.appendChild(add)
		body.appendChild(optionsField)

		function check(text) {
			var label = C.el('label', 'cafe-c-check')
			var box = C.el('input')
			box.type = 'checkbox'
			label.appendChild(box)
			label.appendChild(document.createTextNode(text))
			body.appendChild(label)
			return box
		}
		var multiple = check('Allow multiple answers')
		var anonymous = check('Anonymous votes')
		var closes = check('Close automatically')
		var closeAt = C.el('input')
		closeAt.type = 'datetime-local'
		closeAt.hidden = true
		closes.addEventListener('change', function () {
			closeAt.hidden = !closes.checked
		})
		body.appendChild(closeAt)

		CAFE.dialog({
			title: 'Create Poll',
			body: body,
			wide: true,
			actions: [
				{
					label: 'Cancel',
					kind: 'outline',
					onClick: function (d) {
						d.close()
					},
				},
				{
					label: 'Create poll',
					kind: 'solid',
					onClick: function (d) {
						var options = inputs
							.map(function (i) {
								return i.value.trim()
							})
							.filter(Boolean)
						if (!question.value.trim() || options.length < 2) {
							d.setError('Add a question and at least two options.')
							return
						}
						d.setError('')
						d.setBusy(true)
						C.call('create_poll', {
							conversation: conversation,
							question: question.value.trim(),
							options: options,
							allow_multiple: multiple.checked ? 1 : 0,
							anonymous: anonymous.checked ? 1 : 0,
							close_at: closes.checked && closeAt.value ? closeAt.value : null,
						}).then(
							function (msg) {
								d.close()
								if (conversation === C.state.active) C.addMessage(msg)
								C.loadConversations()
							},
							function (error) {
								d.setBusy(false)
								d.setError(error.message)
							}
						)
					},
				},
			],
		})
	}

	// ---- New group ----
	C.newGroupDialog = function () {
		var name = textInput('e.g. Design Team')
		var body = C.el('div', 'cafe-form')
		body.appendChild(labelled('Group name', name))
		var picker = peoplePicker([], function () {})
		var membersField = C.el('div', 'cafe-field grow')
		membersField.appendChild(C.el('label', '', 'Members'))
		membersField.appendChild(
			C.el('p', 'cafe-c-hint', "They'll get an invite to join — added once they accept, not immediately.")
		)
		membersField.appendChild(picker.node)
		body.appendChild(membersField)
		CAFE.dialog({
			title: 'New group',
			body: body,
			wide: true,
			actions: [
				{
					label: 'Cancel',
					kind: 'outline',
					onClick: function (d) {
						d.close()
					},
				},
				{
					label: 'Create group',
					kind: 'solid',
					onClick: function (d) {
						if (!name.value.trim() || !picker.chosen().length) {
							d.setError('Add a name and at least one member.')
							return
						}
						d.setError('')
						d.setBusy(true)
						C.call('create_group', {
							title: name.value.trim(),
							members: picker.chosen().map(function (p) {
								return p.name
							}),
						}).then(
							function (data) {
								d.close()
								C.loadConversations()
								C.open(data.conversation)
							},
							function (error) {
								d.setBusy(false)
								d.setError(error.message)
							}
						)
					},
				},
			],
		})
	}

	// ---- Group info ----
	C.groupInfo = function () {
		var id = C.state.active
		var title = C.state.conversation.display_name
		var body = C.el('div', 'cafe-c-group')
		var dialog
		var data = null

		function act(method, args, then) {
			C.call(method, args).then(
				function () {
					if (then) then()
					reload()
				},
				function (error) {
					CAFE.toast(error.message, 'error')
				}
			)
		}

		function section(label) {
			var wrap = C.el('div', 'cafe-field grow')
			wrap.appendChild(C.el('label', '', label))
			return wrap
		}

		function memberRow(m) {
			var row = C.el('div', 'cafe-c-member')
			row.appendChild(C.avatar(m.user_image, m.full_name, 'md'))
			var text = C.el('div', 'cafe-c-member-text')
			text.appendChild(C.el('span', 'cafe-c-member-name', m.full_name))
			if (m.is_admin) text.appendChild(C.el('span', 'cafe-c-badge', 'Admin'))
			if (m.user === C.me) text.appendChild(C.el('span', 'cafe-c-badge', 'You'))
			row.appendChild(text)
			if (data.my_is_admin && m.user !== C.me) {
				var more = C.el('button', 'cafe-c-icon-btn')
				more.type = 'button'
				more.setAttribute('aria-label', 'Member options')
				more.appendChild(C.icon('ellipsis', 'cafe-c-small'))
				more.addEventListener('click', function () {
					C.menu(
						more,
						[
							m.is_admin
								? {
										label: 'Remove as admin',
										icon: 'shield-off',
										onClick: function () {
											act('set_group_admin', { conversation: id, user: m.user, is_admin: 0 })
										},
								  }
								: {
										label: 'Make admin',
										icon: 'shield',
										onClick: function () {
											act('set_group_admin', { conversation: id, user: m.user, is_admin: 1 })
										},
								  },
							{
								label: 'Remove from group',
								icon: 'user-minus',
								danger: true,
								onClick: function () {
									CAFE.confirm({
										title: 'Remove this member?',
										message: m.full_name + ' will be removed from the group.',
										confirmLabel: 'Remove',
										danger: true,
									}).then(function (ok) {
										if (ok) act('remove_group_member', { conversation: id, user: m.user })
									})
								},
							},
						],
						'left'
					)
				})
				row.appendChild(more)
			}
			return row
		}

		function draw() {
			body.replaceChildren()
			var members = data.members || []
			if (data.my_is_admin) {
				var nameBox = textInput('')
				nameBox.value = title
				var rename = function () {
					var value = nameBox.value.trim()
					if (!value || value === title) return
					C.call('rename_group', { conversation: id, title: value }).then(
						function () {
							title = value
							C.reloadConversation()
							C.loadConversations()
						},
						function (e) {
							CAFE.toast(e.message, 'error')
						}
					)
				}
				nameBox.addEventListener('blur', rename)
				nameBox.addEventListener('keydown', function (e) {
					if (e.key === 'Enter') rename()
				})
				body.appendChild(labelled('Group name', nameBox))
				var add = section('Add people')
				var picker = peoplePicker(
					members.map(function (m) {
						return m.user
					}),
					function () {
						invite.hidden = !picker.chosen().length
					}
				)
				add.appendChild(picker.node)
				var invite = C.el('button', 'cafe-btn cafe-btn-outline', 'Send invite')
				invite.type = 'button'
				invite.hidden = true
				invite.addEventListener('click', function () {
					var people = picker.chosen()
					invite.disabled = true
					people
						.reduce(function (chain, p) {
							return chain.then(function () {
								return C.call('invite_to_group', { conversation: id, user: p.name })
							})
						}, Promise.resolve())
						.then(
							function () {
								CAFE.toast(people.length > 1 ? 'Invites sent' : 'Invite sent')
								reload()
							},
							function (e) {
								invite.disabled = false
								CAFE.toast(e.message, 'error')
							}
						)
				})
				add.appendChild(invite)
				body.appendChild(add)
			} else {
				var plain = section('Group name')
				plain.appendChild(C.el('p', 'cafe-c-group-title', title))
				body.appendChild(plain)
			}
			var list = section('Members — ' + members.length)
			var rows = C.el('div', 'cafe-c-members')
			members.forEach(function (m) {
				rows.appendChild(memberRow(m))
			})
			list.appendChild(rows)
			body.appendChild(list)
			if (data.my_is_admin && data.pending_invites && data.pending_invites.length) {
				var pending = section('Pending invites')
				var box = C.el('div', 'cafe-c-members')
				data.pending_invites.forEach(function (p) {
					var row = C.el('div', 'cafe-c-member')
					row.appendChild(C.avatar(p.user_image, p.full_name, 'md'))
					row.appendChild(C.el('span', 'cafe-c-member-name grow', p.full_name))
					var cancel = C.el('button', 'cafe-btn cafe-btn-subtle', 'Cancel')
					cancel.type = 'button'
					cancel.addEventListener('click', function () {
						act('cancel_group_invite', { name: p.name })
					})
					row.appendChild(cancel)
					box.appendChild(row)
				})
				pending.appendChild(box)
				body.appendChild(pending)
			}
		}

		function reload() {
			C.fetch('list_group_members', { conversation: id }).then(
				function (result) {
					data = result
					draw()
				},
				function (e) {
					CAFE.toast(e.message, 'error')
				}
			)
		}

		dialog = CAFE.dialog({
			title: 'Group info',
			body: body,
			wide: true,
			actions: [
				{
					label: 'Leave group',
					kind: 'danger',
					left: true,
					onClick: function () {
						CAFE.confirm({
							title: 'Leave this group?',
							message: 'You can only rejoin if someone invites you again.',
							confirmLabel: 'Leave',
							danger: true,
						}).then(function (ok) {
							if (!ok) return
							C.call('leave_group', { conversation: id }).then(
								function () {
									dialog.close()
									C.loadConversations()
									C.open(null, true)
								},
								function (e) {
									CAFE.toast(e.message, 'error')
								}
							)
						})
					},
				},
				{
					label: 'Close',
					kind: 'subtle',
					onClick: function (d) {
						d.close()
					},
				},
			],
		})
		reload()
	}
})()
