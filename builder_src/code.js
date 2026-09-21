// Code blocks of a post: colours, line numbers and a Copy button, like the
// old app's editor shows them. The post's HTML has plain <pre><code>; this
// loads highlight.js (only when the post has a code block) and rebuilds each.
;(function () {
	'use strict'

	var ICONS = '@@ICONS@@'
	var HLJS = '/assets/cafe/builder_assets/vendor/highlight.min.js'
	var COPIED_MS = 2000

	function icon(name) {
		var holder = document.createElement('span')
		holder.className = 'mna-code-icon'
		holder.innerHTML = ICONS[name] || ''
		return holder
	}

	// The colours come from the text alone, and highlight.js escapes what it
	// returns, so nothing in a post can add markup here.
	function highlighted(text, language) {
		if (language && window.hljs.getLanguage(language)) {
			return window.hljs.highlight(text, { language: language, ignoreIllegals: true }).value
		}
		return window.hljs.highlightAuto(text).value
	}

	function languageOf(code) {
		var match = /(?:^|\s)language-([\w+#-]+)/.exec(code.className || '')
		return match ? match[1] : ''
	}

	function gutter(text) {
		var column = document.createElement('span')
		column.className = 'mna-code-gutter'
		column.setAttribute('aria-hidden', 'true')
		var count = text.split('\n').length
		for (var i = 1; i <= count; i++) {
			var number = document.createElement('span')
			number.textContent = String(i)
			column.appendChild(number)
		}
		return column
	}

	function copyButton(text) {
		var button = document.createElement('button')
		button.type = 'button'
		button.className = 'mna-code-copy'
		button.setAttribute('aria-label', 'Copy code')
		button.title = 'Copy code'
		button.appendChild(icon('copy'))
		button.addEventListener('click', function () {
			var done = function () {
				button.replaceChildren(icon('check'))
				button.title = 'Copied!'
				setTimeout(function () {
					button.replaceChildren(icon('copy'))
					button.title = 'Copy code'
				}, COPIED_MS)
			}
			if (navigator.clipboard && navigator.clipboard.writeText)
				navigator.clipboard.writeText(text).then(done, function () {})
		})
		return button
	}

	function rebuild(pre) {
		var codeEl = pre.querySelector('code')
		if (!codeEl || pre.parentNode.classList.contains('mna-code-block')) return
		var text = codeEl.textContent.replace(/\n$/, '')
		var language = languageOf(codeEl)

		var block = document.createElement('div')
		block.className = 'mna-code-block'
		var shell = document.createElement('pre')
		shell.className = 'mna-code'
		var body = document.createElement('code')
		body.className = 'mna-code-body'
		body.innerHTML = highlighted(text, language)
		shell.appendChild(gutter(text))
		shell.appendChild(body)

		var tools = document.createElement('div')
		tools.className = 'mna-code-tools'
		var label = document.createElement('span')
		label.className = 'mna-code-language'
		label.textContent = language || 'auto'
		tools.appendChild(label)
		tools.appendChild(copyButton(text))

		block.appendChild(shell)
		block.appendChild(tools)
		pre.replaceWith(block)
	}

	function run(root) {
		root.querySelectorAll('pre').forEach(rebuild)
	}

	document.addEventListener('DOMContentLoaded', function () {
		var root = document.getElementById('mna-content')
		if (!root || !root.querySelector('pre code')) return
		var script = document.createElement('script')
		script.src = HLJS
		script.onload = function () {
			run(root)
		}
		document.head.appendChild(script)
	})
})()
