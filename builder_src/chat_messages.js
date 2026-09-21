// The native chat, part 3: how one message is drawn.
;(function () {
	'use strict'

	var C = window.MNA.chat
	var IMAGE_LIMIT = 4
	var LINK = /(\*\*[^*]+\*\*)|(\*[^*]+\*)|(`[^`]+`)|(https?:\/\/[^\s]+)/g

	// Older messages are plain text with a little markdown. Text goes in as text.
	function plainBody(text) {
		var div = C.el('div', 'mna-c-plain')
		var last = 0
		var match
		LINK.lastIndex = 0
		while ((match = LINK.exec(text))) {
			if (match.index > last) div.appendChild(document.createTextNode(text.slice(last, match.index)))
			var part = match[0]
			var node
			if (part.indexOf('**') === 0) {
				node = C.el('strong', '', part.slice(2, -2))
			} else if (part.charAt(0) === '`') {
				node = C.el('code', 'mna-c-inline-code', part.slice(1, -1))
			} else if (part.charAt(0) === '*') {
				node = C.el('em', '', part.slice(1, -1))
			} else {
				node = C.el('a', 'mna-c-link', part)
				node.href = part
				node.target = '_blank'
				node.rel = 'noopener'
			}
			div.appendChild(node)
			last = LINK.lastIndex
		}
		if (last < text.length) div.appendChild(document.createTextNode(text.slice(last)))
		return div
	}

	function htmlBody(html) {
		var div = C.el('div', 'mna-c-html')
		div.innerHTML = window.MnaEditor ? window.MnaEditor.sanitize(html) : ''
		div.querySelectorAll('a').forEach(function (link) {
			link.target = '_blank'
			link.rel = 'noopener'
		})
		return div
	}

	function replyPreview(m) {
		var preview = m.reply_to_preview
		var button = C.el('button', 'mna-c-reply-preview')
		button.type = 'button'
		button.appendChild(C.el('div', 'mna-c-reply-name', preview.sender_name))
		button.appendChild(
			C.el('div', 'mna-c-reply-text', preview.is_deleted ? 'This message was deleted' : preview.content)
		)
		button.addEventListener('click', function () {
			if (C.jumpTo) C.jumpTo(preview.name)
		})
		return button
	}

	function images(m) {
		return (m.attachments || []).filter(function (a) {
			return C.isImageFile(a.file_name)
		})
	}
	function files(m) {
		return (m.attachments || []).filter(function (a) {
			return !C.isImageFile(a.file_name)
		})
	}

	function attachments(m) {
		var wrap = C.el('div', 'mna-c-attachments' + (images(m).length > 1 ? ' grid' : ''))
		var pictures = images(m)
		pictures.slice(0, IMAGE_LIMIT).forEach(function (a, i) {
			var button = C.el('button', 'mna-c-picture')
			button.type = 'button'
			var img = C.el('img')
			img.src = a.file_url
			img.alt = ''
			img.loading = 'lazy'
			button.appendChild(img)
			if (i === IMAGE_LIMIT - 1 && pictures.length > IMAGE_LIMIT)
				button.appendChild(C.el('div', 'mna-c-more', '+' + (pictures.length - IMAGE_LIMIT)))
			button.addEventListener('click', function () {
				if (C.lightbox) C.lightbox(pictures, i)
			})
			wrap.appendChild(button)
		})
		files(m).forEach(function (a) {
			var link = C.el('a', 'mna-c-file')
			link.href = C.safeUrl(a.file_url)
			link.target = '_blank'
			link.rel = 'noopener'
			link.appendChild(C.icon('file', 'mna-c-small'))
			link.appendChild(C.el('span', 'mna-c-file-name', a.file_name))
			wrap.appendChild(link)
		})
		return wrap
	}

	function sharedPost(m) {
		var card = C.el('a', 'mna-c-post-card')
		card.href = C.safeUrl(m.link_url)
		if (m.link_image) {
			var img = C.el('img')
			img.src = m.link_image
			img.alt = ''
			img.loading = 'lazy'
			card.appendChild(img)
		}
		var text = C.el('div', 'mna-c-card-text')
		text.appendChild(C.el('div', 'mna-c-card-title', m.link_title))
		if (m.link_description) text.appendChild(C.el('p', 'mna-c-card-desc', m.link_description))
		text.appendChild(C.el('span', 'mna-c-card-desc', 'View post'))
		card.appendChild(text)
		return card
	}

	function linkCard(m) {
		var card = C.el('a', 'mna-c-link-card')
		card.href = C.safeUrl(m.link_url)
		card.target = '_blank'
		card.rel = 'noopener'
		if (m.link_image) {
			var img = C.el('img')
			img.src = m.link_image
			img.alt = ''
			img.loading = 'lazy'
			card.appendChild(img)
		}
		var text = C.el('div', 'mna-c-link-text')
		text.appendChild(C.el('div', 'mna-c-link-title', m.link_title))
		if (m.link_description) text.appendChild(C.el('p', 'mna-c-link-desc', m.link_description))
		card.appendChild(text)
		return card
	}

	function poll(m) {
		var data = m.poll_data
		var card = C.el('div', 'mna-c-poll')
		card.appendChild(C.el('div', 'mna-c-poll-question', data.question))
		var options = C.el('div', 'mna-c-poll-options')
		data.options.forEach(function (option) {
			var button = C.el('button', 'mna-c-poll-option')
			button.type = 'button'
			button.disabled = !!data.is_closed
			var percent = data.total_votes ? Math.round((option.vote_count / data.total_votes) * 100) : 0
			var bar = C.el('div', 'mna-c-poll-bar')
			bar.style.width = percent + '%'
			var line = C.el('div', 'mna-c-poll-line')
			var label = C.el('span', 'mna-c-poll-label')
			label.appendChild(
				C.icon(
					option.voted_by_me ? 'circle-check' : 'circle',
					'mna-c-small' + (option.voted_by_me ? '' : ' mna-c-faint')
				)
			)
			label.appendChild(document.createTextNode(option.option_text))
			line.appendChild(label)
			line.appendChild(C.el('span', 'mna-c-poll-count', String(option.vote_count)))
			button.appendChild(bar)
			button.appendChild(line)
			button.addEventListener('click', function () {
				if (C.votePoll) C.votePoll(m, option)
			})
			options.appendChild(button)
		})
		card.appendChild(options)
		var foot = data.total_votes + ' ' + (data.total_votes === 1 ? 'vote' : 'votes')
		if (data.allow_multiple) foot += ' · Multiple choice'
		if (data.is_closed) foot += ' · Closed'
		card.appendChild(C.el('div', 'mna-c-poll-foot', foot))
		return card
	}

	function hoverButtons(m, own) {
		var group = C.el('div', 'mna-c-hover ' + (own ? 'own' : 'other'))
		function make(icon, label, handler) {
			var button = C.el('button', 'mna-c-hover-btn')
			button.type = 'button'
			button.setAttribute('aria-label', label)
			button.appendChild(C.icon(icon, 'mna-c-tiny'))
			button.addEventListener('click', function (event) {
				event.stopPropagation()
				if (handler) handler(m, button)
			})
			return button
		}
		group.appendChild(
			make('smile-plus', 'React', function (msg, button) {
				if (C.pickReaction) C.pickReaction(msg, button)
			})
		)
		group.appendChild(
			make('reply', 'Reply', function (msg) {
				if (C.startReply) C.startReply(msg)
			})
		)
		group.appendChild(
			make('ellipsis', 'More', function (msg, button) {
				if (C.messageMenu) C.messageMenu(msg, button)
			})
		)
		return group
	}

	function reactions(m) {
		var wrap = C.el('div', 'mna-c-reactions')
		m.reactions.forEach(function (r) {
			var button = C.el('button', 'mna-c-reaction' + (r.reacted_by_me ? ' mine' : ''), r.emoji + ' ' + r.count)
			button.type = 'button'
			button.addEventListener('click', function () {
				if (C.react) C.react(m, r.emoji)
			})
			wrap.appendChild(button)
		})
		return wrap
	}

	function bubble(m, own) {
		var node = C.el('div', 'mna-c-bubble')
		if (m.is_deleted) {
			node.appendChild(C.el('div', 'mna-c-deleted', 'This message was deleted'))
			return node
		}
		if (m.reply_to_preview) node.appendChild(replyPreview(m))
		if (C.isHtml(m.content)) node.appendChild(htmlBody(m.content))
		else if (m.content) node.appendChild(plainBody(m.content))
		if (m.attachments && m.attachments.length) node.appendChild(attachments(m))
		if (m.shared_post) node.appendChild(sharedPost(m))
		else if (m.link_url) node.appendChild(linkCard(m))
		if (m.poll_data) node.appendChild(poll(m))
		if (String(m.name).indexOf('temp-') !== 0) node.appendChild(hoverButtons(m, own))
		return node
	}

	// One message row. `seen` marks the last of your own messages the other person has read.
	C.renderMessage = function (m, seen) {
		var own = m.sender === C.me
		var row = C.el('div', 'mna-c-msg' + (own ? ' own' : ''))
		row.setAttribute('data-message-id', m.name)
		if (!own) row.appendChild(C.avatar(m.sender_image, m.sender_name, 'sm'))
		var column = C.el('div', 'mna-c-msg-col' + (images(m).length > 1 ? ' fit' : ''))
		column.appendChild(bubble(m, own))
		if (!m.is_deleted && m.reactions && m.reactions.length) column.appendChild(reactions(m))
		column.appendChild(
			C.el('div', 'mna-c-time', C.formatTime(m.creation) + (m.is_edited && !m.is_deleted ? ' · edited' : ''))
		)
		if (seen) column.appendChild(C.el('div', 'mna-c-seen', 'Seen'))
		row.appendChild(column)
		return row
	}
})()
