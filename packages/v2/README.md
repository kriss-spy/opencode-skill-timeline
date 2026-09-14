# OpenCode v2 Skill Timeline

This package is the independent OpenCode v2 beta port exposed as `/skill-timeline-v2`. The v2 suffix is used for the package, plugin ID, slash command, bundle, and installation directory so it cannot collide with the v1 plugin. It shares only version-neutral timeline extraction and formatting code with the v1 project; its plugin entrypoint, dependency graph, build, tests, version, release channel, and installer are separate.

## Compatibility

- OpenCode v2 beta
- OpenCode v2 `0.0.0-beta-19059` or newer
- `@opencode-ai/plugin` `0.0.0-beta-19059` for development types
- Bun runtime

The distributed bundle is self-contained, so config-scoped installs do not depend on either SDK package being runtime-resolvable. The v2 plugin API is still beta. This port uses the public session-data, keymap, dialog, and renderer APIs. The searchable picker displays every skill call with its preceding context and timestamp. Confirming an entry with Enter reveals virtualized history when needed and aligns the exact skill call near the top of the session viewport.

## Development

```bash
bun install
bun run check
```

The v2 build emits `dist/skill-timeline-v2.js`. Changes to the shared extractor under `../../src/` must pass both the root v1 suite and this package's v2 suite.

## Installation

Once the beta package is published:

```bash
opencode2 plugin add opencode-skill-timeline-v2@beta
```

Install the versioned beta release:

```bash
curl -fsSL https://github.com/kriss-spy/opencode-skill-timeline/releases/download/v2-0.1.0-beta.1/install.sh | bash
```

The installer verifies `skill-timeline-v2.js`, installs it as `~/.config/opencode/plugins/skill-timeline-v2/tui.js`, and registers that plugin directory in `~/.config/opencode/cli.json`. The directory layout lets OpenCode v2 resolve it as a TUI-only entrypoint instead of treating a direct JavaScript file as a server plugin. It also removes the stale direct-file registration created by earlier beta installers.
