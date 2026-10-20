"""The row of a post in a list: title, preview, date line and a thumbnail. Used
by the Profile page (its Posts card) and the Profile posts page.

The published rows are blocks that Builder repeats on the server. The rows of
the Drafts and Archived tabs are made in the browser from a <template>. Both
come from the style dicts below, so they look the same."""

from blocks import GRAY_6, INK, MUTED, attribute, block, html_el, show, svg, text_style, when

ROW_STYLES = {
	"display": "flex",
	"alignItems": "stretch",
	"justifyContent": "space-between",
	"gap": "16px",
	"padding": "20px 0",
}
TEXT_STYLES = {
	"display": "flex",
	"flexDirection": "column",
	"justifyContent": "space-between",
	"flexGrow": "1",
	"minWidth": "0",
}
TITLE_STYLES = text_style(16, "600", INK, "0.015em")
TITLE_ROW_STYLES = {"display": "flex", "alignItems": "center", "gap": "6px", "minWidth": "0"}
SCHEDULED_ICON_STYLES = {"display": "inline-flex", "flexShrink": "0", "color": MUTED}
EXCERPT_STYLES = {"margin": "4px 0 0", **text_style(14, "420", GRAY_6, "0.02em", "1.5")}
META_STYLES = {"marginTop": "8px", **text_style(12, "420", MUTED)}
THUMBNAIL_STYLES = {
	"width": "96px",
	"height": "80px",
	"flexShrink": "0",
	"borderRadius": "10px",
	"objectFit": "cover",
}


def build_post_row():
	"""The published row, with data bindings. Builder repeats it per post."""
	title = show(block("div", "Title", text="Post title", styles=TITLE_STYLES), "title")
	excerpt = show(
		block("p", "Excerpt", ["cafe-clamp-2"], text="A short preview of the post.", styles=EXCERPT_STYLES),
		"excerpt",
	)
	meta = show(
		block("div", "Meta", text="Sep 18, 2026 · 1 min read · 0 comments", styles=META_STYLES),
		"meta",
	)
	thumbnail = when(
		attribute(
			block("img", "Thumbnail", attrs={"src": "", "alt": ""}, styles=THUMBNAIL_STYLES),
			"thumbnail",
			"src",
		),
		"thumbnail",
	)
	reposted_badge = when(
		block(
			"div",
			"Reposted badge",
			styles={
				"display": "flex",
				"alignItems": "center",
				"gap": "4px",
				"marginBottom": "6px",
				**text_style(12, "500", MUTED, "0.01em"),
			},
			children=[
				block("span", "Icon", inner_html=svg("repeat-2", 12), styles={"display": "flex"}),
				show(block("span", "Label", text="Reposted"), "reposted_label"),
			],
		),
		"reposted",
	)
	text = block(
		"div",
		"Text",
		styles=TEXT_STYLES,
		children=[reposted_badge, block("div", "Title and excerpt", children=[title, excerpt]), meta],
	)
	return attribute(
		block(
			"a",
			"Post",
			["cafe-post"],
			attrs={"href": "/posts"},
			children=[text, thumbnail],
			styles=ROW_STYLES,
		),
		"href",
		"href",
	)


def draft_row_template():
	"""The row of a draft or archived post, as a <template> for posts.js to copy.
	It has no read time or comment count, and its text is not spread top to
	bottom. The script fills in the text, link and thumbnail. The calendar
	icon next to the title is hidden by default - posts.js shows it (with a
	tooltip) only for a Draft that's scheduled to publish itself later."""
	return html_el(
		"template",
		None,
		{"id": "cafe-post-template"},
		None,
		[
			html_el(
				"a",
				["cafe-post"],
				{"href": "#"},
				ROW_STYLES,
				[
					html_el(
						"div",
						None,
						None,
						{"minWidth": "0", "flexGrow": "1"},
						[
							html_el(
								"div",
								None,
								None,
								TITLE_ROW_STYLES,
								[
									html_el("div", ["cafe-row-title"], None, TITLE_STYLES),
									html_el(
										"span",
										["cafe-row-scheduled"],
										{"hidden": "hidden", "data-tooltip": ""},
										SCHEDULED_ICON_STYLES,
										[svg("calendar-clock", 14)],
									),
								],
							),
							html_el("p", ["cafe-clamp-2", "cafe-row-excerpt"], None, EXCERPT_STYLES),
							html_el("div", ["cafe-row-meta"], None, META_STYLES),
						],
					),
					html_el("img", ["cafe-row-thumb"], {"alt": ""}, THUMBNAIL_STYLES),
				],
			)
		],
	)
