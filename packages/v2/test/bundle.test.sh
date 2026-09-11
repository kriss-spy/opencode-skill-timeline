#!/usr/bin/env bash

set -euo pipefail

readonly test_tmp_dir="$(mktemp -d)"
trap 'rm -rf -- "${test_tmp_dir}"' EXIT

cp ../dist/skill-timeline-v2.js "${test_tmp_dir}/skill-timeline-v2.js"

(
  cd "${test_tmp_dir}"
  TMPDIR="${test_tmp_dir}" \
    BUN_TMPDIR="${test_tmp_dir}" \
    BUN_INSTALL_CACHE_DIR="${test_tmp_dir}" \
    bun -e '
    const module = await import("./skill-timeline-v2.js")
    if (module.default?.id !== "skill-timeline-v2") throw new Error("missing v2 plugin definition")
    if (typeof module.default?.setup !== "function") throw new Error("missing v2 plugin setup")
  '
)

echo "v2 standalone bundle test passed"
