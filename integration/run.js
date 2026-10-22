// Runs suite.js inside a real VS Code, in a throwaway profile: its own user
// data and extensions folders, so the machine's own VS Code is untouched.
//
//   node integration/run.js <path-to-unzipped-Limer> [path-to-Code.exe]

const { runTests } = require("@vscode/test-electron");
const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

async function main() {
    const limer = path.resolve(process.argv[2] || "");
    const code = process.argv[3] || "C:/Program Files/Microsoft VS Code/Code.exe";
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "limekit-vscode-it-"));
    const userData = path.join(scratch, "user-data");
    const extensions = path.join(scratch, "extensions");

    // A project whose main.lua fails inside a required file, so the run
    // proves the error comes back as a problem on the right file and line.
    const project = path.join(scratch, "BrokenApp");
    fs.mkdirSync(path.join(project, "scripts", "lib"), { recursive: true });
    fs.writeFileSync(path.join(project, "app.json"), JSON.stringify({ name: "Broken App", version: "1.0", api: "2.0" }));
    fs.writeFileSync(path.join(project, "scripts", "main.lua"), 'local h = require("lib.helper")\nh.go()\n');
    fs.writeFileSync(path.join(project, "scripts", "lib", "helper.lua"),
        "local M = {}\nfunction M.go()\n    local x = nil\n    return x.field\nend\nreturn M\n");

    // The Lua extension this one depends on, into the throwaway profile.
    const cli = path.join(path.dirname(code), "bin", process.platform === "win32" ? "code.cmd" : "code");
    // code.cmd needs a shell on Windows, and the shell needs the spaces in
    // "Program Files" quoted.
    const quote = (arg) => `"${arg}"`;
    execSync([cli, "--extensions-dir", extensions, "--install-extension", "sumneko.lua"]
        .map(quote).join(" "), { stdio: "inherit" });

    // The test runner splits its arguments on spaces ("D:/Personal Dev/..."
    // arrives as "D:/Personal"), so the extension under test is staged into
    // the scratch folder first. Limer's own path keeps its spaces: it travels
    // in the environment, and the extension must cope with it.
    const staged = path.join(scratch, "extension");
    for (const item of ["package.json", "extension.js", "lib", "snippets", "images", "integration"]) {
        fs.cpSync(path.resolve(__dirname, "..", item), path.join(staged, item), { recursive: true });
    }

    await runTests({
        vscodeExecutablePath: code,
        extensionDevelopmentPath: staged,
        extensionTestsPath: path.join(staged, "integration", "suite.js"),
        launchArgs: [project, "--user-data-dir", userData, "--extensions-dir", extensions,
            "--disable-workspace-trust", "--skip-welcome", "--skip-release-notes"],
        extensionTestsEnv: {
            LK_PROJECT: project,
            LK_LIMER: limer,
            LK_DEV_PYTHON: process.env.LK_DEV_PYTHON || "",
            QT_QPA_PLATFORM: "offscreen",
        },
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
