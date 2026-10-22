# Limekit for VS Code

Write [Limekit](https://github.com/mitosisX/Limekit) desktop apps in VS Code
and run them with one click.

- **▶ Run** — the play button above the editor, **Run app** in the status bar,
  or **Ctrl+F5**. Run again to restart; **Shift+F5** or **■** stops.
- **Errors you can click** — a Lua error appears in the **Problems** panel and
  is underlined in your code, on the file and line it happened.
- **Completion and docs for the whole Limekit API** — every widget, method,
  property and event, with typos like `button:setTxt` underlined. The Lua
  extension it needs is installed with this one.
- **Snippets** — type `lk-` for a whole app (`lk-app`), a window, a button
  with its click handler, a form, a list, a drop-down, a timer and more.

## What you need

[Limer](https://github.com/mitosisX/Limer-Limekit/releases) — download it,
unzip it, open your project in it once. That's all: the extension finds Limer
from your project on its own. If it ever cannot, it asks you to point at the
folder you unzipped Limer into (**Limekit: Locate Limer...**).

## Settings

| Setting | What it is |
|---|---|
| `limekit.limerPath` | The folder you unzipped Limer into, if it is not found on its own. |
| `limekit.pythonPath` | Only for people working on Limekit itself. |

## License

GPLv3. Made by Omega Msiska at Naveto Tech. If it helps you, [buy me a coffee](https://buymeacoffee.com/omegamsiska).
