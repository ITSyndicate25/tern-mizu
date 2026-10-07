# tern-mizu

Mizu Icons, the VS Code file icon theme, painted over Tern's Files pane.

Tern lets a plugin sheet restyle the file tree: every row and icon box
carries `data-name`, `data-ext`, `data-kind` and `data-open`, and a sheet
can paint the icon box with an SVG from the plugin directory. This plugin
turns that hook into the full Mizu set: 893 icons covering 847 file names,
947 extensions and 1457 folder names.

## Requirements

- Tern 0.5.3 or later, for the Files-pane icon hooks.
- Nothing else: the package is a generated sheet plus the SVG files, with
  no runtime code of its own and no network use once installed.

## Install

    tern plugin install github.com/ITSyndicate25/tern-mizu

To work from a clone instead:

    git clone https://github.com/ITSyndicate25/tern-mizu.git
    tern plugin link tern-mizu

Tern reloads the daemon's plugins on install or link, and watches the
plugin folder afterwards. Check it loaded:

    tern plugin list
    # mizu-icons 2.10.1 Mizu Icons — 0 blocks, 0 lenses, window  ready

A package that cannot load prints a `problem` line with the reason instead.

Remove it with `tern plugin unlink mizu-icons` after a link, or
`tern plugin remove mizu-icons` after an install.

## Usage

Nothing to configure. Open a Files pane and the sheet applies to every
pane, local and remote roots alike, wherever Tern's `.ft-ic` attributes
reach.

Icons still the defaults? Check, in order: `tern plugin list` says `ready`
(not `disabled` or `failed`), Preferences › Plugins shows the plugin on,
and Tern is 0.5.3 or later.

## Icon resolution

The sheet follows VS Code's lookup order, from most to least specific:

1. exact file name (`fileNames`)
2. longest extension suffix, so `types.d.ts` uses the `.d.ts` icon instead
   of the plain TypeScript one
3. extension (`fileExtensions`)
4. the defaults `file`, `folder` and `folderExpanded`

Folders get separate closed and open icons. The generator drops any rule
that would repaint a default icon, which leaves the sheet at 231,529 bytes,
under Tern's 256 KiB cap for manifest styles.

## Repository layout

| Path | Contents |
| --- | --- |
| `plugin.toml` | Tern manifest. One style sheet, no logic. |
| `mizu.css` | 1023 generated rules. |
| `icons/` | 893 generated SVGs, copied from the Mizu theme. |
| `window.luau` | Empty entry. A package must name a host or window entry. |
| `tools/gen.mjs` | Regenerates the sheet and the icons. |
| `LICENSE` | MIT, this repository. |
| `LICENSE.txt` | MIT, the upstream Mizu icons. |

## Regenerating

You need Bun and the Mizu Icons VS Code extension.

    bun tools/gen.mjs

The generator reads the newest `*.mizu-*` extension under
`~/.vscode/extensions` and rewrites `mizu.css` and `icons/`. It prints
rule counts, sheet bytes and the theme keys it skipped. Options:
`--theme DIR`, `--plugin DIR` (default: this repository) and `--quoted`.

Regeneration is safe while Tern runs: only changed files are rewritten,
each icon is written to a temporary name and renamed over the old one, and
stale icons are deleted after the sheet. A watcher reload at any point
reads either the old or the new package, never a half-written one.

## Credits

The icons and the name/extension mapping come from
[Mizu Icons](https://github.com/m39u/mizu), MIT licensed. The sheet was
generated from the `cdfzo.mizu-2.10.1` VS Code extension.

The plugin format and the Files-pane hooks belong to
[Stencil Tern](https://stencil.so/tern); see the
[plugin docs](https://docs.stencil.so/tern/).

## License

MIT, see `LICENSE`. The bundled icons keep their upstream license in
`LICENSE.txt`.
