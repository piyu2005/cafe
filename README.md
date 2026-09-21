# Cafe

A place to write, share and talk. Cafe is a Frappe app whose whole frontend is
made of [Frappe Builder](https://github.com/frappe/builder) pages: home feed,
search, profiles, posts, the post editor, publications, messages, notifications
and settings. The Python side (`cafe/`) holds the doctypes and the whitelisted
methods the pages call. There is no separate frontend app.

## Install

```bash
bench get-app <path or url of this repository>
bench --site <site> install-app cafe
```

Builder must be installed on the bench (`required_apps` does this). On
`bench migrate` the app imports its Builder pages, scripts and fonts from
`cafe/builder_files/`.

## How the pages are made

The Builder pages, components and client scripts in `cafe/builder_files/` are
generated. Edit the sources in `builder_src/` (Python that describes each page,
plus one plain JavaScript or CSS file per script) and run:

```bash
python3 builder_src/generate.py
bench --site <site> migrate      # imports what changed
```

`generate.py` needs the icons and the socket client from `vendor_src/`:

```bash
cd vendor_src && yarn install
```

## Browser bundles

Three small bundles are built from `vendor_src/` with esbuild and committed to
`cafe/public/builder_assets/vendor/`: the post editor, the chat composer and
the code colours. Rebuild them after changing their entry files or upgrading a
package:

```bash
cd vendor_src && yarn build
```

## Tests and checks

```bash
bench --site <site> set-config allow_tests true
bench --site <site> run-tests --app cafe
```

The GitHub workflows run the server tests, pre-commit (ruff, prettier,
ESLint), Semgrep with Frappe's rules, `pip-audit` and `yarn audit`
(`vendor_src`). To run the same linters locally: `pre-commit run --all-files`.

## License

AGPL-3.0. See `license.txt`.
