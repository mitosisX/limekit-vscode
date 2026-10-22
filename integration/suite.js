// Inside VS Code: open the project, press Run, and check what came back.

const vscode = require("vscode");
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const project = process.env.LK_PROJECT;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextRunEnds(timeout = 90000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("the app never finished")), timeout);
        const sub = vscode.tasks.onDidEndTaskProcess((event) => {
            if (event.execution.task.source !== "Limekit") return;
            clearTimeout(timer);
            sub.dispose();
            resolve(event.exitCode);
        });
    });
}

async function check(name, body) {
    try {
        await body();
        console.log(`  ok   ${name}`);
    } catch (error) {
        console.log(`  FAIL ${name}: ${error.message}`);
        throw error;
    }
}

exports.run = async () => {
    const config = vscode.workspace.getConfiguration("limekit");
    const main = path.join(project, "scripts", "main.lua");
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(main));
    await vscode.extensions.getExtension("OmegaMsiska.limekit-vscode").activate();

    await check("the Run command exists", async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes("limekit.run"));
        assert.ok(commands.includes("limekit.stop"));
    });

    await check("Run, with Limer's own Python, reports the error on the right file and line", async () => {
        await config.update("limerPath", process.env.LK_LIMER, vscode.ConfigurationTarget.Global);
        const ended = nextRunEnds();
        await vscode.commands.executeCommand("limekit.run");
        assert.notStrictEqual(await ended, 0, "a failing app should exit non-zero");
        await sleep(1500);

        const helper = vscode.Uri.file(path.join(project, "scripts", "lib", "helper.lua"));
        const problems = vscode.languages.getDiagnostics(helper).filter((d) => d.source === "Limekit");
        assert.strictEqual(problems.length, 1, "expected one Limekit problem on helper.lua");
        assert.strictEqual(problems[0].range.start.line, 3);     // line 4, 0-based
        assert.match(problems[0].message, /attempt to index a nil value/);
    });

    await check("fixing the bug and running again clears the problem", async () => {
        fs.writeFileSync(main,
            'local sys = require("limekit.sys")\nprint("RAN-OK")\n'
            + "sys.Timer.singleShot(300, function() sys.System.exit(0) end)\n");
        const ended = nextRunEnds();
        await vscode.commands.executeCommand("limekit.run");
        assert.strictEqual(await ended, 0);
        await sleep(1000);
        const helper = vscode.Uri.file(path.join(project, "scripts", "lib", "helper.lua"));
        const left = vscode.languages.getDiagnostics(helper).filter((d) => d.source === "Limekit");
        assert.strictEqual(left.length, 0);
    });

    if (process.env.LK_DEV_PYTHON) {
        await check("Run writes .luarc.json so completion works", async () => {
            await config.update("limerPath", "", vscode.ConfigurationTarget.Global);
            await config.update("pythonPath", process.env.LK_DEV_PYTHON, vscode.ConfigurationTarget.Global);
            const luarc = path.join(project, ".luarc.json");
            if (fs.existsSync(luarc)) fs.unlinkSync(luarc);
            const ended = nextRunEnds();
            await vscode.commands.executeCommand("limekit.run");
            assert.strictEqual(await ended, 0);
            for (let i = 0; i < 20 && !fs.existsSync(luarc); i += 1) await sleep(250);
            const written = JSON.parse(fs.readFileSync(luarc, "utf8"));
            assert.ok(written["workspace.library"][0].endsWith("/limekit/runtime/lua/stubs"));
        });
    }
};
