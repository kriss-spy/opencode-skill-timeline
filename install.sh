#!/usr/bin/env bash

set -euo pipefail

readonly release_base_url="${OPENCODE_SKILL_TIMELINE_RELEASE_URL:-https://github.com/kriss-spy/opencode-skill-timeline/releases/latest/download}"
readonly config_home="${XDG_CONFIG_HOME:-${HOME}/.config}"
readonly plugin_dir="${OPENCODE_CONFIG_DIR:-${config_home}/opencode}/plugins"
readonly plugin_path="${plugin_dir}/skill-timeline.js"
installer_tmp_dir="$(mktemp -d)"
readonly installer_tmp_dir

cleanup() {
  rm -rf -- "${installer_tmp_dir}"
}
trap cleanup EXIT

curl --fail --location --silent --show-error \
  "${release_base_url}/skill-timeline.js" \
  --output "${installer_tmp_dir}/skill-timeline.js"
curl --fail --location --silent --show-error \
  "${release_base_url}/skill-timeline.js.sha256" \
  --output "${installer_tmp_dir}/skill-timeline.js.sha256"

if command -v sha256sum >/dev/null 2>&1; then
  (cd "${installer_tmp_dir}" && sha256sum --check skill-timeline.js.sha256)
elif command -v shasum >/dev/null 2>&1; then
  readonly expected_checksum="$(cut -d ' ' -f 1 "${installer_tmp_dir}/skill-timeline.js.sha256")"
  readonly actual_checksum="$(shasum -a 256 "${installer_tmp_dir}/skill-timeline.js" | cut -d ' ' -f 1)"
  if [[ "${actual_checksum}" != "${expected_checksum}" ]]; then
    echo "Checksum verification failed." >&2
    exit 1
  fi
else
  echo "A SHA-256 utility (sha256sum or shasum) is required." >&2
  exit 1
fi

mkdir -p -- "${plugin_dir}"
install -m 0644 "${installer_tmp_dir}/skill-timeline.js" "${plugin_path}"

echo "Installed skill-timeline to ${plugin_path}"
echo "Restart OpenCode, open a session, and run /skill-timeline."
