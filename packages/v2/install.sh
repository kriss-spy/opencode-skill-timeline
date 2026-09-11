#!/usr/bin/env bash

set -euo pipefail

readonly release_base_url="${OPENCODE_SKILL_TIMELINE_RELEASE_URL:-https://github.com/kriss-spy/opencode-skill-timeline/releases/download/v2-latest}"
readonly config_home="${XDG_CONFIG_HOME:-${HOME}/.config}"
readonly opencode_config_dir="${OPENCODE_CONFIG_DIR:-${config_home}/opencode}"
readonly plugin_dir="${opencode_config_dir}/plugins"
readonly plugin_path="${plugin_dir}/skill-timeline-v2.js"
installer_tmp_dir="$(mktemp -d)"
readonly installer_tmp_dir

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is required to register the v2 CLI plugin without replacing existing configuration." >&2
  exit 1
fi

cleanup() {
  rm -rf -- "${installer_tmp_dir}"
}
trap cleanup EXIT

curl --fail --location --silent --show-error \
  "${release_base_url}/skill-timeline-v2.js" \
  --output "${installer_tmp_dir}/skill-timeline-v2.js"
curl --fail --location --silent --show-error \
  "${release_base_url}/skill-timeline-v2.js.sha256" \
  --output "${installer_tmp_dir}/skill-timeline-v2.js.sha256"

read -r expected_checksum _ < "${installer_tmp_dir}/skill-timeline-v2.js.sha256"
readonly expected_checksum
if [[ ! "${expected_checksum}" =~ ^[0-9a-fA-F]{64}$ ]]; then
  echo "The release checksum is invalid." >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  actual_checksum="$(sha256sum "${installer_tmp_dir}/skill-timeline-v2.js" | cut -d ' ' -f 1)"
elif command -v shasum >/dev/null 2>&1; then
  actual_checksum="$(shasum -a 256 "${installer_tmp_dir}/skill-timeline-v2.js" | cut -d ' ' -f 1)"
else
  echo "A SHA-256 utility (sha256sum or shasum) is required." >&2
  exit 1
fi
readonly actual_checksum

readonly normalized_expected_checksum="$(printf '%s' "${expected_checksum}" | tr 'A-F' 'a-f')"
if [[ "${actual_checksum}" != "${normalized_expected_checksum}" ]]; then
  echo "Checksum verification failed." >&2
  exit 1
fi

mkdir -p -- "${plugin_dir}"
install -m 0644 "${installer_tmp_dir}/skill-timeline-v2.js" "${plugin_path}"

readonly cli_config_path="${opencode_config_dir}/cli.json"

python3 - "${cli_config_path}" "${plugin_path}" <<'PY'
import json
import os
import re
import sys
import tempfile
from pathlib import Path

config_path = Path(sys.argv[1])
plugin_url = Path(sys.argv[2]).resolve().as_uri()


def significant_tokens(source: str):
    """Return JSON/JSONC token spans while ignoring whitespace and comments."""
    tokens = []
    index = 0
    while index < len(source):
        char = source[index]
        if char.isspace():
            index += 1
            continue
        if source.startswith("//", index):
            newline = source.find("\n", index + 2)
            index = len(source) if newline == -1 else newline + 1
            continue
        if source.startswith("/*", index):
            end = source.find("*/", index + 2)
            if end == -1:
                raise ValueError("unterminated block comment")
            index = end + 2
            continue
        if char == '"':
            end = index + 1
            while end < len(source):
                if source[end] == "\\":
                    end += 2
                elif source[end] == '"':
                    end += 1
                    break
                else:
                    end += 1
            else:
                raise ValueError("unterminated string")
            tokens.append(("string", index, end, json.loads(source[index:end])))
            index = end
            continue
        if char in "{}[]:,":
            tokens.append((char, index, index + 1, char))
            index += 1
            continue
        match = re.match(r"(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)", source[index:])
        if not match:
            raise ValueError(f"unexpected character at offset {index}")
        end = index + len(match.group(0))
        tokens.append(("value", index, end, match.group(0)))
        index = end
    return tokens


def matching_close(tokens, opening_index):
    opening = tokens[opening_index][0]
    closing = "}" if opening == "{" else "]"
    depth = 0
    for index in range(opening_index, len(tokens)):
        kind = tokens[index][0]
        if kind == opening:
            depth += 1
        elif kind == closing:
            depth -= 1
            if depth == 0:
                return index
    raise ValueError(f"unclosed {opening}")


def parse_jsonc(source: str):
    """Validate JSONC after removing comments and trailing commas."""
    characters = list(source)
    index = 0
    in_string = False
    while index < len(characters):
        if in_string:
            if characters[index] == "\\":
                index += 2
                continue
            if characters[index] == '"':
                in_string = False
            index += 1
            continue
        if characters[index] == '"':
            in_string = True
            index += 1
            continue
        if source.startswith("//", index):
            end = source.find("\n", index + 2)
            end = len(source) if end == -1 else end
            for position in range(index, end):
                characters[position] = " "
            index = end
            continue
        if source.startswith("/*", index):
            end = source.find("*/", index + 2)
            if end == -1:
                raise ValueError("unterminated block comment")
            for position in range(index, end + 2):
                if characters[position] != "\n":
                    characters[position] = " "
            index = end + 2
            continue
        index += 1

    sanitized = "".join(characters)
    tokens = significant_tokens(sanitized)
    for token_index, token in enumerate(tokens[:-1]):
        if token[0] == "," and tokens[token_index + 1][0] in ("}", "]"):
            characters[token[1]] = " "
    return json.loads("".join(characters))


def indent_for(source, position, fallback="  "):
    line_start = source.rfind("\n", 0, position) + 1
    current = source[line_start:position]
    leading = current[: len(current) - len(current.lstrip())]
    return leading + fallback


def add_to_array(source, tokens, opening_index, value):
    closing_index = matching_close(tokens, opening_index)
    closing = tokens[closing_index]
    entries = []
    depth = 0
    for token in tokens[opening_index + 1:closing_index]:
        if token[0] in ("{", "["):
            depth += 1
        elif token[0] in ("}", "]"):
            depth -= 1
        elif depth == 0 and token[0] == "string":
            entries.append(token[3])
    if value in entries:
        return source, False

    body_tokens = tokens[opening_index + 1:closing_index]
    indentation = indent_for(source, tokens[opening_index][1])
    encoded = json.dumps(value)
    if not body_tokens:
        addition = f"\n{indentation}{encoded}\n" + indentation[:-2]
        return source[:closing[1]] + addition + source[closing[1]:], True

    last = body_tokens[-1]
    separator = "" if last[0] == "," else ","
    addition = f"{separator}\n{indentation}{encoded}"
    return source[:last[2]] + addition + source[last[2]:], True


def register(source: str, value: str):
    tokens = significant_tokens(source)
    if not tokens or tokens[0][0] != "{" or matching_close(tokens, 0) != len(tokens) - 1:
        raise ValueError("the CLI configuration must contain one top-level object")

    root_close = len(tokens) - 1
    depth = 0
    index = 1
    while index < root_close:
        token = tokens[index]
        if token[0] in ("{", "["):
            depth += 1
        elif token[0] in ("}", "]"):
            depth -= 1
        elif depth == 0 and token[0] == "string" and token[3] == "plugins":
            if index + 2 >= root_close or tokens[index + 1][0] != ":" or tokens[index + 2][0] != "[":
                raise ValueError('the top-level "plugins" setting must be an array')
            return add_to_array(source, tokens, index + 2, value)
        index += 1

    close = tokens[root_close]
    indentation = indent_for(source, tokens[0][1])
    encoded = json.dumps(value)
    body_tokens = tokens[1:root_close]
    if not body_tokens:
        addition = f"\n{indentation}\"plugins\": [{encoded}]\n"
    else:
        last = body_tokens[-1]
        separator = "" if last[0] == "," else ","
        addition = f"{separator}\n{indentation}\"plugins\": [{encoded}]"
        return source[:last[2]] + addition + source[last[2]:], True
    return source[:close[1]] + addition + source[close[1]:], True


config_path.parent.mkdir(parents=True, exist_ok=True)
original = config_path.read_text() if config_path.exists() else "{}\n"
try:
    parsed = parse_jsonc(original)
    if not isinstance(parsed, dict):
        raise ValueError("the CLI configuration must contain one top-level object")
    updated, changed = register(original, plugin_url)
    parse_jsonc(updated)
except (OSError, UnicodeError, ValueError, json.JSONDecodeError) as error:
    raise SystemExit(f"Cannot update {config_path}: {error}")

if changed:
    descriptor, temporary_path = tempfile.mkstemp(prefix=f".{config_path.name}.", dir=config_path.parent)
    try:
        with os.fdopen(descriptor, "w") as temporary:
            temporary.write(updated)
        if config_path.exists():
            os.chmod(temporary_path, config_path.stat().st_mode)
        os.replace(temporary_path, config_path)
    finally:
        if os.path.exists(temporary_path):
            os.unlink(temporary_path)

print(f"Registered {plugin_url} in {config_path}")
PY

echo "Installed OpenCode v2 skill-timeline to ${plugin_path}"
echo "Restart OpenCode v2, open a session, and run /skill-timeline."
