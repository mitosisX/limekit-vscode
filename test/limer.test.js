const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const limer = require("../lib/limer");

function tmp() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "limekit-vscode-"));
}

function write(file, text) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
}

// A fake unzipped Limer: python/python.exe (or bin/python3) and the stubs
// inside its site-packages, laid out as the portable build lays them out.
function fakeLimer(root) {
    const exe = process.platform === "win32"
        ? path.join(root, "python", "python.exe")
        : path.join(root, "python", "bin", "python3");
    write(exe, "");
    const site = process.platform === "win32"
        ? path.join(root, "python", "Lib", "site-packages")
        : path.join(root, "python", "lib", "python3.13", "site-packages");
    const stubs = path.join(site, "limekit", "runtime", "lua", "stubs");
    fs.mkdirSync(stubs, { recursive: true });
    return { exe, stubs: stubs.replace(/\\/g, "/") };
}

function fakeProject(root, api = "2.0") {
    write(path.join(root, "app.json"), JSON.stringify(api ? { name: "App", api } : { name: "App" }));
    write(path.join(root, "scripts", "main.lua"), "");
    return root;
}

test("a file inside a project finds that project", () => {
    const project = fakeProject(tmp());
    const file = path.join(project, "scripts", "main.lua");
    assert.strictEqual(limer.findProject(file), project);
});

test("a file outside any project finds none", () => {
    const dir = tmp();
    write(path.join(dir, "loose.lua"), "");
    assert.strictEqual(limer.findProject(path.join(dir, "loose.lua"), dir), null);
});

test("api 2.0 is 2.0; anything else is an older project", () => {
    assert.strictEqual(limer.apiVersion(fakeProject(tmp())), "2.0");
    assert.strictEqual(limer.apiVersion(fakeProject(tmp(), null)), "1.x");
    assert.strictEqual(limer.apiVersion(tmp()), null);
});

test("the project's .luarc.json leads to the Limer that wrote it", () => {
    const limerDir = path.join(tmp(), "Limer");
    const { exe, stubs } = fakeLimer(limerDir);
    const project = fakeProject(tmp());
    write(path.join(project, ".luarc.json"), JSON.stringify({ "workspace.library": [stubs] }));

    const found = limer.resolvePython({ project });
    assert.strictEqual(found.python, exe);
    assert.strictEqual(found.bundled, true);
});

test("the Limer folder in settings wins over the project's", () => {
    const chosen = path.join(tmp(), "Chosen");
    const { exe } = fakeLimer(chosen);
    const other = path.join(tmp(), "Other");
    const { stubs } = fakeLimer(other);
    const project = fakeProject(tmp());
    write(path.join(project, ".luarc.json"), JSON.stringify({ "workspace.library": [stubs] }));

    assert.strictEqual(limer.resolvePython({ project, limerPath: chosen }).python, exe);
});

test("a .luarc.json pointing at a Limer that has since moved is not trusted", () => {
    const project = fakeProject(tmp());
    write(path.join(project, ".luarc.json"), JSON.stringify({
        "workspace.library": ["C:/gone/Limer/python/Lib/site-packages/limekit/runtime/lua/stubs"],
    }));
    assert.strictEqual(limer.resolvePython({ project }), null);
});

test("a framework developer's own Python is the last resort, and not isolated", () => {
    const found = limer.resolvePython({ project: fakeProject(tmp()), pythonPath: "python" });
    assert.deepStrictEqual(found, { python: "python", bundled: false, limer: null });
    assert.deepStrictEqual(limer.runArgs("P", false), ["-u", "-m", "limekit", "P"]);
});

test("Limer's Python runs the project isolated, unbuffered", () => {
    assert.deepStrictEqual(limer.runArgs("P", true), ["-I", "-u", "-m", "limekit", "P"]);
});

test("Limekit's error lines are recognised, runtime and syntax alike", () => {
    assert.deepStrictEqual(
        limer.parseErrorLine("scripts/lib/helper.lua:4: attempt to index a nil value (local 'x')"),
        { file: "scripts/lib/helper.lua", line: 4, message: "attempt to index a nil value (local 'x')" });
    assert.deepStrictEqual(
        limer.parseErrorLine("scripts/main.lua:2: unexpected symbol near <eof>"),
        { file: "scripts/main.lua", line: 2, message: "unexpected symbol near <eof>" });
    assert.strictEqual(limer.parseErrorLine("hello from print()"), null);
});

test("package.json's problem matcher is the same pattern", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
    const pattern = manifest.contributes.problemMatchers[0].pattern.regexp;
    assert.strictEqual(new RegExp(pattern).source, limer.ERROR_LINE.source);
});
