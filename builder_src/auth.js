// Login and Signup. Sends the emailed code, checks it, and signs you in, with
// the same methods as the old app. On /login?redirect-to=... it runs the
// password form for the Frappe Desk instead. Needs ui.js.
;(function () {
	'use strict'

	var CAFE = (window.CAFE = window.CAFE || {})
	var COOLDOWN_SECONDS = 25
	var CODE_LENGTH = 6

	// Calls a whitelisted method. This uses the /api/method/ address on purpose:
	// the code endpoints are rate limited per method, and Frappe tells the methods
	// apart by that address. On /api/v2/method/ they all share one counter.
	function call(method, args) {
		return fetch(location.origin + '/api/method/' + method, {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(args || {}),
		}).then(function (response) {
			return response
				.json()
				.catch(function () {
					return {}
				})
				.then(function (body) {
					if (!response.ok) throw new Error(serverMessage(body) || CAFE.DEFAULT_ERROR)
					return body.message
				})
		})
	}

	// The text of frappe.throw(), which Frappe puts in _server_messages. It is
	// shown with textContent, so any markup in it stays as typed.
	function serverMessage(body) {
		try {
			var first = JSON.parse(JSON.parse(body._server_messages)[0])
			return first && first.message ? String(first.message) : ''
		} catch (e) {
			return ''
		}
	}

	// A path on this site and nothing else: a link with an address in it must
	// not be able to send someone who just signed in to another site. Browsers
	// drop tabs and line breaks from an address, so "/<tab>/evil.example" would
	// become "//evil.example"; anything with a control character or a backslash
	// is refused outright.
	function localPath(value) {
		if (typeof value !== 'string' || value.charAt(0) !== '/' || value.charAt(1) === '/') return ''
		return /[\u0000-\u001f\u007f\\]/.test(value) ? '' : value
	}

	function show(node, visible) {
		node.hidden = !visible
	}
	function setError(node, text) {
		node.textContent = text || ''
		show(node, !!text)
	}

	// The message the server sent, or `fallback` when all we have is the generic one.
	function messageOf(error, fallback) {
		return !error || !error.message || error.message === CAFE.DEFAULT_ERROR
			? fallback || CAFE.DEFAULT_ERROR
			: error.message
	}

	function busy(button, isBusy) {
		button.disabled = isBusy
		button.style.opacity = isBusy ? '0.6' : ''
	}

	// ---- The six boxes for the code ----

	function Otp(boxes, onComplete) {
		var self = this
		this.boxes = boxes
		boxes.forEach(function (box, index) {
			box.addEventListener('input', function () {
				box.value = box.value.replace(/\D/g, '').slice(-1)
				if (box.value && index < boxes.length - 1) boxes[index + 1].focus()
				if (self.value().length === boxes.length) onComplete(self.value())
			})
			box.addEventListener('keydown', function (event) {
				if (event.key === 'Backspace' && !box.value && index > 0) boxes[index - 1].focus()
			})
			box.addEventListener('paste', function (event) {
				event.preventDefault()
				var pasted = ((event.clipboardData || window.clipboardData).getData('text') || '')
					.replace(/\D/g, '')
					.slice(0, boxes.length)
				boxes.forEach(function (other, i) {
					other.value = pasted.charAt(i)
				})
				var next = boxes.findIndex(function (other) {
					return !other.value
				})
				boxes[next === -1 ? boxes.length - 1 : next].focus()
				if (self.value().length === boxes.length) onComplete(self.value())
			})
		})
	}
	Otp.prototype.value = function () {
		return this.boxes
			.map(function (box) {
				return box.value
			})
			.join('')
	}
	Otp.prototype.clear = function () {
		this.boxes.forEach(function (box) {
			box.value = ''
		})
	}
	Otp.prototype.focus = function () {
		this.boxes[0].focus()
	}

	// ---- Email code: the flow of /login and /signup ----

	// `config.send(email)` and `config.verify(email, code)` return promises.
	function CodeFlow(root, config) {
		this.config = config
		this.emailForm = root.querySelector('#cafe-email-form')
		this.codeForm = root.querySelector('#cafe-code-form')
		this.emailError = root.querySelector('#cafe-email-error')
		this.codeError = root.querySelector('#cafe-code-error')
		this.sendButton = root.querySelector('#cafe-send')
		this.verifyButton = root.querySelector('#cafe-verify')
		this.resend = root.querySelector('.cafe-resend')
		this.hint = root.querySelector('.cafe-signup-hint')
		this.otp = new Otp([].slice.call(root.querySelectorAll('.cafe-otp')), this.verify.bind(this))
		this.timer = null
		this.email = ''
		this.bind(root)
	}

	CodeFlow.prototype.bind = function (root) {
		var self = this
		this.emailForm.addEventListener('submit', function (event) {
			event.preventDefault()
			self.sendCode()
		})
		this.codeForm.addEventListener('submit', function (event) {
			event.preventDefault()
			self.verify(self.otp.value())
		})
		this.resend.addEventListener('click', function (event) {
			if (event.target.closest('button')) self.sendCode()
		})
		root.querySelector('#cafe-google').addEventListener('click', function () {
			self.google()
		})
	}

	CodeFlow.prototype.sendCode = function () {
		var self = this
		var values = this.config.read(this.emailForm)
		if (!values || this.sendButton.disabled) return
		setError(this.emailError, '')
		if (this.hint) show(this.hint, false)
		busy(this.sendButton, true)
		this.config.send(values).then(
			function () {
				busy(self.sendButton, false)
				self.email = values.email
				self.showCodeStep()
			},
			function (error) {
				busy(self.sendButton, false)
				var text = messageOf(error)
				setError(self.emailError, text)
				if (self.hint) show(self.hint, text.indexOf('No account found') >= 0)
			}
		)
	}

	CodeFlow.prototype.showCodeStep = function () {
		document.getElementById('cafe-sent-to').textContent = this.email
		show(this.emailForm, false)
		show(this.codeForm, true)
		this.otp.clear()
		this.startCooldown()
		this.otp.focus()
	}

	CodeFlow.prototype.verify = function (code) {
		var self = this
		if (code.length !== CODE_LENGTH || this.verifyButton.disabled) return
		setError(this.codeError, '')
		busy(this.verifyButton, true)
		this.config.verify(this.email, code).then(
			function () {
				location.assign(self.config.after())
			},
			function (error) {
				busy(self.verifyButton, false)
				setError(self.codeError, messageOf(error, 'Incorrect code. Please try again.'))
				self.otp.clear()
			}
		)
	}

	CodeFlow.prototype.startCooldown = function () {
		var self = this
		var left = COOLDOWN_SECONDS
		clearInterval(this.timer)
		function paint() {
			if (left > 0) {
				self.resend.textContent = 'Resend in ' + left + ' seconds'
				return
			}
			clearInterval(self.timer)
			var button = document.createElement('button')
			button.type = 'button'
			button.className = 'cafe-auth-link-btn'
			button.textContent = 'Resend code'
			self.resend.replaceChildren(button)
		}
		paint()
		this.timer = setInterval(function () {
			left -= 1
			paint()
		}, 1000)
	}

	CodeFlow.prototype.google = function () {
		call('cafe.api.get_google_login_url', {}).then(
			function (url) {
				if (url) location.assign(url)
				else CAFE.toast('Google sign-in is not configured yet', 'warning')
			},
			function (error) {
				CAFE.toast(messageOf(error), 'error')
			}
		)
	}

	// ---- The three pages ----

	function loginConfig(next) {
		return {
			read: function (form) {
				var email = form.querySelector('#cafe-email').value.trim()
				return email ? { email: email } : null
			},
			send: function (values) {
				return call('cafe.api.send_login_code', { email: values.email })
			},
			verify: function (email, code) {
				return call('cafe.api.verify_login_code', { email: email, code: code })
			},
			after: function () {
				return next || '/'
			},
		}
	}

	function signupConfig() {
		return {
			read: function (form) {
				var username = form.querySelector('#cafe-username').value.trim()
				var email = form.querySelector('#cafe-email').value.trim()
				return username && email ? { username: username, email: email } : null
			},
			send: function (values) {
				return call('cafe.api.send_signup_code', { email: values.email, username: values.username })
			},
			verify: function (email, code) {
				return call('cafe.api.verify_signup_code', { email: email, code: code })
			},
			after: function () {
				return '/'
			},
		}
	}

	// Frappe's own login command: it wants a form body and is not a v2 method.
	function systemLogin(root, target) {
		var form = root.querySelector('#cafe-system-form')
		var error = root.querySelector('#cafe-system-error')
		var button = root.querySelector('#cafe-system-login')
		form.addEventListener('submit', function (event) {
			event.preventDefault()
			var usr = form.querySelector('#cafe-usr').value
			var pwd = form.querySelector('#cafe-pwd').value
			if (!usr || !pwd || button.disabled) return
			setError(error, '')
			busy(button, true)
			fetch(location.origin + '/api/method/login', {
				method: 'POST',
				credentials: 'same-origin',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: 'usr=' + encodeURIComponent(usr) + '&pwd=' + encodeURIComponent(pwd),
			}).then(
				function (response) {
					if (response.ok) {
						location.assign(target || '/desk')
						return
					}
					busy(button, false)
					setError(error, 'Invalid username or password')
				},
				function () {
					busy(button, false)
					setError(error, 'Invalid username or password')
				}
			)
		})
	}

	document.addEventListener('DOMContentLoaded', function () {
		var root = document.getElementById('cafe-auth')
		if (!root) return
		var query = new URLSearchParams(location.search)
		if (root.querySelector('#cafe-system-form')) return systemLogin(root, localPath(query.get('redirect-to')))
		var signup = !!root.querySelector('#cafe-username')
		var next = localPath(query.get('redirect'))
		if (next.indexOf('/login') === 0 || next.indexOf('/signup') === 0) next = ''
		new CodeFlow(root, signup ? signupConfig() : loginConfig(next))
	})
})()
