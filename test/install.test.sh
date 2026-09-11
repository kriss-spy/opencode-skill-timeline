#!/usr/bin/env bash

set -euo pipefail

readonly test_tmp_dir="$(mktemp -d)"
trap 'rm -rf -- "${test_tmp_dir}"' EXIT

readonly release_dir="${test_tmp_dir}/release"
mkdir -p -- "${release_dir}"
printf 'export default {}\n' > "${release_dir}/skill-timeline.js"
# Release checksums are generated from the build path, while the asset is
# downloaded by its release name.
(cd "${release_dir}" && sha256sum skill-timeline.js | sed 's#skill-timeline.js#dist/tui.js#' > skill-timeline.js.sha256)

run_installer() {
  HOME="$1" OPENCODE_SKILL_TIMELINE_RELEASE_URL="file://${release_dir}" bash ../install.sh >/dev/null
}

readonly new_home="${test_tmp_dir}/new home"
mkdir -p -- "${new_home}"
run_installer "${new_home}"
python3 - "${new_home}/.config/opencode/tui.json" <<'PY'
import json
import sys
from pathlib import Path

config = json.loads(Path(sys.argv[1]).read_text())
assert config["plugin"] == [(Path(sys.argv[1]).parent / "plugins/skill-timeline.js").resolve().as_uri()]
PY

readonly existing_home="${test_tmp_dir}/existing"
readonly existing_config_dir="${existing_home}/.config/opencode"
mkdir -p -- "${existing_config_dir}"
cat > "${existing_config_dir}/tui.jsonc" <<'JSONC'
{
  // Keep the theme and the existing plugin.
  "theme": "catppuccin",
  "plugin": [
    "file:///tmp/existing.js",
  ],
}
JSONC

run_installer "${existing_home}"
run_installer "${existing_home}"

readonly installed_url="file://${existing_config_dir}/plugins/skill-timeline.js"
grep -q '// Keep the theme and the existing plugin.' "${existing_config_dir}/tui.jsonc"
[[ "$(grep -F -c -- "${installed_url}" "${existing_config_dir}/tui.jsonc")" -eq 1 ]]
grep -q '"theme": "catppuccin"' "${existing_config_dir}/tui.jsonc"
grep -q 'file:///tmp/existing.js' "${existing_config_dir}/tui.jsonc"
[[ ! -e "${existing_config_dir}/tui.json" ]]

printf '%064d  dist/tui.js\n' 0 > "${release_dir}/skill-timeline.js.sha256"
readonly rejected_home="${test_tmp_dir}/rejected"
mkdir -p -- "${rejected_home}"
if run_installer "${rejected_home}" 2>/dev/null; then
  echo "installer accepted an incorrect checksum" >&2
  exit 1
fi
[[ ! -e "${rejected_home}/.config/opencode/plugins/skill-timeline.js" ]]

echo "installer registration tests passed"
