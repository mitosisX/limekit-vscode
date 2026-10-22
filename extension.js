// Limekit for VS Code: run a Limekit app from the editor, with Limer's own
// Python, and get completion for the whole API without configuring a thing.

const vscode = require("vscode");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const limer = require("./lib/limer");

const TASK_SOURCE = "Limekit";

let statusItem = null;
let running = null;          // the TaskExecution of the app now running
let restartWith = null;      // a project to start once the current run ends

function settings() {
    return vscode.workspace.getConfiguration("limekit");
}

// The project the person is looking at: the one holding the active file,
// else the first workspace folder that is a project.
function currentProject() {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.uri.scheme === "file") {
        const project = limer.findProject(editor.document.uri.fsPath);
        if (project) return project;
    }
    for (const folder of vscode.workspace.workspaceFolders || []) {
        if (fs.existsSync(path.join(folder.uri.fsPath, "app.json"))) {
            return folder.uri.fsPath;
        }
    }
    return null;
}

function python(project) {
    return limer.resolvePython({
        project,
        limerPath: settings().get("limerPath") || "",
        pythonPath: settings().get("pythonPath") || "",
    });
}

async function locateLimer() {
    const picked = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        openLabel: "Use this Limer folder",
        title: "Where did you unzip Limer? (the folder holding Limer.exe)",
    });
    if (!picked || !picked.length) return null;

    const folder = picked[0].fsPath;
    if (!limer.pythonInLimer(folder)) {
        vscode.window.showErrorMessage(
            `That folder has no Limer in it: there is no python folder inside ${folder}. ` +
            "Pick the folder you unzipped Limer into.");
        return null;
    }
    await settings().update("limerPath", folder, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(`Limekit will run your apps with the Limer in ${folder}.`);
    const project = currentProject();
    if (project) setUpEditor(project);
    return folder;
}

// Completion: have Limekit write the project's .luarc.json, which the Lua
// extension reads. Quiet on failure -- running still works without it.
function setUpEditor(project) {
    const found = python(project);
    if (!found || limer.apiVersion(project) !== "2.0") return;
    execFile(found.python, limer.editorSetupArgs(project), { windowsHide: true }, () => {});
}

function updateContext() {
    const project = currentProject();
    vscode.commands.executeCommand("setContext", "limekit.isProject", Boolean(project));
    vscode.commands.executeCommand("setContext", "limekit.running", Boolean(running));
    if (!statusItem) return;
    if (!project) {
        statusItem.hide();
        return;
    }
    statusItem.text = running ? "$(debug-stop) Stop app" : "$(play) Run app";
    statusItem.tooltip = running ? "Stop the running Limekit app" : "Run this Limekit app (Ctrl+F5)";
    statusItem.command = running ? "limekit.stop" : "limekit.run";
    statusItem.show();
}

async function run() {
    const project = currentProject();
    if (!project) {
        vscode.window.showWarningMessage(
            "This is not a Limekit project: there is no app.json in this folder or above it.");
        return;
    }
    if (limer.apiVersion(project) !== "2.0") {
        vscode.window.showWarningMessage(
            "This project was made for Limekit 1.x, which this version no longer runs. " +
            "The Limer 1.x release still runs it.");
        return;
    }

    let found = python(project);
    if (!found) {
        const choice = await vscode.window.showInformationMessage(
            "To run Limekit apps, VS Code needs to know where Limer is.",
            "Locate Limer", "Download Limer");
        if (choice === "Download Limer") {
            vscode.env.openExternal(vscode.Uri.parse("https://github.com/mitosisX/Limer-Limekit/releases"));
            return;
        }
        if (choice !== "Locate Limer" || !(await locateLimer())) return;
        found = python(project);
        if (!found) return;
    }

    await vscode.workspace.saveAll(false);
    setUpEditor(project);

    if (running) {
        // Run again restarts: stop this one, start the new one when it ends.
        restartWith = project;
        running.terminate();
        return;
    }
    await start(project, found);
}

async function start(project, found) {
    const execution = new vscode.ProcessExecution(found.python, limer.runArgs(project, found.bundled), {
        cwd: project,
    });
    const task = new vscode.Task(
        { type: "limekit", project },
        vscode.TaskScope.Workspace,
        path.basename(project),
        TASK_SOURCE,
        execution,
        ["$limekit"],
    );
    task.presentationOptions = {
        reveal: vscode.TaskRevealKind.Always,
        panel: vscode.TaskPanelKind.Dedicated,
        clear: true,
        showReuseMessage: false,
    };
    running = await vscode.tasks.executeTask(task);
    updateContext();
}

function stop() {
    restartWith = null;
    if (running) running.terminate();
}

function activate(context) {
    statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    context.subscriptions.push(statusItem);

    context.subscriptions.push(
        vscode.commands.registerCommand("limekit.run", run),
        vscode.commands.registerCommand("limekit.stop", stop),
        vscode.commands.registerCommand("limekit.locateLimer", locateLimer),

        vscode.tasks.onDidEndTask((event) => {
            if (!running || event.execution !== running) return;
            running = null;
            updateContext();
            const next = restartWith;
            restartWith = null;
            if (next) {
                const found = python(next);
                if (found) start(next, found);
            }
        }),

        vscode.window.onDidChangeActiveTextEditor(updateContext),
        vscode.workspace.onDidChangeWorkspaceFolders(updateContext),
    );

    updateContext();
    const project = currentProject();
    if (project) setUpEditor(project);
}

function deactivate() {
    if (running) running.terminate();
}

module.exports = { activate, deactivate };
