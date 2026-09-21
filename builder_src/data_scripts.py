"""Pieces shared by the pages' data scripts (the Python that runs on the server
for every visit).

Builder puts what a data script returns into the page as raw HTML, and its
template engine does not escape it. Names, bios and post text are chosen by
users, so every value that reaches the HTML is escaped by these helpers.

Server scripts have two limits that shape this code. The helper functions call
only builtins and `frappe`, because functions defined in a server script cannot
see each other. And the snippets are joined as text, so they share names."""

# Functions to call from the top level of a data script.
HELPERS = """\
def clean(value):
    return frappe.utils.escape_html(value or "")


def day_month_year(value):
    text = str(value)
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return months[int(text[5:7]) - 1] + " " + str(int(text[8:10])) + ", " + text[:4]


def plain_text(html):
    text = frappe.utils.strip_html(html or "")
    for entity, char in (("&nbsp;", " "), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"'), ("&#39;", "'"), ("&amp;", "&")):
        text = text.replace(entity, char)
    return text.strip()


def safe_url(value):
    value = value or ""
    return frappe.utils.escape_html(value) if value.startswith(("/", "https://", "http://")) else ""


def path_segment(value):
    for char, code in (("%", "%25"), ("/", "%2F"), ("?", "%3F"), ("#", "%23"), ("\\\\", "%5C"), (" ", "%20")):
        value = value.replace(char, code)
    return value


"""

# Turns `rows` (from list_profile_posts) into `posts`, the list the post rows show.
POST_ROWS = """\
posts = []
for row in rows:
    text = plain_text(row.get("content"))
    minutes = int(len(text.split()) / 200 + 0.5)
    if minutes < 1:
        minutes = 1
    comments = row.get("comment_count") or 0
    preview = row.get("excerpt") or (text[:140] + "\\u2026" if len(text) > 140 else text)
    thumbnail = row.get("cover_image") or (row.get("attachment") if row.get("post_type") == "Image" else "")
    posts.append({
        "href": "/posts/" + path_segment(row.name),
        "title": clean(row.get("display_title") or row.get("title") or "Untitled"),
        "excerpt": clean(preview),
        "meta": day_month_year(row.creation) + " \\u00b7 " + str(minutes) + " min read \\u00b7 " + str(comments) + (" comment" if comments == 1 else " comments"),
        "thumbnail": safe_url(thumbnail),
    })
"""


def indent(text, spaces):
	"""`text` with every non-empty line moved right, to slot it into an indented block."""
	pad = " " * spaces
	return "".join(pad + line if line.strip() else line for line in text.splitlines(True))


# In Builder's editor canvas the address has no username, and a list with no
# data shows no rows, so its row could not be seen or edited. These samples fill
# an empty list there. A real visit always has a username, so it never gets them.
SAMPLE_POST = """\
if not identifier and not posts:
    posts = [{"href": "/posts", "title": "Post title", "excerpt": "A short preview of the post.", "meta": "Sep 18, 2026 \\u00b7 1 min read \\u00b7 0 comments", "thumbnail": ""}]
"""

SAMPLE_WORK_AND_EDUCATION = """\
if not identifier and not work:
    work = [{"id": "", "is_own": is_own, "company": "Company", "title": "Title", "dates": "Jan 2020 \\u2014 Present", "show_dot": True, "description": "What I did there."}]
if not identifier and not education:
    education = [{"id": "", "is_own": is_own, "school": "School", "degree_line": "Degree, Field of study", "dates": "2016 \\u2014 2020", "show_dot": True}]
"""
