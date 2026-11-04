// Synthetic subprocess output only. Usage: node --test tools/isolated-sync/diagnostics.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { execute, materialize, privateEnvironment } from './files.mjs';
import { isSqlDiagnostic } from './diagnostics.mjs';
import { fixture } from './fixtures.mjs';
import { assertStage, runStage } from './runtime.mjs';

const privateOutput = 'synthetic-private-output-must-not-be-retained';

function failure(stderr, options = {}) {
  let actual;
  assert.throws(
    () =>
      execute(
        process.execPath,
        [
          '-e',
          `process.stdout.write(${JSON.stringify(privateOutput)}); process.stderr.write(${JSON.stringify(stderr)}); process.exit(3);`,
        ],
        { input: 'SELECT 1;\nSELECT 2;\n', ...options },
      ),
    (error) => {
      actual = error;
      assert.equal(error.message.includes(privateOutput), false);
      assert.equal(JSON.stringify(error).includes(privateOutput), false);
      return true;
    },
  );
  return actual;
}

test('psql failure retains only operation, SQLSTATE and bounded input line', () => {
  for (const newline of ['\n', '\r\n']) {
    const error = failure(
      `${privateOutput}${newline}psql:<stdin>:2: ERROR:  42501${newline}CONTEXT: ${privateOutput}`,
      { sqlOperation: 'adapter-regression' },
    );
    assert.deepEqual(error.sqlDiagnostic, {
      operation: 'adapter-regression',
      sqlState: '42501',
      line: 2,
    });
    assert.match(error.message, /SQLSTATE: 42501; input line: 2/);
    assert.equal(isSqlDiagnostic(error.sqlDiagnostic), true);
  }
});

test('malformed, verbose, ambiguous and out-of-range diagnostics reveal no output', () => {
  for (const stderr of [
    privateOutput,
    'psql:<stdin>:0: ERROR: 42501',
    'psql:<stdin>:999999999: ERROR: 42501',
    'psql:<stdin>:4: ERROR: 42501',
    'psql:<stdin>:2: ERROR: 00000',
    `psql:<stdin>:2: ERROR: 42501 ${privateOutput}`,
    'psql:<stdin>:2: ERROR: 42501\npsql:<stdin>:3: ERROR: 42P01',
    `psql:${privateOutput}:2: ERROR: 42501`,
    `psql:<stdin>:2: ERROR: ${privateOutput}`,
  ]) {
    assert.deepEqual(failure(stderr, { sqlOperation: 'adapter-install' }).sqlDiagnostic, {
      operation: 'adapter-install',
      sqlState: null,
      line: null,
    });
  }
});

test('ordinary subprocess failures never parse output or accept arbitrary operation labels', () => {
  assert.equal(failure('psql:<stdin>:2: ERROR: 42501').sqlDiagnostic, undefined);
  assert.throws(
    () => execute(process.execPath, ['-e', 'process.exit(0)'], { sqlOperation: privateOutput }),
    /^Error: Unknown SQL diagnostic operation\.$/,
  );
  assert.equal(isSqlDiagnostic(null), false);
  for (const value of [
    { operation: privateOutput, sqlState: null, line: null },
    { operation: 'adapter-install', sqlState: privateOutput, line: 2 },
    { operation: 'adapter-install', sqlState: '42501', line: -1 },
    { operation: 'adapter-install', sqlState: '42501', line: 2, output: privateOutput },
    { operation: 'adapter-install', sqlState: null, line: 2 },
    { operation: 'adapter-install', sqlState: '42501', line: '2' },
  ]) {
    assert.equal(isSqlDiagnostic(value), false);
  }
});

test('runtime retains classified failure evidence and keeps the failed run terminal', async () => {
  const f = fixture();
  try {
    materialize(f.options);
    if (process.platform === 'win32') {
      execute(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `
$ErrorActionPreference = 'Stop'
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = [System.Security.AccessControl.DirectorySecurity]::new()
$acl.SetOwner($user)
$acl.SetAccessRuleProtection($true, $false)
$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new(
  $user, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
Set-Acl -LiteralPath $env:FINANCE_PRIVATE_PATH -AclObject $acl
`,
        ],
        { env: { ...privateEnvironment(f.directory), FINANCE_PRIVATE_PATH: f.directory } },
      );
    }
    const error = failure('psql:<stdin>:2: ERROR: 42501', {
      sqlOperation: 'adapter-regression',
    });
    await assert.rejects(
      runStage({
        directory: f.directory,
        manifest: f.manifest,
        approval: 'approved',
        supplied: 'approved',
        stage: 'database',
        run: () => {
          throw error;
        },
      }),
      /SQLSTATE: 42501/,
    );
    const state = JSON.parse(fs.readFileSync(path.join(f.directory, 'state.json'), 'utf8'));
    assert.equal(state.failed, true);
    assert.equal(state.stage, 'prepared');
    assert.deepEqual(state.sqlFailure, error.sqlDiagnostic);
    assert.equal(JSON.stringify(state).includes(privateOutput), false);
    assert.equal(fs.existsSync(path.join(f.directory, 'stage.lock')), false);
    assert.throws(() => assertStage('database', state, 'approved', 'approved'), /failed/);
  } finally {
    f.cleanup();
  }
});
