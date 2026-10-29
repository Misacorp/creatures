# The phone reader

`build.py` turns this folder's markdown into one phone-friendly HTML page (Misa reads the plan on his phone): `python3 docs/design/valley/reader/build.py <out.html>`, then publish `<out.html>` as the Claude artifact "Valley Plan" (same artifact each time; its link is in `../log.md`). `shell.html` is the page around the content (fonts, palette, tabs). Republish after any change to the plan's docs. Dev-only: nothing here ships.
