# OpenCode Skill Timeline

`/skill-timeline` is an OpenCode v1 TUI plugin for auditing every `skill` tool invocation in the current session.

The modal uses OpenCode's native dialog, keymap, session state, and current theme. Each row shows the visible context immediately preceding the call, the skill name, and the call time. Search is local and matches the full context and skill name; repeated, running, and failed invocations remain distinct.

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

Moving through the timeline scrolls the session behind the modal, matching OpenCode's built-in `/timeline`. Selecting a row closes the modal with the user message that began the skill call's turn aligned near the top of the session viewport. If that message is not currently renderable, the plugin shows a warning instead of pretending the jump succeeded.
