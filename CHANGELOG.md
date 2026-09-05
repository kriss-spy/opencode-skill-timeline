# Changelog

## 0.1.1 - 2026-09-05

- Add a checksum-verified installer for global OpenCode installation.
- Document one-line installation with `curl` and Bash.

## 0.1.0 - 2026-09-05

First stable release.

- Add a native `/skill-timeline` dialog for auditing skill invocations in the current session.
- Search full skill names and the visible context preceding each invocation.
- Preserve repeated, running, completed, and failed calls as distinct timeline entries.
- Locate the exact rendered skill call when moving through or selecting an entry.
- Keep skill names and timestamps readable by omitting context at narrow terminal widths.
