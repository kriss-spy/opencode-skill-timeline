# OpenCode Skill Timeline

`/skill-timeline` is an OpenCode v1 TUI plugin for auditing every `skill` tool invocation in the current session.

The modal uses OpenCode's native dialog, keymap, session state, and current theme. Each row shows the visible context immediately preceding the call, the skill name, and the call time. At narrow terminal widths, the context column is omitted so the skill name and time remain readable. Search is local and matches the full context and skill name; repeated, running, and failed invocations remain distinct.

## Compatibility

- OpenCode `>=1.18.27 <2`
- Bun runtime
- OpenCode v2 is intentionally unsupported

## Development

```bash
bun install
bun run check
```

The production plugin lives in `src/`.

## Local installation

Install the latest release globally:

```bash
curl -fsSL https://github.com/kriss-spy/opencode-skill-timeline/releases/latest/download/install.sh | bash
```

Restart OpenCode, open a session, and run `/skill-timeline`. The installer downloads the release bundle, verifies its SHA-256 checksum, and writes it to `~/.config/opencode/plugins/skill-timeline.js` (or `$XDG_CONFIG_HOME/opencode/plugins/skill-timeline.js` when set).

Because the release bundle is a TUI plugin, the installer also registers its absolute `file://` URL in the global `tui.json`. If `tui.jsonc` already exists, that file is updated instead. Existing settings, comments, and plugin registrations are preserved, and running the installer again does not add a duplicate entry. Python 3 is required for this configuration update.

### Install from source

Build the package:

```bash
bun run build
```

Then add the built TUI entrypoint to the project's `.opencode/tui.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["file:///absolute/path/to/opencode-skill-timeline/dist/tui.js"]
}
```

Restart OpenCode and run `/skill-timeline` from an open session.

## Locate behavior

Moving through the timeline scrolls the session behind the modal, matching OpenCode's built-in `/timeline`. The plugin maps structured calls onto rendered `Skill "…"` rows by name and chronological occurrence, so repeated calls within one long assistant turn locate independently. Selecting a row closes the modal with that exact skill row aligned near the top of the session viewport. If tool details are hidden and the row is not rendered, the plugin warns instead of jumping to the wrong place.
