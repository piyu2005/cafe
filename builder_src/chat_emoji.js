// The native chat, part 6: the emoji picker. The list of emoji is a separate
// file, fetched the first time a picker opens.
;(function () {
	'use strict'

	var C = window.MNA.chat
	var DATA_SCRIPT = '/assets/cafe/builder_assets/vendor/emoji-data.js'
	var loading = null
	var picker = null

	function loadData() {
		if (window.MnaEmoji) return Promise.resolve(window.MnaEmoji)
		if (!loading) {
			loading = new Promise(function (resolve, reject) {
				var script = document.createElement('script')
				script.src = DATA_SCRIPT
				script.onload = function () {
					resolve(window.MnaEmoji)
				}
				script.onerror = function () {
					loading = null
					reject(new Error("Couldn't load the emoji."))
				}
				document.head.appendChild(script)
			})
		}
		return loading
	}

	C.closeEmojiPicker = function () {
		if (picker) {
			picker.remove()
			picker = null
		}
	}

	document.addEventListener('mousedown', function (event) {
		if (picker && !picker.contains(event.target) && !event.target.closest('[data-emoji-anchor]'))
			C.closeEmojiPicker()
	})
	document.addEventListener('keydown', function (event) {
		if (event.key === 'Escape') C.closeEmojiPicker()
	})

	// Opens above or below `anchor`, wherever there is room. onSelect gets the emoji.
	C.emojiPicker = function (anchor, onSelect) {
		if (picker) {
			C.closeEmojiPicker()
			return
		}
		picker = C.el('div', 'mna-c-emoji')
		anchor.setAttribute('data-emoji-anchor', '')
		var search = C.el('input', 'mna-c-emoji-search')
		search.type = 'text'
		search.placeholder = 'Search emoji'
		search.setAttribute('aria-label', 'Search emoji')
		var grid = C.el('div', 'mna-c-emoji-grid')
		var head = C.el('div', 'mna-c-emoji-head')
		head.appendChild(search)
		picker.appendChild(head)
		picker.appendChild(grid)
		document.body.appendChild(picker)
		place(anchor)

		loadData().then(
			function (data) {
				function draw() {
					var query = search.value.trim().toLowerCase()
					var rows = query
						? data.filter(function (row) {
								return row[0].indexOf(query) !== -1
						  })
						: data
					grid.replaceChildren()
					if (!rows.length) {
						grid.appendChild(C.el('p', 'mna-c-emoji-none', 'No emoji found.'))
						return
					}
					var fragment = document.createDocumentFragment()
					rows.forEach(function (row) {
						var button = C.el('button', 'mna-c-emoji-btn', row[1])
						button.type = 'button'
						button.title = row[0]
						button.setAttribute('data-emoji', row[1])
						fragment.appendChild(button)
					})
					grid.appendChild(fragment)
				}
				search.addEventListener('input', draw)
				grid.addEventListener('click', function (event) {
					var button = event.target.closest('[data-emoji]')
					if (!button) return
					C.closeEmojiPicker()
					onSelect(button.getAttribute('data-emoji'))
				})
				draw()
				place(anchor)
			},
			function (error) {
				C.closeEmojiPicker()
				C.errorToast(error)
			}
		)
		search.focus()
	}

	function place(anchor) {
		var rect = anchor.getBoundingClientRect()
		var width = picker.offsetWidth
		var height = picker.offsetHeight
		var left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
		var above = rect.top - height - 4
		picker.style.left = left + 'px'
		picker.style.top = (above >= 8 ? above : Math.min(rect.bottom + 4, window.innerHeight - height - 8)) + 'px'
	}
})()
