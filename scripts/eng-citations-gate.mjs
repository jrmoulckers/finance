#!/usr/bin/env node
/**
 * Blocking wrapper around the ENG-* citation checker.
 *
 * The checker distinguishes two failures, and a required CI check must treat
 * them differently:
 *
 *   exit 1  a citation names an ENG-* ID that does not exist, or restates a
 *           principle's title wrongly. That is a defect in this repository and
 *           must stop the merge.
 *   exit 2  the upstream principles index could not be fetched. That is an
 *           outage in another repository. Failing on it would let an upstream
 *           incident block every merge in finance, so it warns instead.
 *
 * Collapsing the two is the easy mistake: a wrapper that treats "nonzero" as
 * "broken" couples this repository's merge queue to another repository's
 * availability, and a wrapper that treats exit 2 as success reports green
 * while verifying nothing.
 */

import { spawnSync } from 'node:child_process';

const CHECKER = 'config/engineering/citations/check-citations.mjs';

/**
 * Run the citation checker and translate its exit code into a gate decision.
 *
 * @returns {number} process exit code: 0 to allow the merge, 1 to block it.
 */
function main() {
  const result = spawnSync(process.execPath, [CHECKER, '.'], {
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    process.stderr.write(`::error::Could not run ${CHECKER}: ${result.error.message}\n`);
    return 1;
  }

  // A signal death has a null status and is not an upstream outage.
  if (result.status === null) {
    process.stderr.write(`::error::${CHECKER} terminated by signal ${result.signal}.\n`);
    return 1;
  }

  if (result.status === 0) return 0;

  if (result.status === 2) {
    process.stderr.write(
      '::warning::Upstream principles index unreachable; citation content was not verified. Not blocking.\n',
    );
    return 0;
  }

  process.stderr.write(`::error::ENG-* citation check failed (exit ${result.status}).\n`);
  return 1;
}

process.exit(main());
