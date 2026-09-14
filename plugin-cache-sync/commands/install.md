---
description: Install plugin-cache-sync CLI to PATH
allowed-tools:
  - Bash(mkdir -p ~/.local/bin)
  - Bash(ln -sf "${CLAUDE_PLUGIN_ROOT}/scripts/plugin-cache-sync" *)
  - Bash(plugin-cache-sync version)
  - Edit(~/.local/bin/**)
---

# Install plugin-cache-sync

Install the `plugin-cache-sync` CLI to `~/.local/bin` so it's available globally.

## Execution

Run all steps below in order.

### Step 1: Install for the platform

```bash
mkdir -p ~/.local/bin
```

On Linux and macOS, symlink the script:

```bash
ln -sf "${CLAUDE_PLUGIN_ROOT}/scripts/plugin-cache-sync" ~/.local/bin/plugin-cache-sync
```

On Windows (Git Bash, MSYS2, Cygwin), copy it instead:

```bash
cp -f "${CLAUDE_PLUGIN_ROOT}/scripts/plugin-cache-sync" ~/.local/bin/plugin-cache-sync && chmod +x ~/.local/bin/plugin-cache-sync
```

### Step 2: Confirm

```bash
plugin-cache-sync version
```

When the shell reports `command not found`, `~/.local/bin` is not in `PATH`.
Tell the user to add `export PATH="$HOME/.local/bin:$PATH"` to their shell profile.
