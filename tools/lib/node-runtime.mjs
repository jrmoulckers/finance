// @ts-check

/**
 * Read a Node major from `.nvmrc` or a runtime version string.
 *
 * @param {string} value
 * @returns {number | null}
 */
export function parseNodeMajor(value) {
  const match = String(value ?? '')
    .trim()
    .match(/^v?(\d+)(?:\.|$)/);
  return match ? Number(match[1]) : null;
}

/**
 * Compare a running Node version with the repository's `.nvmrc` contents.
 *
 * @param {string} nvmrc
 * @param {string} runtimeVersion
 * @returns {{
 *   ok: boolean,
 *   expectedMajor: number | null,
 *   runtimeMajor: number | null,
 *   message: string
 * }}
 */
export function compareNodeMajor(nvmrc, runtimeVersion) {
  const expectedMajor = parseNodeMajor(nvmrc);
  const runtimeMajor = parseNodeMajor(runtimeVersion);

  if (expectedMajor === null) {
    return {
      ok: false,
      expectedMajor,
      runtimeMajor,
      message: 'Could not read a Node major from .nvmrc.',
    };
  }
  if (runtimeMajor === null) {
    return {
      ok: false,
      expectedMajor,
      runtimeMajor,
      message: `Could not read the running Node version (${runtimeVersion || 'empty'}).`,
    };
  }
  if (runtimeMajor !== expectedMajor) {
    return {
      ok: false,
      expectedMajor,
      runtimeMajor,
      message:
        `Node ${runtimeVersion} does not match .nvmrc (${expectedMajor}).\n` +
        'Lockfiles generated here may be rejected by CI when npm majors differ.\n' +
        'Use: nvm use   (or fnm use / volta pin)',
    };
  }

  return {
    ok: true,
    expectedMajor,
    runtimeMajor,
    message: '',
  };
}
