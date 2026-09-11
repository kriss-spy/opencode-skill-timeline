#!/usr/bin/env bash

set -euo pipefail

readonly test_tmp_dir="$(mktemp -d)"
trap 'rm -rf -- "${test_tmp_dir}"' EXIT

readonly release_dir="${test_tmp_dir}/release"
mkdir -p -- "${release_dir}"
printf 'export default { setup() {} }\n' > "${release_dir}/skill-timeline-v2.js"
(cd "${release_dir}" && sha256sum skill-timeline-v2.js > skill-timeline-v2.js.sha256)

run_installer() {
  HOME="$1" OPENCODE_SKILL_TIMELINE_RELEASE_URL="file://${release_dir}" bash ../install.sh >/dev/null
}

readonly fresh_home="${test_tmp_dir}/fresh home"
mkdir -p -- "${fresh_home}"
run_installer "${fresh_home}"
cmp "${release_dir}/skill-timeline-v2.js" "${fresh_home}/.config/opencode/plugins/skill-timeline-v2.js"
python3 - "${fresh_home}/.config/opencode/cli.json" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
config = json.loads(path.read_text())
assert config["plugins"] == [(path.parent / "plugins/skill-timeline-v2.js").resolve().as_uri()]
PY

readonly existing_home="${test_tmp_dir}/existing"
readonly existing_config_dir="${existing_home}/.config/opencode"
mkdir -p -- "${existing_config_dir}"
cat > "${existing_config_dir}/cli.json" <<'JSONC'
{
  // Keep this comment and the trailing commas.
  "theme": "system",
  "plugins": [
    "file:///tmp/existing-v2.js",
  ],
}
JSONC
run_installer "${existing_home}"
run_installer "${existing_home}"

readonly installed_url="file://${existing_config_dir}/plugins/skill-timeline-v2.js"
[[ "$(grep -F -c -- "${installed_url}" "${existing_config_dir}/cli.json")" -eq 1 ]]
grep -q 'file:///tmp/existing-v2.js' "${existing_config_dir}/cli.json"
grep -q '// Keep this comment and the trailing commas.' "${existing_config_dir}/cli.json"
grep -q '"theme": "system"' "${existing_config_dir}/cli.json"

printf '%064d  skill-timeline-v2.js\n' 0 > "${release_dir}/skill-timeline-v2.js.sha256"
readonly rejected_home="${test_tmp_dir}/rejected"
mkdir -p -- "${rejected_home}"
if run_installer "${rejected_home}" 2>/dev/null; then
  echo "v2 installer accepted an incorrect checksum" >&2
  exit 1
fi
[[ ! -e "${rejected_home}/.config/opencode/plugins/skill-timeline-v2.js" ]]

echo "v2 installer tests passed"
