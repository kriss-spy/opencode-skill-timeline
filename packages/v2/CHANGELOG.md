# Changelog

## 0.1.0-beta.1 - 2026-09-14

- Jump to the exact selected skill call when confirming a timeline entry with Enter.
- Locate first-row skill calls and repeated calls without confusing their transcript rows.
- Reveal virtualized session history before locating older skill calls.

## 0.1.0-beta.0 - 2026-09-12

- Add the initial OpenCode v2 beta adapter and collision-free `/skill-timeline-v2` command.
- Ship a self-contained file bundle compatible with OpenCode v2 beta 19059.
- Install under a TUI-only plugin directory and migrate stale direct-file registrations.
- Extract completed, failed, running, and streaming skill calls from the v2 session-message model.
- Add an independent v2 build, package manifest, release channel, and installer.
