// SPDX-License-Identifier: BUSL-1.1
//
// Finance — Getting Started: a tiny in-repo VS Code extension that contributes a
// "Get Started" walkthrough with one-click buttons for first-run setup. Each
// button runs an existing repo script (check-devenv / setup / doctor) or task.
//
// Plain CommonJS, zero dependencies — the `vscode` module is provided by the
// host, so this runs as-is via F5 (Extension Development Host) with no build.

const vscode = require('vscode');

const WALKTHROUGH_ID = 'finance.finance-getting-started#gettingStarted';

/**
 * Run a shell command in a dedicated, reused integrated terminal rooted at the
 * workspace folder. Reusing by name keeps repeated clicks from spawning a pile
 * of terminals.
 * @param {string} name Terminal title (reused across clicks).
 * @param {string} commandLine Command line to send.
 */
function runInTerminal(name, commandLine) {
  const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  if (!folder) {
    vscode.window.showErrorMessage('Finance: open the repository folder first, then try again.');
    return;
  }
  const existing = vscode.window.terminals.find((t) => t.name === name);
  const terminal = existing || vscode.window.createTerminal({ name, cwd: folder.uri.fsPath });
  terminal.show(true);
  terminal.sendText(commandLine, true);
}

/**
 * Activate the extension: register the walkthrough commands and, on first run
 * only, surface the walkthrough so setup is one click away.
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const handlers = {
    'finance.checkEnv': () => runInTerminal('Finance: Check Env', 'npm run check-devenv'),
    'finance.installDeps': () => runInTerminal('Finance: Install', 'npm install'),
    'finance.fullSetup': () => runInTerminal('Finance: Setup', 'npm run setup'),
    'finance.runDoctor': () => runInTerminal('Finance: Doctor', 'npm run doctor'),
    'finance.runApp': () =>
      vscode.commands.executeCommand(
        'workbench.action.tasks.runTask',
        'Dev: Full Stack (web on edge)',
      ),
    'finance.openWalkthrough': () =>
      vscode.commands.executeCommand('workbench.action.openWalkthrough', WALKTHROUGH_ID, false),
  };

  for (const [id, handler] of Object.entries(handlers)) {
    context.subscriptions.push(vscode.commands.registerCommand(id, handler));
  }

  const autoOpenedKey = 'finance.gettingStarted.autoOpened';
  if (!context.globalState.get(autoOpenedKey)) {
    context.globalState.update(autoOpenedKey, true);
    vscode.commands.executeCommand('workbench.action.openWalkthrough', WALKTHROUGH_ID, false);
  }
}

function deactivate() {}

module.exports = { activate, deactivate };
