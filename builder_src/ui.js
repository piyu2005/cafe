// Shared helpers for the Builder pages: API calls, toast, confirm dialog and
// form dialog. They are on `window.CAFE`. Load this script before the others.
// Everything that needs the page data or the CSRF token runs inside a call,
// never at load, because Builder sets those up after client scripts run.
;(function () {
	'use strict'

	var CAFE = (window.CAFE = window.CAFE || {})

	function el(tag, className, text) {
		var node = document.createElement(tag)
		if (className) node.className = className
		if (text) node.textContent = text
		return node
	}
	CAFE.el = el

	// Keeps a fixed-position floating element (width `w`) at least `margin` px
	// inside the viewport, sliding `x` in from whichever edge it overflows.
	function clampX(x, w, margin) {
		return Math.max(margin, Math.min(x, window.innerWidth - w - margin))
	}

	// ---- API ----

	CAFE.DEFAULT_ERROR = 'Something went wrong. Please try again.'

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
	CAFE.api = function (method, args) {
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
					if (!response.ok) throw new Error(errorText(body) || CAFE.DEFAULT_ERROR)
					return body.data
				})
		})
	}

	// Any /api/v2 call with a verb: CAFE.request('PUT', '/api/v2/document/Post/abc', { title: 'x' }).
	// Resolves with `data`; rejects with an Error whose message is safe to show.
	CAFE.request = function (verb, path, body) {
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
					if (!response.ok) throw new Error(errorText(result) || CAFE.DEFAULT_ERROR)
					return result.data
				})
		})
	}

	CAFE.get = function (method, params) {
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

	// Same as the toasts in Frappe Cloud (vue-sonner): bottom right, an icon and one line of text,
	// at most 3 at once, gone after 4 seconds (paused while the pointer is on it).
	var TOAST_MS = 4000
	var TOAST_MAX = 3
	var SVG20 =
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="20" height="20" aria-hidden="true">'
	var TOAST_ICONS = {
		success:
			SVG20 +
			'<path fill-rule="evenodd" clip-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"/></svg>',
		error:
			SVG20 +
			'<path fill-rule="evenodd" clip-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"/></svg>',
		info:
			SVG20 +
			'<path fill-rule="evenodd" clip-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"/></svg>',
		warning:
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z"/></svg>',
	}

	var toastBox = null
	// kind: 'success' (default), 'error', 'warning' or 'info'.
	CAFE.toast = function (text, kind) {
		if (!TOAST_ICONS[kind]) kind = 'success'
		if (!toastBox || !toastBox.isConnected) {
			toastBox = el('div', 'cafe-toasts')
			document.body.appendChild(toastBox)
		}
		while (toastBox.children.length >= TOAST_MAX) toastBox.firstChild.remove()

		var toast = el('div', 'cafe-toast ' + kind)
		toast.setAttribute('role', kind === 'error' ? 'alert' : 'status')
		var icon = el('span', 'cafe-toast-icon')
		icon.innerHTML = TOAST_ICONS[kind]
		toast.appendChild(icon)
		toast.appendChild(el('span', 'cafe-toast-text', text))
		toastBox.appendChild(toast)

		var timer = 0
		function hide() {
			toast.classList.add('leaving')
			setTimeout(function () {
				toast.remove()
			}, 400)
		}
		function start() {
			clearTimeout(timer)
			timer = setTimeout(hide, TOAST_MS)
		}
		toast.addEventListener('mouseenter', function () {
			clearTimeout(timer)
		})
		toast.addEventListener('mouseleave', start)
		start()
	}

	// ---- Dialog ----

	// Opens a dialog. `actions` is a list of { label, kind, onClick, left }, where
	// kind is 'solid', 'subtle' or 'danger'. Returns { root, close, setError, setBusy }.
	CAFE.dialog = function (options) {
		var overlay = el('div', 'cafe-overlay')
		var dialog = el('div', 'cafe-dialog' + (options.wide ? ' wide' : ''))
		dialog.setAttribute('role', 'dialog')
		dialog.setAttribute('aria-modal', 'true')
		dialog.appendChild(el('h2', '', options.title))
		var closeButton = el('button', 'cafe-dialog-close')
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

		var error = el('p', 'cafe-form-error')
		error.hidden = true
		dialog.appendChild(error)

		var actions = el('div', 'cafe-dialog-actions')
		var buttons = []
		var left = el('div', 'cafe-dialog-left')
		var right = el('div', 'cafe-dialog-right')
		;(options.actions || []).forEach(function (action) {
			var button = el('button', 'cafe-btn cafe-btn-' + (action.kind || 'subtle'), action.label)
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
			var stack = document.querySelectorAll('.cafe-overlay')
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
	CAFE.confirm = function (options) {
		return new Promise(function (resolve) {
			var settled = false
			function finish(value, dialog) {
				settled = true
				resolve(value)
				dialog.close()
			}
			CAFE.dialog({
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
	CAFE.popupMenu = function (anchor, items) {
		var wasOpen = popup && anchor.hasAttribute('data-popup-open')
		closePopup()
		document.querySelectorAll('[data-popup-open]').forEach(function (node) {
			node.removeAttribute('data-popup-open')
		})
		if (wasOpen) return
		var menu = el('div', 'cafe-popup')
		anchor.setAttribute('data-popup-anchor', '')
		anchor.setAttribute('data-popup-open', '')
		items.forEach(function (item) {
			var button = el('button', 'cafe-popup-item' + (item.danger ? ' danger' : ''))
			button.type = 'button'
			if (item.icon) {
				var icon = el('span', 'cafe-popup-icon')
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
		menu.style.left = clampX(rect.right - width, width, 8) + 'px'
		menu.style.top = Math.min(rect.bottom + 4, window.innerHeight - menu.offsetHeight - 8) + 'px'
		popup = menu
	}

	// ---- Tooltip ----

	var tooltipEl = null
	var tooltipTimer = null

	function hideTooltip() {
		clearTimeout(tooltipTimer)
		if (tooltipEl) {
			tooltipEl.remove()
			tooltipEl = null
		}
	}

	function showTooltip(anchor, text) {
		// Closes whatever tooltip is already open first, same as popupMenu's
		// closePopup()-first pattern - so switching anchors (or a stray second
		// call) never leaves an earlier bubble orphaned in the DOM.
		hideTooltip()
		// The anchor can be gone by the time the hover delay fires (removed
		// from the DOM in between); a detached element's rect is all zeros,
		// which would pin the bubble at the top-left instead of just not
		// showing it.
		if (!anchor.isConnected) return
		var bubble = el('div', 'cafe-tooltip', text)
		var arrow = el('div', 'cafe-tooltip-arrow')
		bubble.appendChild(arrow)
		document.body.appendChild(bubble)
		var rect = anchor.getBoundingClientRect()
		var width = bubble.offsetWidth
		var height = bubble.offsetHeight
		var below = rect.top - height - 8 < 0
		var left = clampX(rect.left + rect.width / 2 - width / 2, width, 4)
		bubble.classList.toggle('below', below)
		bubble.style.left = left + 'px'
		bubble.style.top = (below ? rect.bottom + 8 : rect.top - height - 8) + 'px'
		var arrowCenter = rect.left + rect.width / 2 - left
		arrow.style.left = Math.max(6, Math.min(arrowCenter, width - 6)) + 'px'
		tooltipEl = bubble
	}

	// A small dark bubble above `anchor` on hover/focus - frappe-ui's own
	// Tooltip look (rounded-4, bg-surface-gray-10, text-xs, shadow-xl, an
	// arrow), not the browser's native `title` tooltip (slow, unstyled, and
	// silent on keyboard focus in most browsers - hover/focus both trigger
	// this one so keyboard users get the same hint sighted mouse users do).
	// Flips below the anchor when there isn't room above it.
	CAFE.tooltip = function (anchor, text) {
		function schedule() {
			clearTimeout(tooltipTimer)
			tooltipTimer = setTimeout(function () {
				showTooltip(anchor, text)
			}, 150)
		}
		anchor.addEventListener('mouseenter', schedule)
		anchor.addEventListener('focus', schedule)
		anchor.addEventListener('mouseleave', hideTooltip)
		anchor.addEventListener('blur', hideTooltip)
		anchor.addEventListener('click', hideTooltip)
	}

	// ---- Form dialog ----

	function buildField(field, values) {
		var wrap = el('div', 'cafe-field' + (field.grow === false ? '' : ' grow'))
		var id = 'cafe-f-' + field.name
		if (field.label) {
			var label = el('label', '', field.label)
			if (field.required) label.appendChild(el('span', 'cafe-required', ' *'))
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
	CAFE.form = function (options) {
		var values = options.values || {}
		var body = el('div', 'cafe-form')
		var controls = []

		options.fields.forEach(function (item) {
			if (!item.row) {
				var built = buildField(item, values)
				controls.push(built)
				body.appendChild(built.node)
				return
			}
			var row = el('div', 'cafe-field-row')
			item.row.forEach(function (part) {
				if (part.text) {
					row.appendChild(el('span', 'cafe-field-text', part.text))
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
		return CAFE.dialog({ title: options.title, body: body, actions: actions, wide: true })
	}
})()
