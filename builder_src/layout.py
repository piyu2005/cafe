"""The frame every page shares: shell, header with breadcrumbs, scroll area and
a centered container."""

from bell import mobile_bell
from blocks import (
	INK,
	INK_BLACK,
	MUTED,
	OUTLINE,
	attribute,
	block,
	html_el,
	instance_of,
	raw_block,
	show,
	svg,
	text_style,
)


def crumb_link(label, href, styles=None, name=None):
	return block("a", name, text=label, attrs={"href": href}, styles=styles)


def crumb_separator():
	return block(
		"span",
		"Separator",
		classes=["sep"],
		text="/",
		styles={"color": "#999999", "fontSize": "14px", "fontWeight": "420", "letterSpacing": "0.02em"},
	)


def crumb_current(label, name=None):
	return block("span", name, classes=["current"], text=label, styles={"color": INK_BLACK})


def page_header(crumbs):
	return block(
		"header",
		"Header",
		["mna-header"],
		styles={
			"position": "sticky",
			"top": "0",
			"zIndex": "10",
			"display": "flex",
			"flexShrink": "0",
			"alignItems": "center",
			"justifyContent": "space-between",
			"height": "48px",
			"padding": "0 20px",
			"borderBottom": f"1px solid {OUTLINE}",
			"backgroundColor": "#ffffff",
		},
		children=[
			block(
				"div",
				"Breadcrumbs",
				["mna-crumbs"],
				styles={
					"display": "flex",
					"alignItems": "center",
					"gap": "4px",
					"paddingLeft": "2px",
					"fontSize": "16px",
					"fontWeight": "500",
					"letterSpacing": "0.015em",
					"color": MUTED,
				},
				children=crumbs,
			),
			raw_block(
				"New Post",
				html_el(
					"a",
					["mna-btn", "mna-btn-solid"],
					{"href": "/write"},
					{
						"display": "inline-flex",
						"alignItems": "center",
						"justifyContent": "center",
						"gap": "8px",
						"height": "28px",
						"padding": "0 8px",
						"borderRadius": "8px",
						"backgroundColor": INK,
						"color": "#ffffff",
						"fontSize": "14px",
						"whiteSpace": "nowrap",
					},
					[svg("plus", 16), html_el("span", text="New Post")],
				),
				styles={"display": "flex"},
			),
		],
	)


def page_layout(
	shell_id,
	shell_block,
	crumbs,
	content,
	max_width,
	mobile_header=None,
	container_class=None,
	padding="32px 20px",
):
	"""The page body: `crumbs` go in the header and `content` in the container,
	which is `max_width` wide including its side padding. A page can add a
	`mobile_header`, a top bar that only shows on a phone, and a `container_class`
	to give the container its own phone padding in styles.css."""
	container = block(
		"section",
		"Container",
		["mna-container", *([container_class] if container_class else [])],
		styles={"width": "100%", "maxWidth": max_width, "margin": "0 auto", "padding": padding},
		children=content,
	)
	main = block(
		"div",
		"Main",
		["mna-main"],
		styles={
			"display": "flex",
			"flexGrow": "1",
			"flexDirection": "column",
			"minWidth": "0",
			# Lets the flex child below shrink to less than its content height,
			# which a flex item otherwise refuses to do — required for its own
			# overflow to actually scroll instead of pushing .mna-app taller.
			"minHeight": "0",
		},
		children=[
			*([mobile_header] if mobile_header else []),
			page_header(crumbs),
			block(
				"div",
				"Scroll area",
				["mna-scroll"],
				# "contain" (not "none"): normal scrolling still works when there's
				# real content to scroll, it just stops the bounce/rubber-band
				# animation showing at the top/bottom edge on a trackpad swipe.
				styles={
					"flexGrow": "1",
					"minHeight": "0",
					"overflowY": "auto",
					"overscrollBehavior": "contain",
				},
				children=[container],
			),
		],
	)
	app = block(
		"div",
		"App",
		["mna-app"],
		styles={
			"display": "flex",
			# 100%, not 100vw: in the editor canvas vw is the whole browser window,
			# which is wider than the canvas and clips the right edge.
			"width": "100%",
			# Like Desk and every other Frappe app: the shell is pinned to exactly
			# one screen, and only the scroll area (not the rail, header or the
			# document itself) scrolls when its content runs long. Before, the
			# whole document grew past 100vh and scrolled, which also dragged the
			# sticky rail/header along for a frame — the "cut header" bug.
			"height": "100vh",
			"overflow": "hidden",
			"backgroundColor": "#ffffff",
			"color": INK_BLACK,
			"fontSize": "14px",
			"fontWeight": "420",
			"lineHeight": "1.15",
			"letterSpacing": "0.02em",
		},
		children=[instance_of(shell_id, shell_block, "Shell"), main],
	)
	root = block("div", None, children=[app])
	root["blockId"] = "root"
	root["originalElement"] = "body"
	return [root]


def build_mobile_header(title, title_key=None, back_href="/", back_key=None, back=True, bell=True, action=""):
	"""The top bar on a phone: a back chevron, the title and the notification
	bell. `title_key` and `back_key` bind the title and the back link to page data.
	`back=False` and `bell=False` leave those out, and `action` is markup shown
	before the bell. Without a back link the title is centered on the whole bar."""
	back_link = block(
		"a",
		"Back",
		["mna-mobile-back"],
		attrs={"href": back_href, "aria-label": "Back"},
		inner_html=svg("chevron-left", 18),
		styles={
			"display": "grid",
			"placeItems": "center",
			"flexShrink": "0",
			"width": "32px",
			"height": "32px",
			"borderRadius": "8px",
			"color": INK,
		},
	)
	if back_key:
		back_link = attribute(back_link, back_key, "href")
	heading = block(
		"h1",
		"Title",
		["mna-mobile-title"],
		text=title,
		styles={
			"margin": "0",
			"flexGrow": "1",
			"minWidth": "0",
			"overflow": "hidden",
			"textOverflow": "ellipsis",
			"whiteSpace": "nowrap",
			"textAlign": "center",
			**({} if back else {"position": "absolute", "left": "0", "right": "0", "pointerEvents": "none"}),
			**text_style(17, "600", INK_BLACK, "0.015em", "1.25"),
		},
	)
	if title_key:
		heading = show(heading, title_key)
	styles = {"display": "flex", "flexShrink": "0", "justifyContent": "flex-end", "width": "32px"}
	if action or not bell:
		styles = {
			"position": "relative",
			"display": "flex",
			"flexShrink": "0",
			"alignItems": "center",
			"justifyContent": "flex-end",
			"gap": "4px",
			"marginLeft": "auto",
		}
	right = raw_block("Notifications", (mobile_bell() if bell else "") + action, styles=styles)
	return block(
		"header",
		"Mobile header",
		["mna-mobile-header"],
		styles={
			"display": "none",
			"position": "sticky",
			"top": "0",
			"zIndex": "10",
			"alignItems": "center",
			"justifyContent": "space-between",
			"gap": "16px",
			"height": "52px",
			"padding": "0 12px",
			"borderBottom": f"1px solid {OUTLINE}",
			"backgroundColor": "#ffffff",
		},
		children=[*([back_link] if back else []), heading, right],
	)
