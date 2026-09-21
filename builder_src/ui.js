// Shared helpers for the Builder pages: API calls, toast, confirm dialog and
// form dialog. They are on `window.MNA`. Load this script before the others.
// Everything that needs the page data or the CSRF token runs inside a call,
// never at load, because Builder sets those up after client scripts run.
;(function () {
	'use strict'

	var MNA = (window.MNA = window.MNA || {})

	function el(tag, className, text) {
		var node = document.createElement(tag)
		if (className) node.className = className
		if (text) node.textContent = text
		return node
	}
	MNA.el = el

	// ---- API ----

	MNA.DEFAULT_ERROR = 'Something went wrong. Please try again.'

	function errorText(body) {
		if (!body) return ''
		if (body.errors && body.errors[0] && body.errors[0].message) return String(body.errors[0].message)
		if (body._server_messages) {
			try {
				var first = JSON.parse(JSON.parse(body._server_messages)[0])
				if (first && first.message) return String(first.message).replace(/<[^>]+>/g, '')
			} catch (e) {
				/* not a JSON message */
			}
		}
		return ''
	}

	// Calls a whitelisted method with a JSON body. Resolves with the method's
	// return value, or rejects with an Error whose message is safe to show.
	MNA.api = function (method, args) {
		return fetch(location.origin + '/api/v2/method/' + method, {
			method: 'POST',
			credentials: 'same-origin',
			headers: {
				'Content-Type': 'application/json',
				'X-Frappe-CSRF-Token': (window.frappe && window.frappe.csrf_token) || '',
			},
			body: JSON.stringify(args || {}),
		}).then(function (response) {
			return response
				.json()
				.catch(function () {
					return {}
				})
				.then(function (body) {
					if (!response.ok) throw new Error(errorText(body) || MNA.DEFAULT_ERROR)
					return body.data
				})
		})
	}

	// Any /api/v2 call with a verb: MNA.request('PUT', '/api/v2/document/Post/abc', { title: 'x' }).
	// Resolves with `data`; rejects with an Error whose message is safe to show.
	MNA.request = function (verb, path, body) {
		return fetch(location.origin + path, {
			method: verb,
			credentials: 'same-origin',
			headers: {
				'Content-Type': 'application/json',
				'X-Frappe-CSRF-Token': (window.frappe && window.frappe.csrf_token) || '',
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		}).then(function (response) {
			return response
				.json()
				.catch(function () {
					return {}
				})
				.then(function (result) {
					if (!response.ok) throw new Error(errorText(result) || MNA.DEFAULT_ERROR)
					return result.data
				})
		})
	}

	MNA.get = function (method, params) {
		var query = Object.keys(params || {})
			.map(function (key) {
				return encodeURIComponent(key) + '=' + encodeURIComponent(params[key])
			})
			.join('&')
		return fetch(location.origin + '/api/v2/method/' + method + (query ? '?' + query : ''), {
			credentials: 'same-origin',
		})
			.then(function (response) {
				if (!response.ok) throw new Error('HTTP ' + response.status)
				return response.json()
			})
			.then(function (body) {
				return body.data
			})
	}

	// ---- Toast ----

	// Messages stack in the bottom right corner, newest at the bottom, like Frappe's own apps.
	var toastBox = null
	MNA.toast = function (text) {
		if (!toastBox || !toastBox.isConnected) {
			toastBox = el('div', 'mna-toasts')
			document.body.appendChild(toastBox)
		}
		var toast = el('div', 'mna-toast', text)
		toast.setAttribute('role', 'status')
		toastBox.appendChild(toast)
		setTimeout(function () {
			toast.classList.add('leaving')
		}, 2200)
		setTimeout(function () {
			toast.remove()
		}, 2600)
	}

	// ---- Dialog ----

	// Opens a dialog. `actions` is a list of { label, kind, onClick, left }, where
	// kind is 'solid', 'subtle' or 'danger'. Returns { root, close, setError, setBusy }.
	MNA.dialog = function (options) {
		var overlay = el('div', 'mna-overlay')
		var dialog = el('div', 'mna-dialog' + (options.wide ? ' wide' : ''))
		dialog.setAttribute('role', 'dialog')
		dialog.setAttribute('aria-modal', 'true')
		dialog.appendChild(el('h2', '', options.title))
		var closeButton = el('button', 'mna-dialog-close')
		closeButton.type = 'button'
		closeButton.setAttribute('aria-label', 'Close')
		closeButton.innerHTML =
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'
		closeButton.addEventListener('click', function () {
			close()
		})
		dialog.appendChild(closeButton)
		if (options.message) dialog.appendChild(el('p', '', options.message))
		if (options.body) dialog.appendChild(options.body)

		var error = el('p', 'mna-form-error')
		error.hidden = true
		dialog.appendChild(error)

		var actions = el('div', 'mna-dialog-actions')
		var buttons = []
		var left = el('div', 'mna-dialog-left')
		var right = el('div', 'mna-dialog-right')
		;(options.actions || []).forEach(function (action) {
			var button = el('button', 'mna-btn mna-btn-' + (action.kind || 'subtle'), action.label)
			button.type = 'button'
			button.addEventListener('click', function () {
				action.onClick(api)
			})
			buttons.push(button)
			;(action.left ? left : right).appendChild(button)
		})
		actions.appendChild(left)
		actions.appendChild(right)
		dialog.appendChild(actions)
		overlay.appendChild(dialog)
		document.body.appendChild(overlay)

		function close() {
			overlay.remove()
			document.removeEventListener('keydown', onKey)
			if (options.onClose) options.onClose()
		}
		function onKey(e) {
			// Only the top-most dialog reacts, so Escape on a confirm leaves the form open.
			var stack = document.querySelectorAll('.mna-overlay')
			if (e.key === 'Escape' && stack[stack.length - 1] === overlay) close()
		}
		document.addEventListener('keydown', onKey)
		overlay.addEventListener('mousedown', function (e) {
			if (e.target === overlay) close()
		})

		var api = {
			root: dialog,
			close: close,
			setError: function (text) {
				error.textContent = text || ''
				error.hidden = !text
			},
			setBusy: function (busy) {
				buttons.forEach(function (button) {
					button.disabled = busy
				})
			},
		}
		// Focus the dialog itself, not its first field: like the old dialogs, no
		// field shows a focus ring until you Tab to it, and Escape still works.
		dialog.tabIndex = -1
		dialog.focus({ preventScroll: true })
		return api
	}

	// Resolves true if the person confirms.
	MNA.confirm = function (options) {
		return new Promise(function (resolve) {
			var settled = false
			function finish(value, dialog) {
				settled = true
				resolve(value)
				dialog.close()
			}
			MNA.dialog({
				title: options.title,
				message: options.message,
				onClose: function () {
					if (!settled) resolve(false)
				},
				actions: [
					{
						label: 'Cancel',
						kind: 'outline',
						onClick: function (d) {
							finish(false, d)
						},
					},
					{
						label: options.confirmLabel || 'Confirm',
						kind: options.danger ? 'danger' : 'solid',
						onClick: function (d) {
							finish(true, d)
						},
					},
				],
			})
		})
	}

	// ---- Pop-up menu ----

	var popup = null
	function closePopup() {
		if (popup) {
			popup.remove()
			popup = null
		}
	}
	document.addEventListener('mousedown', function (event) {
		if (popup && !popup.contains(event.target) && !event.target.closest('[data-popup-anchor]')) closePopup()
	})
	document.addEventListener('keydown', function (event) {
		if (event.key === 'Escape') closePopup()
	})

	// A small menu under `anchor`. items: { label, onClick, danger, icon (svg markup) }. A second
	// call on the same anchor closes it.
	MNA.popupMenu = function (anchor, items) {
		var wasOpen = popup && anchor.hasAttribute('data-popup-open')
		closePopup()
		document.querySelectorAll('[data-popup-open]').forEach(function (node) {
			node.removeAttribute('data-popup-open')
		})
		if (wasOpen) return
		var menu = el('div', 'mna-popup')
		anchor.setAttribute('data-popup-anchor', '')
		anchor.setAttribute('data-popup-open', '')
		items.forEach(function (item) {
			var button = el('button', 'mna-popup-item' + (item.danger ? ' danger' : ''))
			button.type = 'button'
			if (item.icon) {
				var icon = el('span', 'mna-popup-icon')
				icon.innerHTML = item.icon
				button.appendChild(icon)
			}
			button.appendChild(el('span', '', item.label))
			button.addEventListener('click', function () {
				closePopup()
				anchor.removeAttribute('data-popup-open')
				item.onClick()
			})
			menu.appendChild(button)
		})
		document.body.appendChild(menu)
		var rect = anchor.getBoundingClientRect()
		var width = menu.offsetWidth
		menu.style.left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)) + 'px'
		menu.style.top = Math.min(rect.bottom + 4, window.innerHeight - menu.offsetHeight - 8) + 'px'
		popup = menu
	}

	// ---- Form dialog ----

	function buildField(field, values) {
		var wrap = el('div', 'mna-field' + (field.grow === false ? '' : ' grow'))
		var id = 'mna-f-' + field.name
		if (field.label) {
			var label = el('label', '', field.label)
			if (field.required) label.appendChild(el('span', 'mna-required', ' *'))
			label.setAttribute('for', id)
			wrap.appendChild(label)
		}
		var input
		if (field.type === 'textarea') {
			input = el('textarea')
			input.rows = field.rows || 3
		} else if (field.type === 'select') {
			input = el('select')
			var blank = el('option', '', field.placeholder || '')
			blank.value = ''
			input.appendChild(blank)
			field.options.forEach(function (option) {
				var node = el('option', '', option.label)
				node.value = option.value
				input.appendChild(node)
			})
		} else {
			input = el('input')
			input.type = 'text'
		}
		input.id = id
		input.name = field.name
		input.value = values[field.name] == null ? '' : values[field.name]
		wrap.appendChild(input)
		return { node: wrap, input: input, field: field }
	}

	// Opens a form in a dialog. `fields` is a list of fields, or rows:
	//   { name, label, type: 'text' | 'textarea' | 'select', required, options }
	//   { row: [field, { text: 'at' }, field] }
	// onSubmit(values) returns a promise. The dialog stays open, showing the error, if it rejects.
	// If onDelete is given, a Delete button is shown.
	MNA.form = function (options) {
		var values = options.values || {}
		var body = el('div', 'mna-form')
		var controls = []

		options.fields.forEach(function (item) {
			if (!item.row) {
				var built = buildField(item, values)
				controls.push(built)
				body.appendChild(built.node)
				return
			}
			var row = el('div', 'mna-field-row')
			item.row.forEach(function (part) {
				if (part.text) {
					row.appendChild(el('span', 'mna-field-text', part.text))
					return
				}
				var built = buildField(part, values)
				controls.push(built)
				row.appendChild(built.node)
			})
			body.appendChild(row)
		})

		function collect() {
			var result = {}
			controls.forEach(function (control) {
				result[control.field.name] = control.input.value.trim()
			})
			return result
		}

		var actions = [
			{
				label: 'Cancel',
				kind: 'outline',
				onClick: function (dialog) {
					dialog.close()
				},
			},
			{
				label: options.submitLabel || 'Save',
				kind: 'solid',
				onClick: function (dialog) {
					var result = collect()
					var missing = controls.filter(function (control) {
						return control.field.required && !result[control.field.name]
					})
					controls.forEach(function (control) {
						control.input.classList.toggle('invalid', missing.indexOf(control) !== -1)
					})
					if (missing.length) {
						missing[0].input.focus()
						return
					}
					dialog.setError('')
					dialog.setBusy(true)
					options.onSubmit(result).then(
						function () {
							dialog.close()
						},
						function (err) {
							dialog.setBusy(false)
							dialog.setError(err.message)
						}
					)
				},
			},
		]
		if (options.onDelete) {
			actions.unshift({
				label: 'Delete',
				kind: 'danger-ghost',
				left: true,
				onClick: function (dialog) {
					options.onDelete().then(
						function (deleted) {
							if (deleted) dialog.close()
						},
						function (err) {
							dialog.setError(err.message)
						}
					)
				},
			})
		}
		return MNA.dialog({ title: options.title, body: body, actions: actions, wide: true })
	}
})()
