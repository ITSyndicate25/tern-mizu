#!/usr/bin/env bun
// Generates the Tern plugin from a VS Code icon theme directory
// (`icon-theme.json` + `i/*.svg`), the way the Tern docs describe in
// "File icons" (guides/chrome.md): one CSS sheet that paints `.ft-ic`
// backgrounds and hides the stock glyph.
//
//   bun tools/gen.mjs [--theme DIR] [--plugin DIR] [--quoted]
//
// Defaults: the newest `*.mizu-*` extension under ~/.vscode/extensions,
// and the plugin directory one level above tools/. `--quoted` keeps quotes
// around every attribute value; the default drops them where CSS allows an
// identifier.
//
// The sheet fits Tern's 256 KiB `styles` cap by exploiting what the pane's
// attributes already separate:
//   - extension rules need no `data-kind` (a folder's `data-ext` is empty);
//   - open-folder rules need no `data-kind` (only folder rows carry
//     `data-open`), and sit after the open-folder default, which sits after
//     the closed name rules, so every tie resolves the VS Code way;
//   - a rule that reaches the same icon as the rules below it is dropped.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const out = (line) => process.stdout.write(line + "\n");

const pluginDir = resolve(opt("--plugin", join(import.meta.dir, "..")));

const findTheme = () => {
  const base = join(homedir(), ".vscode", "extensions");
  const hits = readdirSync(base)
    .filter((n) => /\.mizu-\d/.test(n))
    .map((n) => ({ n, mtime: statSync(join(base, n)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (hits.length === 0) throw new Error(`no *.mizu-* extension under ${base}`);
  return join(base, hits[0].n);
};
const themeDir = resolve(opt("--theme", findTheme()));
const quoted = args.includes("--quoted");

const theme = JSON.parse(readFileSync(join(themeDir, "icon-theme.json"), "utf8"));
const defs = theme.iconDefinitions;
if (!defs) throw new Error("icon-theme.json has no iconDefinitions");
const iconOf = (id) => {
  const rel = defs[id]?.iconPath;
  if (!rel) throw new Error(`icon id ${id} has no definition`);
  if (!existsSync(join(themeDir, rel))) throw new Error(`missing icon file: ${rel}`);
  return rel;
};

// Tern matches names lowercased, so the sheet does too. A theme key that
// collides after lowercasing keeps the later entry; count them.
const lower = (map) => {
  const out = new Map();
  let collisions = 0;
  for (const [key, value] of Object.entries(map ?? {})) {
    const k = key.toLowerCase();
    if (out.has(k)) collisions += 1;
    out.set(k, value);
  }
  return { map: out, collisions };
};

const fileNames = lower(theme.fileNames);
const folderNames = lower(theme.folderNames);
const folderExpanded = lower(theme.folderNamesExpanded);
const fileExt = lower(theme.fileExtensions);

const IDENT = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const attr = (name, value) =>
  !quoted && IDENT.test(value)
    ? `[${name}=${value}]`
    : `[${name}='${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}']`;

const iconFile = iconOf(theme.file);
const iconDir = iconOf(theme.folder);
const iconDirOpen = theme.folderExpanded === undefined ? iconDir : iconOf(theme.folderExpanded);

// What `data-ext` holds: text after the last dot, empty for dotfiles and
// names with no dot or a trailing dot (the docs' definition).
const extOf = (name) => {
  const i = name.lastIndexOf(".");
  return i <= 0 || i === name.length - 1 ? "" : name.slice(i + 1);
};
const extIcon = (ext) => {
  const id = fileExt.map.get(ext);
  return id === undefined ? iconFile : iconOf(id);
};

// Multi-dot extension keys ("tar.gz") match a name's tail, longest first.
const multi = [];
for (const [key, id] of fileExt.map) {
  if (key.includes(".") && !key.startsWith(".") && !key.endsWith(".")) multi.push({ key, icon: iconOf(id) });
}
multi.sort((a, b) => a.key.length - b.key.length || (a.key < b.key ? -1 : 1));
const suffixMatches = (name) => multi.filter(({ key }) => name.endsWith(`.${key}`));

// The icon a file name lands on when no exact-name rule matches it.
const routedIcon = (name) => {
  const hit = suffixMatches(name);
  return hit.length > 0 ? hit[hit.length - 1].icon : extIcon(extOf(name));
};

const rows = []; // { section, selector, icon } in cascade order
const add = (section, selector, icon) => rows.push({ section, selector, icon });
const PREFIX = ".ft-ic";
const skipped = { folders: 0, ext: 0, suffix: 0, names: 0 };

// Defaults: file rows, closed folders; then closed folder names; then the
// open-folder default; then open folder names, extension rules, suffix
// rules and exact names. Sheet order resolves every tie the VS Code way.
add("d", `${PREFIX}${attr("data-kind", "file")}`, iconFile);
add("d", `${PREFIX}${attr("data-kind", "dir")}`, iconDir);
for (const [name, id] of folderNames.map) {
  const closed = iconOf(id);
  if (closed === iconDir) skipped.folders += 1;
  else add("fc", `${PREFIX}${attr("data-kind", "dir")}${attr("data-name", name)}`, closed);
}
add("d2", `${PREFIX}${attr("data-kind", "dir")}${attr("data-open", "true")}`, iconDirOpen);
for (const [name, id] of folderNames.map) {
  const open = iconOf(folderExpanded.map.get(name) ?? id);
  if (open === iconDirOpen) skipped.folders += 1;
  else add("fo", `${PREFIX}${attr("data-open", "true")}${attr("data-name", name)}`, open);
}
for (const [key, id] of fileExt.map) {
  if (key === "" || key.includes(".")) continue;
  const icon = iconOf(id);
  if (icon === iconFile) skipped.ext += 1;
  else add("e", `${PREFIX}${attr("data-ext", key)}`, icon);
}
for (const { key, icon } of multi) {
  if (icon === extIcon(key.slice(key.lastIndexOf(".") + 1))) skipped.suffix += 1;
  else add("x", `${PREFIX}${attr("data-kind", "file")}${attr("data-name$", `.${key}`)}`, icon);
}
for (const [name, id] of fileNames.map) {
  const icon = iconOf(id);
  if (icon === routedIcon(name)) skipped.names += 1;
  else add("n", `${PREFIX}${attr("data-kind", "file")}${attr("data-name", name)}`, icon);
}

// Emit: grouped by icon inside a section, sections in cascade order.
// The suffix section keeps one rule per key (never merged) so that the
// longest matching key is always the last matching rule.
const lines = [`${PREFIX}[data-kind]>svg.ico{display:none}`];
const used = new Map(); // icon -> sheet path
const urlOf = (icon) => `icons/${icon.replace(/^i\//, "")}`;
let index = 0;
while (index < rows.length) {
  const section = rows[index].section;
  if (section === "x") {
    for (; index < rows.length && rows[index].section === "x"; index += 1) {
      const row = rows[index];
      used.set(row.icon, urlOf(row.icon));
      lines.push(`${row.selector}{background-image:url(${used.get(row.icon)})}`);
    }
    continue;
  }
  const byIcon = new Map();
  for (; index < rows.length && rows[index].section === section; index += 1) {
    const row = rows[index];
    if (!byIcon.has(row.icon)) byIcon.set(row.icon, []);
    byIcon.get(row.icon).push(row.selector);
  }
  for (const [icon, selectors] of byIcon) {
    used.set(icon, urlOf(icon));
    lines.push(`${selectors.join(",")}{background-image:url(${used.get(icon)})}`);
  }
}

const css = lines.join("\n") + "\n";
const bytes = Buffer.byteLength(css);
const limit = 256 * 1024;

// Copy the icons the sheet references. A live window's watcher reloads the
// plugin when these files change, so each icon is written beside its name
// and renamed over it (a reload mid-build reads old or new, never a gap),
// and stale icons are dropped only once every current one is in place. A
// legacy `shape-rendering="optimizeQuality"` (some brand icons carry it) is
// not a value usvg accepts, and Tern logs a warning for it; drop it.
const iconsDir = join(pluginDir, "icons");
mkdirSync(iconsDir, { recursive: true });
let patched = 0;
let rewritten = 0;
const wanted = new Set();
for (const icon of used.keys()) {
  const name = icon.replace(/^i\//, "");
  wanted.add(name);
  const path = join(iconsDir, name);
  const text = readFileSync(join(themeDir, icon), "utf8");
  const fixed = text.includes('shape-rendering="') ? text.replace(/\s*shape-rendering="[^"]*"/g, "") : text;
  if (fixed !== text) patched += 1;
  if (existsSync(path) && readFileSync(path, "utf8") === fixed) continue;
  rewritten += 1;
  writeFileSync(`${path}.tmp`, fixed);
  renameSync(`${path}.tmp`, path);
}
if (existsSync(join(themeDir, "LICENSE.txt"))) copyFileSync(join(themeDir, "LICENSE.txt"), join(pluginDir, "LICENSE.txt"));
const cssPath = join(pluginDir, "mizu.css");
if (!existsSync(cssPath) || readFileSync(cssPath, "utf8") !== css) writeFileSync(cssPath, css);
for (const name of readdirSync(iconsDir)) if (!wanted.has(name)) rmSync(join(iconsDir, name), { force: true });

out(`theme:   ${themeDir}`);
out(`plugin:  ${pluginDir}`);
out(`rules:   ${lines.length - 1}, bytes: ${bytes} (${(bytes / limit * 100).toFixed(1)}% of ${limit})`);
out(`icons:   ${used.size} referenced (${patched} shape-rendering dropped, ${rewritten} rewritten)`);
out(`quoted:  ${quoted}`);
out(
  `keys:    files ${fileNames.map.size} (${fileNames.collisions} collisions, ${skipped.names} skipped), ` +
    `folders ${folderNames.map.size} (${skipped.folders} skipped), ` +
    `ext ${skipped.ext} skipped, suffix ${skipped.suffix} skipped`,
);
