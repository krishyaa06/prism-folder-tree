"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { walk, globToRe } = require("./walk");

/** Build a nested tree from relative file paths. */
function build(root, files, { sizes = true } = {}) {
  const tree = { name: path.basename(path.resolve(root)), type: "dir", children: new Map(), size: 0, files: 0 };
  for (const rel of files) {
    const parts = rel.split("/"); let node = tree;
    let size = 0; if (sizes) { try { size = fs.statSync(path.join(root, rel)).size; } catch {} }
    const chain = [tree];
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node.children.has(parts[i])) node.children.set(parts[i], { name: parts[i], type: "dir", children: new Map(), size: 0, files: 0 });
      node = node.children.get(parts[i]); chain.push(node);
    }
    node.children.set(parts.at(-1), { name: parts.at(-1), type: "file", size });
    for (const d of chain) { d.size += size; d.files++; }
  }
  return tree;
}
function sortKids(node, { dirsFirst = true, by = "name" } = {}) {
  return [...node.children.values()].sort((a, b) => (dirsFirst && a.type !== b.type ? (a.type === "dir" ? -1 : 1) : 0) || (by === "size" ? b.size - a.size : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })));
}
const ICONS = [[/\.(test|spec)\./, "🧪"], [/\.(m?jsx?|cjs)$/, "🟨"], [/\.tsx?$/, "🔷"], [/\.(css|scss|sass|less)$/, "🎨"], [/\.(html?|vue|svelte|astro)$/, "🌐"], [/\.(json|ya?ml|toml|ini|env.*)$|^\.env/, "🔧"], [/\.(md|mdx|txt|rst)$/i, "📝"], [/\.(png|jpe?g|gif|svg|webp|ico|avif)$/, "🌄"], [/\.py$/, "🐍"], [/\.(go)$/, "🐹"], [/\.rs$/, "🦀"], [/\.(sh|bash|zsh)$/, "💲"], [/^(Dockerfile|docker-compose.*)$/i, "🐳"], [/^(LICENSE|COPYING)/i, "📜"], [/\.(lock)$|-lock\.json$/, "🔒"], [/^\.git/, "🌿"]];
const iconFor = (n, type) => (type === "dir" ? "📁" : (ICONS.find(([re]) => re.test(n)) || [, "📄"])[1]);
function humanBytes(n) { if (n < 1024) return n + " B"; const u = ["KB", "MB", "GB"]; let i = -1; do { n /= 1024; i++; } while (n >= 1024 && i < 2); return n.toFixed(n < 10 ? 1 : 0) + " " + u[i]; }

/** Render as lines. opts: depth, icons, sizes, style ('unicode'|'ascii'), notes {name: comment}, color fns */
function render(tree, o = {}) {
  const { depth = Infinity, icons = false, sizes = false, ascii = false, notes = {}, slash = true, paint = {}, counts = true } = o;
  const P = ascii ? { t: "|-- ", l: "`-- ", v: "|   ", s: "    " } : { t: "├── ", l: "└── ", v: "│   ", s: "    " };
  const dim = paint.dim || ((s) => s), dir = paint.dir || ((s) => s), note = paint.note || dim;
  const lines = [{ text: dir(tree.name + (slash ? "/" : "")), plain: tree.name + "/" }];
  (function rec(node, prefix, lvl) {
    const kids = sortKids(node, o);
    kids.forEach((k, i) => {
      const last = i === kids.length - 1;
      const collapsed = k.type === "dir" && lvl + 1 >= depth && k.children.size;
      const name = k.name + (k.type === "dir" && slash ? "/" : "");
      const ic = icons ? iconFor(k.name, k.type) + " " : "";
      const meta = [sizes ? humanBytes(k.size) : "", collapsed && counts ? `${k.files} files` : ""].filter(Boolean).join(" · ");
      const n = notes[k.name] || notes[relOf(k)];
      lines.push({ prefix: prefix + (last ? P.l : P.t), name: ic + (k.type === "dir" ? dir(name) : name), plainName: ic + name, meta, note: n });
      if (k.type === "dir" && !collapsed) { k._parent = node; rec(k, prefix + (last ? P.s : P.v), lvl + 1); }
    });
  })(tree, "", 0);
  function relOf() { return null; }
  // align notes/meta in a column
  const w = Math.max(0, ...lines.slice(1).map((l) => (l.prefix + l.plainName).length));
  return lines.map((l, i) => i === 0 ? l.text : dim(l.prefix) + l.name + (l.meta || l.note ? " ".repeat(w - (l.prefix + l.plainName).length + 2) + [l.meta && dim(l.meta), l.note && note("# " + l.note)].filter(Boolean).join("  ") : "")).join("\n");
}
function toJSON(node) { return node.type === "file" ? { name: node.name, type: "file", size: node.size } : { name: node.name, type: "dir", size: node.size, files: node.files, children: sortKids(node).map(toJSON) }; }
function collect(root, { all = false, gitignore = true, exclude = [], only = [], maxFiles = 20000 } = {}) {
  let files = walk(root, { useGitignore: gitignore && !all, extraIgnore: exclude, maxFiles });
  if (all) { /* walk always skips .git/node_modules; that's intentional */ }
  if (only.length) { const res = only.map((g) => new RegExp(`(^|/)${globToRe(g)}$`)); files = files.filter((f) => res.some((r) => r.test(f))); }
  return files;
}
/** Replace the tree between <!-- tree --> markers in a markdown file. */
function inject(md, block) {
  const re = /(<!--\s*tree(?:[^>]*)?-->)[\s\S]*?(<!--\s*\/tree\s*-->)/;
  if (!re.test(md)) return null;
  return md.replace(re, `$1\n\`\`\`text\n${block}\n\`\`\`\n$2`);
}
module.exports = { build, render, toJSON, collect, inject, iconFor, humanBytes, sortKids };
