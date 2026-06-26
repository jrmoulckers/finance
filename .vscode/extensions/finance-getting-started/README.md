# Finance — Getting Started (workspace extension)

A tiny, in-repo VS Code extension that adds a **Get Started walkthrough** with
one-click buttons for first-run setup of the Finance monorepo:

| Step                  | Button runs                              |
| --------------------- | ---------------------------------------- |
| Check Dev Environment | `npm run check-devenv`                   |
| Install Dependencies  | `npm install`                            |
| Full Setup            | `npm run setup`                          |
| Run the Web App       | the `Dev: Full Stack (web on edge)` task |

All commands are also available from the Command Palette under the **Finance**
category (e.g. **Finance: Check Dev Environment**).

## Why this exists

VS Code "Get Started" walkthroughs — the checklist tiles with real buttons — can
**only be contributed by an extension**, not by a plain repo. Keeping this
extension in-repo lets the walkthrough live next to the code it sets up.

> **Node.js is the one prerequisite.** These buttons run `npm`/`node`, so Node
> must already be installed. Everything else (JDK 21, Docker, dependencies) is
> checked and guided by the **Check Dev Environment** step.

## Loading it

This extension is **not** on the Marketplace, so it is not auto-installed. Pick
whichever fits:

### 1. Try it now (zero install) — Extension Development Host

Press **F5** and choose **“Run Getting Started Walkthrough (Extension)”**. A new
VS Code window opens with this repo and the extension loaded, and the walkthrough
appears automatically on first run.

### 2. Use it daily — install the VSIX

```bash
cd .vscode/extensions/finance-getting-started
npx @vscode/vsce package
code --install-extension finance-getting-started-0.0.1.vsix
```

Reload VS Code. Open it any time from **Help → Welcome**, or run
**Finance: Open Getting Started Walkthrough** from the Command Palette.

### 3. Zero-step for everyone (future) — publish + recommend

Publish to the Marketplace, then add the published extension id to
`.vscode/extensions.json` so opening the repo prompts every developer to install
it once. Publishing is a human-gated action and intentionally not automated here.
