"""The Home feed: writings from everyone, newest first. Served at "/" while the
page is published (see cafe/routing.py); unpublish it and "/" goes back
to the old app.

A row is one block whose inner HTML comes from the data script. That is one
block per post instead of about ten, and block count is what a page costs the
server (each block is rendered by a template engine on every visit). The row
markup lives in ROW_TEMPLATE below and is used three times: the data script
fills it for the first ten posts, home.js fills the copy in the page's
<template> for search results and infinite scroll, and the row block takes its
own styles from it."""

from bell import mobile_bell
from blocks import (
	GRAY_6,
	INK,
	MUTED,
	SURFACE_2,
	attribute,
	bind,
	block,
	html_el,
	raw_block,
	svg,
	text_style,
	when,
)
from data_scripts import HELPERS
from layout import crumb_current, crumb_link, crumb_separator, page_layout

PAGE_SIZE = 10

ROW_STYLES = {
	"display": "flex",
	"flexDirection": "column",
	"gap": "12px",
	"padding": "36px 0",
	"color": "inherit",
	"textDecoration": "none",
}
AUTHOR_LINE_STYLES = {"display": "flex", "alignItems": "center", "gap": "8px"}
AVATAR_STYLES = {
	"display": "grid",
	"placeItems": "center",
	"flexShrink": "0",
	"width": "20px",
	"height": "20px",
	"overflow": "hidden",
	"borderRadius": "9999px",
	"backgroundColor": SURFACE_2,
	**text_style(13, "500", MUTED, "0.02em", "1.15", textTransform="uppercase"),
}
AVATAR_IMAGE_STYLES = {"width": "100%", "height": "100%", "objectFit": "cover"}
NAME_STYLES = text_style(13, "420", INK)
BODY_STYLES = {"display": "flex", "alignItems": "flex-start", "gap": "16px"}
TEXT_STYLES = {"flex": "1 1 0%", "minWidth": "0"}
TITLE_STYLES = text_style(16, "600", INK, "0.015em")
EXCERPT_STYLES = {"margin": "4px 0 0", **text_style(14, "420", GRAY_6, "0.02em", "1.5")}
META_STYLES = {
	"display": "flex",
	"alignItems": "center",
	"gap": "12px",
	"marginTop": "16px",
	**text_style(12, "420", MUTED),
}
THUMBNAIL_STYLES = {
	"width": "128px",
	"height": "96px",
	"flexShrink": "0",
	"marginTop": "4px",
	"borderRadius": "10px",
	"backgroundColor": SURFACE_2,
	"objectFit": "cover",
}

# What goes between the row's <a> tags. [[name]] marks a value to escape and put
# in; [[!name]] marks a piece of HTML that was built already.
ROW_INNER = "".join(
	[
		html_el(
			"div",
			["mna-feed-author"],
			None,
			AUTHOR_LINE_STYLES,
			[
				html_el("span", ["mna-avatar"], None, AVATAR_STYLES, "[[!avatar]]"),
				html_el("span", None, None, NAME_STYLES, text="[[name]]"),
			],
		),
		html_el(
			"div",
			None,
			None,
			BODY_STYLES,
			[
				html_el(
					"div",
					None,
					None,
					TEXT_STYLES,
					[
						html_el("div", None, None, TITLE_STYLES, text="[[title]]"),
						html_el("p", ["mna-clamp-2"], None, EXCERPT_STYLES, text="[[excerpt]]"),
						html_el(
							"div",
							None,
							None,
							META_STYLES,
							[
								html_el("span", text="[[date]]"),
								html_el("span", text="·"),
								html_el("span", text="[[minutes]] min read"),
								html_el("span", text="·"),
								html_el(
									"span", ["mna-feed-comments"], None, None, text="[[comments]] comments"
								),
							],
						),
					],
				),
				"[[!thumbnail]]",
			],
		),
	]
)
AVATAR_IMAGE = html_el("img", None, {"src": "[[image]]", "alt": ""}, AVATAR_IMAGE_STYLES)
THUMBNAIL = html_el(
	"img",
	["mna-feed-thumb"],
	{"src": "[[cover]]", "alt": "", "loading": "lazy", "decoding": "async"},
	THUMBNAIL_STYLES,
)
ROW_TEMPLATE = html_el("a", ["mna-feed-row"], {"href": "[[href]]"}, ROW_STYLES, "[[!inner]]").replace(
	"[[!inner]]", ROW_INNER
)


def build_feed_row():
	"""The row Builder repeats for each post. It is empty in the file: the data
	script gives every row its inner HTML and link."""
	row = block("a", "Post", ["mna-feed-row"], attrs={"href": "/posts"}, styles=ROW_STYLES)
	row["dynamicValues"] = [bind("href", "href", "attribute"), bind("html", "innerHTML", "key")]
	return row


def build_mobile_bar():
	"""The phone's top bar. Unlike the other pages' it is not sticky: it scrolls
	away with the page, as on the old Home."""
	brand = raw_block(
		"Brand",
		svg("feather", 20, INK)
		+ html_el("span", None, None, text_style(17, "600", INK, "0", "1.5"), text="Cafe"),
		styles={"display": "flex", "alignItems": "center", "gap": "6px"},
	)
	write = raw_block(
		"Bell and write",
		mobile_bell()
		+ html_el(
			"a",
			["mna-btn", "mna-btn-solid"],
			{"href": "/write", "aria-label": "New post"},
			{
				"display": "inline-flex",
				"alignItems": "center",
				"justifyContent": "center",
				"width": "28px",
				"height": "28px",
				"borderRadius": "8px",
				"backgroundColor": INK,
				"color": "#ffffff",
			},
			[svg("plus", 16)],
		),
		styles={"display": "flex", "alignItems": "center", "gap": "4px"},
	)
	return block(
		"header",
		"Mobile header",
		["mna-mobile-header", "mna-home-bar"],
		styles={
			"display": "none",
			"alignItems": "center",
			"justifyContent": "space-between",
			"height": "52px",
			"padding": "0 16px",
			"borderBottom": "1px solid #ededed",
			"backgroundColor": "#ffffff",
		},
		children=[brand, write],
	)


def build_home(shell_id, shell_block):
	note = when(
		block(
			"p",
			"First post",
			children=[
				block("span", text="You haven't written anything yet. "),
				block(
					"a",
					"Write link",
					["mna-plain-link"],
					text="Write your first blog.",
					attrs={"href": "/write"},
					styles={"fontWeight": "500", "color": INK},
				),
			],
			styles={"margin": "0 0 24px", **text_style(14, "420", "#7c7c7c")},
		),
		"hp.no_posts",
	)
	title = block(
		"h1",
		"Title",
		["mna-title"],
		text="Writings from people on Cafe",
		styles={
			"margin": "0",
			"fontFamily": "Newsreader Medium",
			"fontSize": "24px",
			"fontWeight": "500",
			"lineHeight": "1.5",
			"letterSpacing": "0.005em",
			"color": INK,
		},
	)
	search_box = raw_block(
		"Search box",
		svg("search", 16, MUTED).replace(
			'style="', 'style="position:absolute;top:6px;left:8px;pointer-events:none;', 1
		)
		+ html_el(
			"input",
			None,
			{
				"id": "mna-feed-search",
				"type": "text",
				"placeholder": "Search",
				"aria-label": "Search writings",
				"autocomplete": "off",
			},
			{
				"display": "block",
				"width": "100%",
				"height": "28px",
				"padding": "6px 8px 6px 32px",
				"border": f"1px solid {SURFACE_2}",
				"borderRadius": "8px",
				"outline": "none",
				"backgroundColor": SURFACE_2,
				"color": INK,
				"fontSize": "14px",
				"letterSpacing": "0.02em",
			},
		),
		["mna-search"],
		styles={"position": "relative", "display": "block", "marginTop": "16px"},
	)
	feed = block(
		"div",
		"Posts",
		["mna-feed"],
		attrs={"id": "mna-feed", "aria-live": "polite"},
		styles={"display": "flex", "flexDirection": "column", "marginTop": "8px"},
		children=[build_feed_row()],
	)
	feed["isRepeaterBlock"] = True
	feed["dataKey"] = bind("posts", "innerHTML", "key")
	empty = when(
		raw_block(
			"Nothing found",
			html_el(
				"p",
				None,
				None,
				{"margin": "0", **text_style(16, "420", GRAY_6, "0.02em", "1.5")},
				text="No writings found.",
			),
			["mna-feed-empty"],
			styles={"padding": "64px 0", "textAlign": "center"},
		),
		"hp.empty",
	)
	template = raw_block(
		"Row template",
		html_el(
			"template",
			None,
			{"id": "mna-feed-template", "data-avatar-image": AVATAR_IMAGE, "data-thumbnail": THUMBNAIL},
			None,
			"[[row]]",
		).replace("[[row]]", ROW_TEMPLATE),
		styles={"display": "none"},
	)
	sentinel = block(
		"div", "Sentinel", attrs={"id": "mna-feed-end"}, custom={"data-more": ""}, styles={"height": "4px"}
	)
	sentinel = attribute(sentinel, "hp.more", "data-more")
	crumbs = [crumb_link("Cafe", "/"), crumb_separator(), crumb_current("Explore")]
	return page_layout(
		shell_id,
		shell_block,
		crumbs,
		[note, title, search_box, feed, empty, sentinel, template],
		"640px",
		mobile_header=build_mobile_bar(),
		container_class="mna-container-home",
		padding="24px 20px",
	)


# ---- Data script ----
# The row markup goes into the script as text, so the server fills it the same
# way home.js does.

HOME_MAIN = """\
if frappe.session.user == "Guest":
    redirect("/login")


def token_safe(value):
    # The row markup is filled one [[token]] at a time; keep a post's own
    # "[[" from being taken for one.
    return value.replace("[", "&#91;")


rows = frappe.get_all(
    "Post",
    filters={"status": "Published"},
    fields=["name", "title", "display_title", "content", "excerpt", "post_type", "attachment", "cover_image", "author", "author_name", "author_image", "creation"],
    order_by="creation desc",
    limit_page_length=@@PAGE_SIZE@@ + 1,
)
more = len(rows) > @@PAGE_SIZE@@
rows = rows[:@@PAGE_SIZE@@]

counts = {}
if rows:
    for comment in frappe.get_all("Post Comment", filters={"post": ["in", [row.name for row in rows]]}, fields=["post"]):
        counts[comment.post] = counts.get(comment.post, 0) + 1

ROW = @@ROW@@
AVATAR_IMAGE = @@AVATAR_IMAGE@@
THUMBNAIL = @@THUMBNAIL@@

posts = []
for row in rows:
    text = plain_text(row.get("content"))
    words = len(text.split())
    minutes = int(words / 200 + 0.5)
    if minutes < 1:
        minutes = 1
    label = row.get("author_name") or row.get("author") or ""
    author_image = safe_url(row.get("author_image"))
    if author_image:
        avatar = AVATAR_IMAGE.replace("[[image]]", token_safe(author_image))
    else:
        avatar = token_safe(clean(label.strip()[:1]))
    cover = row.get("cover_image") or (row.get("attachment") if row.get("post_type") != "Video" else "")
    cover = safe_url(cover)
    body = ROW.replace("[[!avatar]]", avatar)
    body = body.replace("[[!thumbnail]]", THUMBNAIL.replace("[[cover]]", token_safe(cover)) if cover else "")
    body = body.replace("[[name]]", token_safe(clean(label)))
    body = body.replace("[[title]]", token_safe(clean(row.get("display_title") or row.get("title") or (text[:60] + "\\u2026" if len(text) > 60 else text))))
    body = body.replace("[[excerpt]]", token_safe(clean(row.get("excerpt") or (text[:160] + "\\u2026" if len(text) > 160 else text))))
    body = body.replace("[[date]]", day_month_year(row.creation))
    body = body.replace("[[minutes]]", str(minutes))
    body = body.replace("[[comments]]", str(counts.get(row.name, 0)))
    href = "/posts/" + path_segment(row.name)
    posts.append({"href": clean(href), "html": body})
data.posts = posts
data.hp = {
    "no_posts": frappe.db.count("Post", {"author": frappe.session.user}) == 0,
    "empty": not posts,
    "more": "1" if more else "",
}
"""


def _literal(text):
	"""`text` as a Python string literal for the data script."""
	return repr(text)


def _row_body(template):
	"""The row's inner HTML: the template without its outer <a> tag, since the
	repeated block is the <a>."""
	start = template.index(">") + 1
	return template[start : template.rindex("</a>")]


HOME_DATA_SCRIPT = HELPERS + HOME_MAIN.replace("@@PAGE_SIZE@@", str(PAGE_SIZE)).replace(
	"@@ROW@@", _literal(_row_body(ROW_TEMPLATE))
).replace("@@AVATAR_IMAGE@@", _literal(AVATAR_IMAGE)).replace("@@THUMBNAIL@@", _literal(THUMBNAIL))
