// Nonsecret SQL failure metadata. Usage: imported by files.mjs and runtime.mjs.
const SQL_OPERATIONS = new Set([
  'migration-preconditions',
  'migration-history',
  'adapter-regression',
  'adapter-install',
  'adapter-postconditions',
  'rule-columns',
  'rule-rls',
  'publication-create',
  'publication-inventory',
  'readiness-replication',
]);

/** Reject unreviewed labels before starting a subprocess. */
export function assertSqlOperation(operation) {
  if (operation !== undefined && !SQL_OPERATIONS.has(operation))
    throw new Error('Unknown SQL diagnostic operation.');
}

/** Accept only fixed operation names, SQLSTATE codes and bounded input line numbers. */
export function isSqlDiagnostic(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    Object.keys(value).sort().join(',') === 'line,operation,sqlState' &&
    SQL_OPERATIONS.has(value.operation) &&
    ((value.sqlState === null && value.line === null) ||
      (typeof value.sqlState === 'string' &&
        /^[0-9A-Z]{5}$/.test(value.sqlState) &&
        value.sqlState !== '00000' &&
        Number.isSafeInteger(value.line) &&
        value.line > 0 &&
        value.line <= 99999999))
  );
}

/** Discard all subprocess content except an unambiguous SQLSTATE-only psql error. */
export function sqlFailure(operation, status, stderr, input) {
  assertSqlOperation(operation);
  const diagnostic = { operation, sqlState: null, line: null };
  const matches = [
    ...(stderr ?? '').matchAll(
      /^psql:<stdin>:([1-9][0-9]{0,7}): (?:ERROR|FATAL): ([0-9A-Z]{5})\r?$/gm,
    ),
  ];
  if (
    status === 3 &&
    matches.length === 1 &&
    matches[0][2] !== '00000' &&
    typeof input === 'string' &&
    Number(matches[0][1]) <= input.split(/\r\n|\r|\n/).length
  ) {
    diagnostic.line = Number(matches[0][1]);
    diagnostic.sqlState = matches[0][2];
  }
  return diagnostic;
}
