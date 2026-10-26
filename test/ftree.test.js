const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { build, render, collect, inject, iconFor, humanBytes } = require("../src");
const bin = path.join(__dirname, "../bin/ftree.js");
function fixture() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "ft-"));
  for (const f of ["src/a.js", "src/lib/b.ts", "src/lib/c.ts", "README.md", "z.txt", "node_modules/x/i.js", "dist/out.js", "secret.log"]) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), "12345"); }
  fs.writeFileSync(path.join(d, ".gitignore"), "*.log\n");
  return d;
}
test("render tree, dirs first, gitignore", () => {
  const d = fixture();
  const out = render(build(d, collect(d)));
  assert.equal(out.split("\n").slice(1).join("\n"), ["├── src/", "│   ├── lib/", "│   │   ├── b.ts", "│   │   └── c.ts", "│   └── a.js", "├── .gitignore", "├── README.md", "└── z.txt"].join("\n"));
});
test("depth collapses with counts, notes, ascii, sizes", () => {
  const d = fixture();
  const out = render(build(d, collect(d)), { depth: 1, notes: { src: "app code" }, ascii: true, sizes: true });
  assert.match(out, /\|-- src\/\s+15 B · 3 files  # app code/); assert.ok(!out.includes("b.ts"));
});
test("only + inject + helpers", () => {
  const d = fixture();
  assert.deepEqual(collect(d, { only: ["*.ts"] }), ["src/lib/b.ts", "src/lib/c.ts"]);
  assert.equal(inject("a\n<!-- tree -->\nold\n<!-- /tree -->\nb", "NEW"), "a\n<!-- tree -->\n```text\nNEW\n```\n<!-- /tree -->\nb");
  assert.equal(inject("no markers", "x"), null);
  assert.equal(iconFor("x.tsx", "file"), "🔷"); assert.equal(iconFor("a.test.ts", "file"), "🧪"); assert.equal(humanBytes(2048), "2.0 KB");
});
test("cli", () => {
  const d = fixture();
  const r = spawnSync("node", [bin, d, "--md"], { encoding: "utf8" }); assert.equal(r.status, 0); assert.match(r.stdout, /^```text\n/);
  assert.equal(JSON.parse(spawnSync("node", [bin, d, "--json"], { encoding: "utf8" }).stdout).files, 6);
  fs.writeFileSync(path.join(d, "DOC.md"), "<!-- tree -->\n<!-- /tree -->\n");
  assert.equal(spawnSync("node", [bin, d, "--inject", path.join(d, "DOC.md")]).status, 0);
  assert.match(fs.readFileSync(path.join(d, "DOC.md"), "utf8"), /README\.md/);
  assert.equal(spawnSync("node", [bin, "/nope"]).status, 2);
});
