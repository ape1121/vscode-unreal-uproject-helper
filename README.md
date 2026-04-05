# Unreal Helper

Unreal Helper adds a simple Unreal-focused sidebar to VS Code for common project actions.

## Using The Sidebar

Open a workspace that contains one or more `*.uproject` files. The `Unreal` activity bar item appears when a `.uproject` is detected in the workspace.

Inside the sidebar you can:

- Run `Build` with `unrealHelper.buildArgs`
- Run `Open Editor`, which opens the selected `.uproject` using the OS file association
- Pick the active `.uproject`
- Pick the build script used by the build buttons

If multiple `.uproject` files exist, the extension prompts you to choose one when needed. If no `.uproject` is found, use `Pick .uproject` or set `unrealHelper.uprojectPath`.

## Settings

The extension contributes these settings:

- `unrealHelper.uprojectPath`
- `unrealHelper.buildScriptPath`
- `unrealHelper.buildArgs`
- `unrealHelper.openAfterBuild`

`Open Editor` uses `vscode.env.openExternal(vscode.Uri.file(...))`, so it behaves like opening the `.uproject` from the operating system instead of requiring a hardcoded Unreal Editor executable path.
