#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { parseArgs } = require("node:util");
const { build, render, toJSON, collect, inject, humanBytes } = require("../src");
const { c, header, plural } = require("../src/ui");
const pkg = require("../package.json");

const HELP = `${header("ftree", "project trees for terminals and READMEs")}

${c.bold("Usage")}
  ftree [dir] [options]

${c.bold("Options")}
  -d, --depth <n>        max depth (deeper folders are collapsed with a file count)
  -i, --icons            file-type icons
  -s, --sizes            file + folder sizes
      --sort <by>        name | size                 (default: name, folders first)
  -e, --exclude <glob>   extra ignore patterns (repeatable), e.g. -e "*.test.js"
      --only <glob>      only show matching files, e.g. --only "*.ts"
  -n, --note <k=v>       annotate an entry, e.g. -n "src=app code" (repeatable)
      --ascii            |-- instead of ├──
      --md               wrap in a \`\`\`text block for READMEs
      --inject <file>    write into <!-- tree --> … <!-- /tree --> in a file
  -c, --copy             copy to clipboard
      --json             nested JSON
      --no-gitignore     include gitignored files
  -v, --version / -h, --help`;

let a;
try { a = parseArgs({ allowPositionals: true, options: { depth: { type: "string", short: "d" }, icons: { type: "boolean", short: "i" }, sizes: { type: "boolean", short: "s" }, sort: { type: "string", default: "name" }, exclude: { type: "string", short: "e", multiple: true }, only: { type: "string", multiple: true }, note: { type: "string", short: "n", multiple: true }, ascii: { type: "boolean" }, md: { type: "boolean" }, inject: { type: "string" }, copy: { type: "boolean", short: "c" }, json: { type: "boolean" }, "no-gitignore": { type: "boolean" }, version: { type: "boolean", short: "v" }, help: { type: "boolean", short: "h" } } }); }
catch (e) { console.error(c.red(`✖ ${e.message}`)); process.exit(2); }
const o = a.values;
if (o.help) { console.log(HELP); process.exit(0); }
if (o.version) { console.log(pkg.version); process.exit(0); }
const root = path.resolve(a.positionals[0] || ".");
if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) { console.error(c.red(`✖ Not a directory: ${root}`)); process.exit(2); }
if (o.depth != null && !(+o.depth >= 1)) { console.error(c.red("✖ --depth must be ≥ 1")); process.exit(2); }

const files = collect(root, { gitignore: !o["no-gitignore"], exclude: o.exclude || [], only: o.only || [] });
const tree = build(root, files, { sizes: true });
if (o.json) { console.log(JSON.stringify(toJSON(tree), null, 2)); process.exit(0); }
const notes = Object.fromEntries((o.note || []).map((s) => { const i = s.indexOf("="); return [s.slice(0, i).replace(/\/$/, ""), s.slice(i + 1)]; }));
const opts = { depth: o.depth ? +o.depth : Infinity, icons: o.icons, sizes: o.sizes, ascii: o.ascii, notes, by: o.sort, dirsFirst: true };
const plain = render(tree, opts);
const block = o.md ? "```text\n" + plain + "\n```" : plain;

if (o.inject) {
  const f = path.resolve(o.inject); if (!fs.existsSync(f)) { console.error(c.red(`✖ ${o.inject} not found`)); process.exit(2); }
  const out = inject(fs.readFileSync(f, "utf8"), plain);
  if (out == null) { console.error(c.yellow(`⚠ No <!-- tree --> … <!-- /tree --> markers in ${o.inject}`)); process.exit(1); }
  fs.writeFileSync(f, out); console.log(`${c.green("✔")} Updated tree in ${c.bold(o.inject)} (${plural(files.length, "file")})`); process.exit(0);
}
if (o.copy) {
  const { execSync } = require("node:child_process");
  const cmds = process.platform === "darwin" ? ["pbcopy"] : process.platform === "win32" ? ["clip"] : ["wl-copy", "xclip -selection clipboard", "xsel --clipboard --input"];
  let ok = false; for (const cmd of cmds) { try { execSync(cmd, { input: block, stdio: ["pipe", "ignore", "ignore"] }); ok = true; break; } catch {} }
  if (!ok) { console.error(c.yellow("⚠ No clipboard tool found — printing instead")); console.log(block); process.exit(1); }
  console.log(`${c.green("✔")} Copied ${plural(files.length, "file")} to the clipboard`); process.exit(0);
}
if (o.md || !process.stdout.isTTY && !process.env.FORCE_COLOR) { console.log(block); process.exit(0); }
console.log(render(tree, { ...opts, paint: { dim: c.gray, dir: (s) => c.bold(c.accent(s)), note: c.green } }));
const dirs = (function count(n) { let k = 0; for (const x of n.children.values()) if (x.type === "dir") k += 1 + count(x); return k; })(tree);
console.log(`\n${c.dim(`${plural(dirs, "folder")}, ${plural(files.length, "file")} · ${humanBytes(tree.size)}`)}`);
