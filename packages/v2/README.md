# OpenCode v2 Skill Timeline

This package is the independent OpenCode v2 beta port exposed as `/skill-timeline-v2`. The v2 suffix is used for the package, plugin ID, slash command, bundle, and installed filename so it cannot collide with the v1 plugin. It shares only version-neutral timeline extraction and formatting code with the v1 project; its plugin entrypoint, dependency graph, build, tests, version, release channel, and installer are separate.

## Compatibility

- OpenCode v2 beta
- `@opencode/plugin` `0.0.0-beta-19425`
- Bun runtime

The v2 plugin API is still beta. This port uses the public session-data, keymap, and dialog APIs. The searchable picker displays every skill call with its preceding context and timestamp. Exact jump-to-call behavior remains unavailable until v2 exposes a stable public navigation API for rendered tool calls.

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

For the separate `v2-latest` release channel:

```bash
curl -fsSL https://github.com/kriss-spy/opencode-skill-timeline/releases/download/v2-latest/install.sh | bash
```

The installer verifies `skill-timeline-v2.js`, writes it under the global OpenCode plugins directory, and registers it in `~/.config/opencode/cli.json`.
