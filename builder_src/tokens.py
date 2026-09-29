"""Builder Token records for the app's Espresso color tokens.

These are a separate thing from the hand-written CSS custom properties in
styles.css's `:root` block, which they're kept in exact sync with (same
names, same values). styles.css's `var(--ink-gray-9)` syntax is what the
PUBLISHED site actually loads; these records are what makes the SAME names
available in Builder's own visual editor - its color-token picker reads
from the "Builder Token" doctype, not from any stylesheet, so a page/block
edited visually had no Espresso tokens to choose from until these exist.

`group` values and `token_name` labels mirror frappe-ui's own real token
grouping (tailwind/tokens/colors.js: ink-gray-*/surface-gray-*/outline-gray-*
families), not something invented for this file.
"""

TOKENS = [
	("ink-base", "Ink Base", "#ffffff", "Ink"),
	("ink-gray-9", "Ink Gray 9", "#0f0f0f", "Ink"),
	("ink-gray-8", "Ink Gray 8", "#171717", "Ink"),
	("ink-gray-7", "Ink Gray 7", "#383838", "Ink"),
	("ink-gray-6", "Ink Gray 6", "#525252", "Ink"),
	("ink-gray-5", "Ink Gray 5", "#7c7c7c", "Ink"),
	("ink-gray-4", "Ink Gray 4", "#999999", "Ink"),
	("ink-gray-3", "Ink Gray 3", "#c8c8c8", "Ink"),
	("surface-base", "Surface Base", "#ffffff", "Surface"),
	("surface-gray-1", "Surface Gray 1", "#f8f8f8", "Surface"),
	("surface-gray-2", "Surface Gray 2", "#f3f3f3", "Surface"),
	("surface-gray-3", "Surface Gray 3", "#ededed", "Surface"),
	("surface-gray-9", "Surface Gray 9", "#383838", "Surface"),
	("surface-gray-10", "Surface Gray 10", "#171717", "Surface"),
	("outline-gray-1", "Outline Gray 1", "#ededed", "Outline"),
	("outline-gray-2", "Outline Gray 2", "#e2e2e2", "Outline"),
	("outline-gray-3", "Outline Gray 3", "#c8c8c8", "Outline"),
	("outline-gray-4", "Outline Gray 4", "#999999", "Outline"),
	("outline-gray-6", "Outline Gray 6", "#525252", "Outline"),
]


def builder_token(name, token_name, value, group, now):
	return {
		"creation": now,
		"dark_value": None,
		"docstatus": 0,
		"doctype": "Builder Token",
		"group": group,
		"idx": 0,
		"is_standard": 1,
		"modified": now,
		"modified_by": "Administrator",
		"name": name,
		"owner": "Administrator",
		"token_name": token_name,
		"type": "Color",
		"value": value,
	}
