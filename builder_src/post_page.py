"""The Post detail page: /posts/<post_id>.

The post itself (title, author, text, tags, like and save state, counts) is
rendered by the server. Everything you do on it, and the comments, is post.js:
likes, save, share, the menu, the image viewer, and the whole comments section,
which it fetches when the page loads and updates as you type."""

from blocks import (
	GRAY_6,
	INK,
	INK_BLACK,
	MUTED,
	OUTLINE,
	SURFACE_2,
	attribute,
	bind,
	block,
	html_el,
	raw_block,
	show,
	svg,
	text_style,
	when,
)
from data_scripts import HELPERS, indent
from layout import build_mobile_header, crumb_link, crumb_separator, page_layout
from shell_component import MENU_ITEM_STYLES

BUTTON_BORDER = "#e2e2e2"
ICON_SPAN = {"display": "flex", "flexShrink": "0"}


def crumb_html(*parts):
	"""Always-the-same crumbs as one block, laid out like the breadcrumb bar."""
	return raw_block(
		"Crumbs", "".join(parts), styles={"display": "flex", "alignItems": "center", "gap": "4px"}
	)


def sep():
	return html_el(
		"span",
		["sep"],
		None,
		{"color": "#999999", "fontSize": "14px", "fontWeight": "420", "letterSpacing": "0.02em"},
		text="/",
	)


def build_crumbs():
	"""Cafe / Explore / <author> / <title>. The author and the closing separator
	are left out when the post is not available."""
	start = crumb_html(
		html_el("a", None, {"href": "/"}, None, text="Cafe"),
		sep(),
		html_el("a", None, {"href": "/"}, None, text="Explore"),
	)
	author = when(
		attribute(show(crumb_link("Author", "/profile"), "pp.author_name"), "pp.author_href", "href"),
		"pp.found",
	)
	title = show(
		block("span", "Title", ["current"], text="Post", styles={"color": INK_BLACK}),
		"pp.crumb_title",
	)
	return [start, crumb_separator(), author, when(crumb_separator(), "pp.found"), title]


# ---- Header of the post ----


def build_title():
	return show(
		block(
			"h1",
			"Title",
			["cafe-post-title"],
			text="Post title",
			styles={"margin": "0", **text_style(24, "600", INK_BLACK, "0.005em", "1.4")},
		),
		"pp.title",
	)


def build_avatar():
	picture = when(
		attribute(
			block(
				"img",
				"Avatar image",
				attrs={"src": "", "alt": ""},
				styles={"gridArea": "1 / 1", "width": "100%", "height": "100%", "objectFit": "cover"},
			),
			"pp.author_image",
			"src",
		),
		"pp.author_image",
	)
	initial = when(
		show(
			block(
				"span",
				"Initial",
				text="P",
				styles={
					**text_style(20, "500", MUTED, "0.005em", "1.15"),
					"gridArea": "1 / 1",
					"textTransform": "uppercase",
				},
			),
			"pp.author_initial",
		),
		"pp.author_no_image",
	)
	return block(
		"div",
		"Avatar",
		children=[picture, initial],
		styles={
			"display": "grid",
			"placeItems": "center",
			"flexShrink": "0",
			"width": "46px",
			"height": "46px",
			"overflow": "hidden",
			"borderRadius": "9999px",
			"backgroundColor": SURFACE_2,
		},
	)


def menu_item(tag, attrs, icon_name, label, custom=None):
	return block(
		tag,
		label,
		["cafe-menu-item"],
		attrs={**attrs, "role": "menuitem"},
		custom=custom,
		inner_html=svg(icon_name, 16, MUTED) + html_el("span", text=label),
		styles=MENU_ITEM_STYLES,
	)


def build_more_menu():
	button = block(
		"button",
		"More",
		["cafe-icon-btn-subtle"],
		attrs={"type": "button", "aria-label": "More", "aria-haspopup": "menu"},
		custom={"data-action": "toggle-menu"},
		inner_html=svg("ellipsis", 16),
		styles={
			"display": "grid",
			"placeItems": "center",
			"width": "28px",
			"height": "28px",
			"padding": "0",
			"border": "0",
			"borderRadius": "8px",
			"backgroundColor": SURFACE_2,
			"color": INK,
			"cursor": "pointer",
		},
	)
	edit = when(
		attribute(menu_item("a", {"href": "/write"}, "pencil", "Edit post"), "pp.edit_href", "href"),
		"pp.is_author",
	)
	copy = menu_item("button", {"type": "button"}, "link", "Copy link", custom={"data-action": "copy-link"})
	menu = block(
		"div",
		"Menu",
		["cafe-pop"],
		attrs={"role": "menu"},
		styles={
			"display": "none",
			"position": "absolute",
			"top": "32px",
			"right": "0",
			"zIndex": "30",
			"minWidth": "160px",
			"padding": "4px",
			"borderRadius": "8px",
			"backgroundColor": "#ffffff",
			"boxShadow": "0 0 0 1px rgba(0, 0, 0, 0.08), 0 8px 24px rgba(0, 0, 0, 0.12)",
		},
		children=[edit, copy],
	)
	return block("div", "More", styles={"position": "relative", "flexShrink": "0"}, children=[button, menu])


def build_author_row():
	name = attribute(
		show(
			block(
				"a",
				"Author name",
				["cafe-author", "cafe-author-head"],
				attrs={"href": "/profile"},
				text="Author",
				styles={**text_style(16, "600", INK_BLACK, "0.015em", "24px"), "display": "block"},
			),
			"pp.author_name",
		),
		"pp.author_href",
		"href",
	)
	meta = show(
		block(
			"div",
			"Date and read time",
			text="Aug 18, 2026 · 2 min read",
			styles={"marginTop": "6px", **text_style(14, "420", MUTED)},
		),
		"pp.meta",
	)
	return block(
		"div",
		"Author row",
		styles={"marginTop": "24px", "display": "flex", "alignItems": "center", "gap": "12px"},
		children=[
			build_avatar(),
			block("div", "Author", styles={"flexGrow": "1", "minWidth": "0"}, children=[name, meta]),
			build_more_menu(),
		],
	)


# ---- Body ----


def build_carousel():
	"""The pictures of an Image post. posts.js adds the arrows, count and dots."""
	slide = attribute(
		block(
			"img",
			"Picture",
			["cafe-slide"],
			attrs={"src": "", "alt": ""},
			styles={"width": "100%", "height": "100%", "objectFit": "contain"},
		),
		"src",
		"src",
	)
	slides = block(
		"div",
		"Pictures",
		["cafe-slides"],
		styles={"width": "100%", "height": "100%"},
		children=[slide],
	)
	slides["isRepeaterBlock"] = True
	slides["dataKey"] = bind("images", "innerHTML", "key")
	return when(
		block(
			"div",
			"Carousel",
			["cafe-carousel"],
			styles={
				"position": "relative",
				"marginTop": "24px",
				"width": "100%",
				"height": "420px",
				"overflow": "hidden",
				"borderRadius": "10px",
				"backgroundColor": "#000000",
			},
			children=[slides],
		),
		"pp.is_image_post",
	)


def build_content():
	return show(
		block(
			"div",
			"Content",
			["cafe-prose"],
			attrs={"id": "cafe-content"},
			text="The text of the post.",
			styles={"marginTop": "24px", **text_style(15, "420", "#383838", "0.02em", "1.7")},
		),
		"pp.content_html",
	)


def build_tags():
	tag = show(
		block(
			"span",
			"Tag",
			["cafe-tag"],
			text="tag",
			styles={
				"display": "inline-flex",
				"alignItems": "center",
				"height": "24px",
				"padding": "0 8px",
				"borderRadius": "9999px",
				"backgroundColor": SURFACE_2,
				**text_style(13, "400", GRAY_6, "0.02em", "1.5"),
			},
		),
		"name",
	)
	tags = block(
		"div",
		"Tags",
		styles={"marginTop": "24px", "display": "flex", "flexWrap": "wrap", "gap": "8px"},
		children=[tag],
	)
	tags["isRepeaterBlock"] = True
	tags["dataKey"] = bind("tags", "innerHTML", "key")
	return when(tags, "pp.has_tags")


def action_button(action, icon_name, count_key, count_id, attrs=None):
	count = show(block("span", "Count", attrs={"id": count_id}, text="0"), count_key)
	return block(
		"button",
		action.title(),
		[f"cafe-{action}"],
		attrs={"type": "button", "aria-label": action.title(), **(attrs or {})},
		custom={"data-action": action, "data-on": ""},
		children=[block("span", "Icon", inner_html=svg(icon_name, 16), styles=ICON_SPAN), count],
		styles={
			"display": "flex",
			"alignItems": "center",
			"gap": "8px",
			"padding": "0",
			"border": "0",
			"backgroundColor": "transparent",
			"color": GRAY_6,
			"fontSize": "14px",
			"cursor": "pointer",
		},
	)


def build_action_bar():
	like = attribute(
		action_button("like", "heart", "pp.like_count", "cafe-like-count"), "pp.like_flag", "data-on"
	)
	comment = action_button("comment", "message-circle", "pp.comment_count", "cafe-comment-count")
	share = raw_block(
		"Share",
		html_el(
			"button",
			["cafe-outline-btn"],
			{"type": "button", "aria-label": "Share", "data-action": "share"},
			{
				"display": "grid",
				"placeItems": "center",
				"width": "28px",
				"height": "28px",
				"padding": "0",
				"border": f"1px solid {BUTTON_BORDER}",
				"borderRadius": "8px",
				"backgroundColor": "#ffffff",
				"color": INK,
				"cursor": "pointer",
			},
			[svg("send", 16)],
		),
		styles={"display": "flex"},
	)
	save = attribute(
		block(
			"button",
			"Save",
			["cafe-save"],
			attrs={"type": "button", "aria-label": "Save"},
			custom={"data-action": "save", "data-on": ""},
			inner_html=svg("bookmark", 16),
			styles={
				"display": "grid",
				"placeItems": "center",
				"width": "28px",
				"height": "28px",
				"padding": "0",
				"border": f"1px solid {BUTTON_BORDER}",
				"borderRadius": "8px",
				"backgroundColor": "#ffffff",
				"color": INK,
				"cursor": "pointer",
			},
		),
		"pp.saved_flag",
		"data-on",
	)
	return block(
		"div",
		"Action bar",
		styles={
			"marginTop": "24px",
			"display": "flex",
			"alignItems": "center",
			"justifyContent": "space-between",
			"padding": "12px 0",
			"borderTop": f"1px solid {OUTLINE}",
			"borderBottom": f"1px solid {OUTLINE}",
		},
		children=[
			block(
				"div",
				"Counts",
				styles={"display": "flex", "alignItems": "center", "gap": "24px"},
				children=[like, comment],
			),
			block(
				"div",
				"Buttons",
				styles={"display": "flex", "alignItems": "center", "gap": "4px"},
				children=[share, save],
			),
		],
	)


def build_responses():
	heading = show(
		block(
			"h2",
			"Responses",
			attrs={"id": "cafe-responses"},
			text="Responses (0)",
			styles={"margin": "24px 0 0", **text_style(16, "600", INK_BLACK, "0.015em", "1.15")},
		),
		"pp.responses_label",
	)
	field = html_el(
		"textarea",
		["cafe-textarea"],
		{
			"id": "cafe-comment-text",
			"rows": "3",
			"placeholder": "What are your thoughts?",
			"aria-label": "Write a comment",
		},
		{
			"display": "block",
			"width": "100%",
			"padding": "6px 8px",
			"border": f"1px solid {SURFACE_2}",
			"borderRadius": "8px",
			"outline": "none",
			"backgroundColor": SURFACE_2,
			"color": INK,
			"fontSize": "14px",
			"lineHeight": "1.15",
			"letterSpacing": "0.02em",
			"resize": "vertical",
		},
	)
	button = html_el(
		"button",
		["cafe-btn", "cafe-btn-subtle"],
		{"type": "button", "id": "cafe-comment-send", "data-action": "comment-send"},
		{"marginTop": "8px", "backgroundColor": SURFACE_2, "color": INK},
		text="Comment",
	)
	box = raw_block("Comment box", field + button, styles={"marginTop": "24px"})
	# posts.js fills this. The blocks below are only what shows before it does.
	comments = raw_block(
		"Comments",
		html_el(
			"div",
			["cafe-comment-loading"],
			None,
			{"display": "flex", "flexDirection": "column", "gap": "16px"},
			[
				"".join(
					html_el(
						"div",
						["cafe-skeleton"],
						None,
						{"height": "64px", "borderRadius": "8px", "backgroundColor": SURFACE_2},
					)
					for _ in range(2)
				)
			],
		),
		styles={"marginTop": "24px"},
		classes=["cafe-comments"],
	)
	comments["attributes"] = {"id": "cafe-comments"}
	more = raw_block(
		"More comments",
		html_el(
			"button",
			["cafe-more-comments"],
			{"type": "button", "hidden": "hidden", "data-action": "more-comments"},
			{
				"display": "block",
				"width": "100%",
				"marginTop": "24px",
				"padding": "0",
				"border": "0",
				"backgroundColor": "transparent",
				"color": GRAY_6,
				"fontSize": "14px",
				"textAlign": "center",
				"cursor": "pointer",
			},
			text="Show more comments",
		),
	)
	return [heading, box, comments, more]


def build_unavailable():
	return when(
		raw_block(
			"Unavailable",
			svg("lock", 32, "#c8c8c8")
			+ html_el(
				"p",
				None,
				None,
				{"margin": "0", **text_style(14, "420", MUTED, "0.02em", "1.5")},
				text="This post isn't available. It may be a draft, archived, or removed.",
			),
			styles={
				"display": "flex",
				"flexDirection": "column",
				"alignItems": "center",
				"gap": "12px",
				"padding": "96px 0",
				"textAlign": "center",
			},
		),
		"pp.unavailable",
	)


def build_post_page(shell_id, shell_block):
	post = when(
		block(
			"div",
			"Post",
			attrs={"id": "cafe-post"},
			custom={"data-post": "", "data-user": "", "data-me-name": "", "data-me-image": ""},
			children=[
				build_title(),
				build_author_row(),
				block("div", "Divider", styles={"marginTop": "24px", "borderTop": f"1px solid {OUTLINE}"}),
				build_carousel(),
				build_content(),
				build_tags(),
				build_action_bar(),
				*build_responses(),
			],
		),
		"pp.found",
	)
	for key, prop in (
		("pp.post_id", "data-post"),
		("pp.user_id", "data-user"),
		("pp.me_name", "data-me-name"),
		("pp.me_image", "data-me-image"),
	):
		post = attribute(post, key, prop)
	return page_layout(
		shell_id,
		shell_block,
		build_crumbs(),
		[post, build_unavailable()],
		"600px",
		mobile_header=build_mobile_header("Post", title_key="pp.title", back_href="/"),
		container_class="cafe-container-post",
		padding="48px 24px 32px",
	)


# ---- Data script ----

POST_MAIN = """\
post_id = frappe.form_dict.post_id or ""

if frappe.session.user == "Guest":
    redirect("/login?redirect=/posts/" + path_segment(post_id))

if not post_id:
    # Builder's editor canvas has no post in the address: show the newest published one there.
    newest = frappe.get_all("Post", filters={"status": "Published"}, order_by="creation desc", limit_page_length=1, pluck="name")
    post_id = newest[0] if newest else ""

post = None
if post_id:
    try:
        post = frappe.call("cafe.api.get_post", post_id=post_id)
    except Exception:
        post = None

if not post:
    data.pp = {"found": False, "unavailable": True, "crumb_title": "Post", "title": "Post"}
    data.images = []
    data.tags = []
else:
    raw = post.content or ""
    if "<" in raw and ">" in raw:
        content_html = frappe.sanitize_html(raw)
    else:
        content_html = "".join(["<p>" + clean(part.strip()).replace("\\n", "<br>") + "</p>" for part in raw.split("\\n\\n") if part.strip()])

    minutes = int(len(plain_text(raw).split()) / 200 + 0.5)
    if minutes < 1:
        minutes = 1

    author_name = post.author_name or post.author
    images = []
    for item in post.images or []:
        url = safe_url(item.get("image"))
        if url:
            images.append({"src": url})
    tags = [{"name": clean(tag)} for tag in post.tags or []]
    me = frappe.db.get_value("User", frappe.session.user, ["full_name", "user_image"], as_dict=True) or {}
    author_image = safe_url(post.author_image)

    data.pp = {
        "found": True,
        "unavailable": False,
        "post_id": clean(post.name),
        "user_id": clean(frappe.session.user),
        "me_name": clean(me.get("full_name") or frappe.session.user),
        "me_image": safe_url(me.get("user_image")),
        "title": clean(post.title or "Untitled"),
        "crumb_title": clean(post.title or "Post"),
        "author_name": clean(author_name),
        "author_initial": clean(author_name[:1]),
        "author_image": author_image,
        "author_no_image": not author_image,
        "author_href": clean("/profile/" + path_segment(post.author_username or post.author)),
        "meta": day_month_year(post.creation) + " \\u00b7 " + str(minutes) + " min read",
        "is_author": post.author == frappe.session.user,
        "edit_href": clean("/write/" + path_segment(post.name)),
        "content_html": content_html,
        "is_image_post": post.post_type == "Image" and len(images) > 0,
        "has_tags": len(tags) > 0,
        "like_count": post.like_count,
        "like_flag": "1" if post.liked_by_me else "",
        "comment_count": post.comment_count,
        "saved_flag": "1" if post.saved_by_me else "",
        "responses_label": "Responses (" + str(post.comment_count) + ")",
    }
    data.images = images
    data.tags = tags
"""

POST_DATA_SCRIPT = HELPERS + POST_MAIN
