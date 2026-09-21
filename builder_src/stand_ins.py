"""The still pictures Builder's editor and the folder thumbnails show for the
Messages and Write pages. Neither runs the page's scripts, so the pages start
with these and the scripts replace them. Also the paths of the built assets."""

from pathlib import Path

from blocks import GRAY_4, INK, INK_BLACK, MUTED, OUTLINE, SURFACE_2, html_el, svg, text_style

ASSETS = Path(__file__).resolve().parent.parent / "cafe" / "public" / "builder_assets"
ASSETS_URL = "/assets/cafe/builder_assets/"


def pill(label, solid=False):
	"""A header button, drawn like frappe-ui's small Button."""
	styles = {
		"display": "inline-flex",
		"alignItems": "center",
		"height": "28px",
		"padding": "0 8px",
		"borderRadius": "8px",
		"fontSize": "14px",
		"letterSpacing": "0.02em",
	}
	styles.update(
		{"backgroundColor": INK, "color": "#ffffff"}
		if solid
		else {"border": "1px solid #e2e2e2", "color": INK}
	)
	return html_el("span", None, None, styles, text=label)


def header_bar(title, buttons):
	crumbs = html_el(
		"div",
		None,
		None,
		{
			"display": "flex",
			"gap": "4px",
			"fontSize": "16px",
			"fontWeight": "500",
			"letterSpacing": "0.015em",
			"color": MUTED,
		},
		[
			html_el("span", text="Cafe"),
			html_el("span", None, None, {"color": GRAY_4}, text="/"),
			html_el("span", None, None, {"color": INK_BLACK}, text=title),
		],
	)
	return html_el(
		"div",
		None,
		None,
		{
			"display": "flex",
			"alignItems": "center",
			"justifyContent": "space-between",
			"height": "48px",
			"flexShrink": "0",
			"padding": "0 20px",
			"borderBottom": f"1px solid {OUTLINE}",
		},
		[crumbs, html_el("div", None, None, {"display": "flex", "gap": "8px"}, buttons)],
	)


def write_body():
	icons = "".join(
		svg(name, 16, MUTED)
		for name in (
			"bold",
			"italic",
			"underline",
			"strikethrough",
			"heading",
			"quote",
			"list",
			"list-ordered",
			"align-left",
			"image",
			"link",
		)
	)
	toolbar = html_el(
		"div",
		None,
		None,
		{
			"display": "flex",
			"gap": "14px",
			"alignItems": "center",
			"width": "fit-content",
			"padding": "11px 16px",
			"border": "1px solid #e2e2e2",
			"borderRadius": "9999px",
		},
		[icons],
	)
	title = html_el(
		"div",
		None,
		None,
		{"marginTop": "16px", **text_style(30, "600", GRAY_4, "0", "1.25")},
		text="Give your story a title",
	)
	story = html_el(
		"div",
		None,
		None,
		{"marginTop": "16px", **text_style(16, "420", GRAY_4, "0.02em", "1.6")},
		text="Tell your story\u2026",
	)
	return html_el(
		"div",
		None,
		None,
		{"width": "100%", "maxWidth": "600px", "margin": "0 auto", "padding": "40px 0"},
		[toolbar, title, story],
	)


def chat_panes():
	bars = "".join(
		html_el(
			"div",
			None,
			None,
			{"display": "flex", "gap": "12px", "alignItems": "center", "padding": "10px 12px"},
			[
				html_el(
					"span",
					None,
					None,
					{
						"width": "24px",
						"height": "24px",
						"borderRadius": "9999px",
						"backgroundColor": SURFACE_2,
					},
				),
				html_el(
					"div",
					None,
					None,
					{"flex": "1"},
					[
						html_el(
							"div",
							None,
							None,
							{
								"width": "50%",
								"height": "10px",
								"borderRadius": "5px",
								"backgroundColor": SURFACE_2,
							},
						),
						html_el(
							"div",
							None,
							None,
							{
								"width": "75%",
								"height": "8px",
								"marginTop": "8px",
								"borderRadius": "4px",
								"backgroundColor": SURFACE_2,
							},
						),
					],
				),
			],
		)
		for _ in range(4)
	)
	search = html_el(
		"div",
		None,
		None,
		{"padding": "12px", "borderBottom": f"1px solid {OUTLINE}"},
		[html_el("div", None, None, {"height": "28px", "borderRadius": "8px", "backgroundColor": SURFACE_2})],
	)
	left = html_el(
		"div",
		None,
		None,
		{"width": "320px", "flexShrink": "0", "borderRight": f"1px solid {OUTLINE}"},
		[search, bars],
	)
	right = html_el(
		"div",
		None,
		None,
		{"flex": "1", "display": "grid", "placeItems": "center", **text_style(14, "420", "#525252")},
		text="Select a conversation to start messaging.",
	)
	return html_el(
		"div",
		None,
		None,
		{"display": "flex", "flex": "1", "minHeight": "0", "width": "100%", "height": "100%"},
		[left, right],
	)
