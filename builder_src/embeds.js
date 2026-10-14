// Published posts: the "video-embed" placeholder div (write_editor.js /
// vendor_src/write-editor-entry.js) carries only a provider name and a video
// id - frappe.sanitize_html strips a raw <iframe> outright, so the real embed
// is always built here, client-side, from that same provider+id, the same
// principle the editor's own live preview already follows. Loaded only on
// pages that render a post's full content (currently just the Post page).
;(function () {
	'use strict'

	function embedSrc(provider, videoId) {
		if (provider === 'youtube') return 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(videoId)
		if (provider === 'vimeo') return 'https://player.vimeo.com/video/' + encodeURIComponent(videoId)
		return null
	}

	document.addEventListener('DOMContentLoaded', function () {
		document.querySelectorAll('[data-type="video-embed"]').forEach(function (div) {
			var src = embedSrc(div.getAttribute('data-provider'), div.getAttribute('data-video-id'))
			if (!src) return
			var frame = document.createElement('iframe')
			frame.src = src
			frame.loading = 'lazy'
			frame.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture')
			frame.setAttribute('allowfullscreen', '')
			frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups')
			div.classList.add('cafe-embed')
			div.appendChild(frame)
		})
	})
})()
