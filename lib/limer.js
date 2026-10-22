// Everything the extension decides without VS Code: which folder is a
// Limekit project, where Limer's Python is, and what to run. Kept free of
// the `vscode` module so `node --test` can check it directly.

const fs = require("fs");
const path = require("path");

const STUBS_SUFFIX = "/limekit/runtime/lua/stubs";

// A line Limekit prints for a Lua error: the file relative to the project,
// its line, and the message -- "scripts/lib/helper.lua:4: attempt to ...".
const ERROR_LINE = /((?:scripts|[\w.-]+)\/[^\s:]+\.lua):(\d+):\s*(.*)$/;

function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return null;
    }
}

// The project folder holding `file`: the nearest folder above it with an
// app.json. A file outside any project gives null.
function findProject(file, stopAt) {
    let dir = fs.existsSync(file) && fs.statSync(file).isDirectory() ? file : path.dirname(file);
    const stop = stopAt ? path.resolve(stopAt) : null;
    for (;;) {
        if (fs.existsSync(path.join(dir, "app.json"))) return dir;
        const parent = path.dirname(dir);
        if (parent === dir || (stop && path.resolve(dir) === stop)) return null;
        dir = parent;
    }
}

// "2.0" for a Limekit 2.0 project, "1.x" for an older one, null if the
// folder is not a project at all.
function apiVersion(project) {
    const config = readJson(path.join(project, "app.json"));
    if (!config || typeof config !== "object") return null;
    return config.api === "2.0" ? "2.0" : "1.x";
}

// The interpreter inside a Limer folder, if there is one there.
function pythonInLimer(limer) {
    const candidates = process.platform === "win32"
        ? [path.join(limer, "python", "python.exe")]
        : [path.join(limer, "python", "bin", "python3"),
           path.join(limer, "Contents", "Resources", "python", "bin", "python3")];
    return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

// Limer writes a project's .luarc.json pointing at the stubs inside its own
// folder (.../Limer/python/Lib/site-packages/limekit/runtime/lua/stubs), so
// the project itself says where Limer is. Walk up from those stubs to the
// folder whose python/ holds the interpreter.
function limerFromLuarc(project) {
    const config = readJson(path.join(project, ".luarc.json"));
    if (!config) return null;
    const library = config["workspace.library"]
        || (config.workspace && config.workspace.library) || [];
    for (const entry of library) {
        if (typeof entry !== "string") continue;
        const normal = entry.replace(/\\/g, "/").replace(/\/+$/, "");
        if (!normal.endsWith(STUBS_SUFFIX)) continue;
        let dir = normal.slice(0, -STUBS_SUFFIX.length);
        for (let i = 0; i < 6; i += 1) {
            if (pythonInLimer(dir)) return dir;
            const parent = path.dirname(dir);
            if (parent === dir) break;
            dir = parent;
        }
    }
    return null;
}

// Where to run from, in order: the Limer folder set in settings, the one the
// project's .luarc.json points into, then a Python of the user's own -- the
// last only for people working on Limekit itself, who have it installed.
function resolvePython({ project, limerPath, pythonPath }) {
    if (limerPath) {
        const python = pythonInLimer(limerPath);
        if (python) return { python, bundled: true, limer: limerPath };
    }
    if (project) {
        const limer = limerFromLuarc(project);
        if (limer) return { python: pythonInLimer(limer), bundled: true, limer };
    }
    if (pythonPath) return { python: pythonPath, bundled: false, limer: null };
    return null;
}

// The command line that runs a project. Limer's own Python runs isolated
// (-I), so a PYTHONPATH or PYTHONHOME on the machine cannot leak in -- the
// same promise Limer makes. -u so print() reaches the terminal as it happens.
function runArgs(project, bundled) {
    return [...(bundled ? ["-I"] : []), "-u", "-m", "limekit", project];
}

// Writes or refreshes the project's .luarc.json through Limekit itself, so
// the extension and Limer can never disagree about what goes in it.
function editorSetupArgs(project) {
    return ["-I", "-c",
        "import sys; from limekit.services.editor import write_config; "
        + "write_config(sys.argv[1])", project];
}

function parseErrorLine(line) {
    const match = ERROR_LINE.exec(line);
    if (!match) return null;
    return { file: match[1], line: Number(match[2]), message: match[3] };
}

module.exports = {
    ERROR_LINE,
    apiVersion,
    editorSetupArgs,
    findProject,
    limerFromLuarc,
    parseErrorLine,
    pythonInLimer,
    resolvePython,
    runArgs,
};
