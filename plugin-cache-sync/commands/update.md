---
description: Update plugin-cache-sync CLI installation
allowed-tools:
  - Bash(readlink ~/.local/bin/plugin-cache-sync)
  - Bash(ls -l ~/.local/bin/plugin-cache-sync)
  - Bash(ln -sf "${CLAUDE_PLUGIN_ROOT}/scripts/plugin-cache-sync" *)
  - Bash(plugin-cache-sync version)
  - Read(~/.local/bin/**)
  - Edit(~/.local/bin/**)
---

# Update plugin-cache-sync

Verify and fix the `plugin-cache-sync` CLI installation.

## Execution

1. Inspect the installed entry. `readlink` prints the target of a symlink and
   nothing for anything else:

   ```bash
   readlink ~/.local/bin/plugin-cache-sync
   ```

   - It prints `${CLAUDE_PLUGIN_ROOT}/scripts/plugin-cache-sync`: report `OK: symlink is valid` and go to step 3, except on Windows (Git Bash, MSYS2, Cygwin), which goes to step 2.
   - It prints another target: go to step 2.
   - It prints nothing: run `ls -l ~/.local/bin/plugin-cache-sync`. No such file: stop and tell the user to run `/plugin-cache-sync:install` first. A regular file: on Linux and macOS, warn that it is not a symlink and gets replaced by one. Then go to step 2.

2. Install the current script. On Linux and macOS:

   ```bash
   ln -sf "${CLAUDE_PLUGIN_ROOT}/scripts/plugin-cache-sync" ~/.local/bin/plugin-cache-sync
   ```

   On Windows, copy the latest script over the old one:

   ```bash
   cp -f "${CLAUDE_PLUGIN_ROOT}/scripts/plugin-cache-sync" ~/.local/bin/plugin-cache-sync && chmod +x ~/.local/bin/plugin-cache-sync
   ```

3. Confirm:

   ```bash
   plugin-cache-sync version
   ```
