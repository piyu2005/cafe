"""The Search page: people list, filtered as you type."""

from blocks import INK, MUTED, SURFACE_2, bind, block, html_el, raw_block, svg
from layout import crumb_current, crumb_link, crumb_separator, page_layout


def build_person_row():
	"""The template row of the list. Builder repeats it once per person in
	`data.people`, on the server, so the first paint already has the names. The
	look duplicates .mna-person in styles.css, which styles the rows that
	search.js creates while typing."""
	avatar_image = block(
		"img",
		"Avatar image",
		attrs={"src": "", "alt": ""},
		styles={"gridArea": "1 / 1", "width": "100%", "height": "100%", "objectFit": "cover"},
	)
	avatar_image["dynamicValues"] = [bind("user_image", "src", "attribute")]
	avatar_image["visibilityCondition"] = {"key": "user_image", "comesFrom": "dataScript"}
	# Both avatar children share one grid cell. On the page only one of them is
	# rendered; the editor canvas ignores the conditions and shows both.
	avatar_initial = block(
		"span", "Avatar initial", classes=["initial"], text="P", styles={"gridArea": "1 / 1"}
	)
	avatar_initial["dynamicValues"] = [bind("initial", "innerHTML", "key")]
	avatar_initial["visibilityCondition"] = {"key": "no_image", "comesFrom": "dataScript"}
	avatar = block(
		"span",
		"Avatar",
		["mna-avatar"],
		children=[avatar_image, avatar_initial],
		styles={
			"display": "grid",
			"placeItems": "center",
			"flexShrink": "0",
			"width": "32px",
			"height": "32px",
			"overflow": "hidden",
			"borderRadius": "9999px",
			"backgroundColor": SURFACE_2,
			"color": MUTED,
			"fontSize": "16px",
			"fontWeight": "500",
			"letterSpacing": "0.02em",
			"textTransform": "uppercase",
		},
	)
	name = block(
		"span",
		"Name",
		["mna-person-name"],
		text="Priyanshi Hodage",
		styles={
			"overflow": "hidden",
			"fontSize": "16px",
			"letterSpacing": "0.02em",
			"color": "#000000",
			"textOverflow": "ellipsis",
			"whiteSpace": "nowrap",
		},
	)
	name["dynamicValues"] = [bind("full_name", "innerHTML", "key")]
	row = block(
		"a",
		"Person",
		["mna-person"],
		attrs={"href": "/profile"},
		children=[avatar, name],
		styles={
			"display": "flex",
			"alignItems": "center",
			"gap": "12px",
			"height": "44px",
			"padding": "6px 8px",
			"borderRadius": "8px",
		},
	)
	row["dynamicValues"] = [bind("href", "href", "attribute")]
	return row


def build_search(shell_id, shell_block):
	search_box = raw_block(
		"Search box",
		svg("search", 16, MUTED).replace(
			'style="', 'style="position:absolute;top:6px;left:8px;pointer-events:none;', 1
		)
		+ html_el(
			"input",
			None,
			{
				"id": "mna-search-input",
				"type": "text",
				"placeholder": "Search",
				"aria-label": "Search writers",
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
		styles={"position": "relative", "display": "block", "marginTop": "8px"},
	)
	people = block(
		"div",
		"People",
		["mna-people"],
		attrs={"id": "mna-people", "aria-live": "polite"},
		styles={"display": "flex", "flexDirection": "column", "gap": "4px", "marginTop": "16px"},
		children=[build_person_row()],
	)
	people["isRepeaterBlock"] = True
	people["dataKey"] = bind("people", "innerHTML", "key")
	title = block(
		"h1",
		"Title",
		["mna-title"],
		text="Writers at Cafe",
		styles={
			"margin": "0",
			"fontFamily": "Newsreader",
			"fontSize": "32px",
			"fontWeight": "400",
			"lineHeight": "1.6",
			"letterSpacing": "0.015em",
			"color": "#000000",
		},
	)
	crumbs = [crumb_link("Cafe", "/"), crumb_separator(), crumb_current("Explore")]
	return page_layout(shell_id, shell_block, crumbs, [title, search_box, people], "640px")


# Runs on the server for every visit. Builder puts what it returns into the
# page as raw HTML (its template engine does not escape), and a name is chosen
# by the user, so every value that reaches the HTML is escaped here.
SEARCH_DATA_SCRIPT = """\
if frappe.session.user == "Guest":
    redirect("/login?redirect=/search")

people = frappe.call("cafe.api.list_people")
for person in people:
    identifier = person.get("username") or person.get("name")
    label = person.get("full_name") or identifier
    segment = identifier
    for char, code in (("%", "%25"), ("/", "%2F"), ("?", "%3F"), ("#", "%23"), ("\\\\", "%5C"), (" ", "%20")):
        segment = segment.replace(char, code)
    person["href"] = frappe.utils.escape_html("/profile/" + segment)
    person["full_name"] = frappe.utils.escape_html(label)
    person["initial"] = frappe.utils.escape_html(label.strip()[:1])
    image = person.get("user_image") or ""
    person["user_image"] = frappe.utils.escape_html(image) if image.startswith(("/", "https://", "http://")) else ""
    person["no_image"] = not person["user_image"]
data.people = people
"""
