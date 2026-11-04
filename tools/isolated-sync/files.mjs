// Private source materialization. Usage: imported by tools/isolated-sync.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import yaml from 'js-yaml';
import { assertSqlOperation, sqlFailure } from './diagnostics.mjs';
import {
  ADAPTER,
  FUNCTIONS,
  definitions,
  gateway,
  migrationInventory,
  projectNames,
  roles,
  sha256,
} from './profile.mjs';

/** Child output is private by default, including command failure diagnostics. */
export function execute(command, args, options = {}) {
  const { rawOutput = false, sqlOperation, ...spawnOptions } = options;
  assertSqlOperation(sqlOperation);
  const result = spawnSync(command, args, {
    stdio: 'pipe',
    encoding: 'utf8',
    windowsHide: true,
    timeout: 180000,
    maxBuffer: 16 * 1024 * 1024,
    ...spawnOptions,
  });
  if (result.error || result.status !== 0) {
    const error = new Error(
      `Child command failed (exit ${result.status ?? 'unavailable'}); output withheld. Retain the failed inventory for private review.`,
    );
    if (sqlOperation !== undefined) {
      const diagnostic = sqlFailure(sqlOperation, result.status, result.stderr, spawnOptions.input);
      error.sqlDiagnostic = diagnostic;
      error.message += ` SQL operation: ${diagnostic.operation}; SQLSTATE: ${diagnostic.sqlState ?? 'unavailable'}; input line: ${diagnostic.line ?? 'unavailable'}.`;
    }
    throw error;
  }
  return rawOutput ? result.stdout : result.stdout.trim();
}

/** Do not pass provider, hosted, shell-injection or credential-bearing ambient variables. */
export function privateEnvironment(directory, ambient = process.env) {
  const result = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT']) {
    if (ambient[key]) result[key] = ambient[key];
  }
  const home = path.join(directory, '.home');
  const temp = path.join(directory, '.tmp');
  return {
    ...result,
    HOME: home,
    USERPROFILE: home,
    APPDATA: home,
    LOCALAPPDATA: home,
    TEMP: temp,
    TMP: temp,
    TMPDIR: temp,
    DOCKER_CONFIG: path.join(home, '.docker'),
    DOCKER_HOST:
      process.platform === 'win32'
        ? 'npipe:////./pipe/docker_engine'
        : 'unix:///var/run/docker.sock',
    NO_COLOR: '1',
    SUPABASE_TELEMETRY_DISABLED: 'true',
  };
}

/** Require a nonsymlink private file/directory, never read its content to inspect permissions. */
export function assertPrivate(target, environmentDirectory = path.dirname(target)) {
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) throw new Error('Private paths cannot be symlinks.');
  if (process.platform !== 'win32') {
    if (stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0) {
      throw new Error('Private paths must be owned by this user with no group/other access.');
    }
    return;
  }
  for (const name of ['.home', '.tmp']) {
    const local = path.join(environmentDirectory, name);
    if (fs.existsSync(local) && fs.lstatSync(local).isSymbolicLink()) {
      throw new Error('Private helper directory cannot be a symlink.');
    }
    fs.mkdirSync(local, { recursive: true, mode: 0o700 });
  }
  const script = `
$ErrorActionPreference = 'Stop'
$acl = Get-Acl -LiteralPath $env:FINANCE_PRIVATE_PATH
$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$owner = $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value
$bad = @($acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier]) |
  Where-Object { $_.AccessControlType -eq 'Allow' -and $_.IdentityReference.Value -notin @($sid,'S-1-5-18','S-1-5-32-544') })
if ($owner -ne $sid -or $bad.Count -ne 0) { exit 1 }
Write-Output 'private'
`;
  if (
    execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      env: { ...privateEnvironment(environmentDirectory), FINANCE_PRIVATE_PATH: target },
    }) !== 'private'
  )
    throw new Error('Private Windows ACL verification failed.');
}

/** Confine every stage to one private workspace-local run directory. */
export function runDirectory(root, relative) {
  const parent = path.join(root, '.isolated-sync');
  const directory = path.resolve(root, relative);
  if (
    path.dirname(directory) !== parent ||
    !/^[a-z0-9][a-z0-9-]{0,49}$/.test(path.basename(directory))
  ) {
    throw new Error('Directory must be one named direct child of workspace .isolated-sync.');
  }
  assertPrivate(parent, parent);
  assertPrivate(directory, parent);
  if (!fs.lstatSync(directory).isDirectory()) throw new Error('Run directory must already exist.');
  return directory;
}

/** Write only a new named file inside the approved directory. */
export function writeNew(directory, relative, bytes) {
  const target = path.resolve(directory, relative);
  if (!target.startsWith(`${directory}${path.sep}`))
    throw new Error('Materialized path escaped directory.');
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 });
}

/** Read the approved Git object, not dirty files or another worktree. */
export function sourceReader(root) {
  return (args) =>
    execute('git', args, {
      cwd: root,
      env: { ...privateEnvironment(path.join(root, '.isolated-sync')), GIT_CONFIG_NOSYSTEM: '1' },
      rawOutput: args[0] === 'show',
    });
}

/** Build the complete source inventory before any private file is written. */
export function sourceInventory(source, git) {
  if (!/^[a-f0-9]{40}$/.test(source) || git(['rev-parse', 'HEAD']) !== source) {
    throw new Error('Source must be the full approved current HEAD commit.');
  }
  const tree = git(['ls-tree', '-rz', source])
    .split('\0')
    .map((line) => {
      const match = line.match(/^([0-9]+) (?:blob|commit) [a-f0-9]+\t([\s\S]+)$/);
      return match && { mode: match[1], name: match[2] };
    })
    .filter(Boolean);
  const extra = [
    ADAPTER,
    'services/api/supabase/tests/isolated-signup-adapter.test.sql',
    'services/api/supabase/tests/isolated-signup-contract.test.mjs',
    'services/api/supabase/config.toml',
    'services/api/powersync/sync-rules.yaml',
    'deploy/powersync.yaml',
    'tools/isolated-sync.mjs',
  ];
  const selected = tree.filter(
    ({ name }) =>
      extra.includes(name) ||
      name.startsWith(FUNCTIONS) ||
      /^services\/api\/supabase\/migrations\/[0-9]{14}_[^/]+\.sql$/.test(name) ||
      name.startsWith('tools/isolated-sync/'),
  );
  if (extra.some((name) => !selected.some((file) => file.name === name))) {
    throw new Error('Approved source is missing required bootstrap files.');
  }
  const sources = {};
  for (const { name, mode } of selected) {
    if (mode !== '100644' && mode !== '100755') throw new Error('Symlink source refused.');
    if (name.split('/').some((part) => part.startsWith('.env') || part === 'secrets')) {
      throw new Error('Environment/secret source refused.');
    }
    sources[name] = git(['show', `${source}:${name}`]);
  }
  const { migrations, versions } = migrationInventory(Object.keys(sources), sources[ADAPTER]);
  return { sources, migrations, versions };
}

/** Reconstruct the entire approved profile, including its exact workspace/location. */
export function buildArtifacts({ root, directory, source, project, git = sourceReader(root) }) {
  const names = projectNames(project);
  const { sources, migrations, versions } = sourceInventory(source, git);
  const pins = JSON.parse(sources['tools/isolated-sync/pins.json']);
  const { api, sync } = definitions(names, pins);
  const files = {
    'api.compose.json': `${JSON.stringify(api, null, 2)}\n`,
    'sync.compose.json': `${JSON.stringify(sync, null, 2)}\n`,
    'gateway.conf': gateway,
    'roles.sql': roles,
    'sync-rules.yaml': sources['services/api/powersync/sync-rules.yaml'],
    'powersync.yaml': sources['deploy/powersync.yaml'].replace('level: info', 'level: error'),
    'empty.compose-input': '',
    'adapter.sql': sources[ADAPTER],
    'adapter-regression.sql':
      sources['services/api/supabase/tests/isolated-signup-adapter.test.sql'],
    'supabase/config.toml': `project_id = "${project}"
[api]
port = 55431
[db]
port = 55432
shadow_port = 55430
major_version = 15
[db.seed]
enabled = false
[auth]
site_url = "http://localhost:4193"
additional_redirect_urls = ["http://localhost:4193"]
jwt_secret = "env(ISOLATED_JWT_SECRET)"
anon_key = "env(ISOLATED_ANON_KEY)"
service_role_key = "env(ISOLATED_SERVICE_ROLE_KEY)"
[studio]
enabled = false
[inbucket]
enabled = false
[analytics]
enabled = false
[realtime]
enabled = false
[storage]
enabled = false
${sources['services/api/supabase/config.toml'].match(/\[functions\.[\s\S]+/)?.[0] ?? ''}
`,
  };
  for (const name of Object.keys(sources)) {
    if (name.startsWith(FUNCTIONS) || migrations.includes(name)) {
      files[`supabase/${name.slice('services/api/supabase/'.length)}`] = sources[name];
    }
  }
  // Parsing at preparation time catches malformed rules without requiring Docker or secrets.
  yaml.load(files['sync-rules.yaml']);
  const envType = new yaml.Type('!env', { kind: 'scalar', construct: (name) => name });
  yaml.load(files['powersync.yaml'], { schema: yaml.DEFAULT_SCHEMA.extend([envType]) });
  const manifest = {
    format: 1,
    source,
    workspace: root,
    directory,
    names,
    pins,
    versions,
    sourceFiles: Object.fromEntries(
      Object.entries(sources).map(([name, bytes]) => [name, sha256(bytes)]),
    ),
    files: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, sha256(bytes)])),
    endpoints: {
      api: 'http://127.0.0.1:55431',
      db: '127.0.0.1:55432',
      powersync: 'http://127.0.0.1:55440',
      web: 'http://localhost:4193',
    },
  };
  return { files, manifest };
}

/** Produce only source/configuration artifacts; never create or consume credentials. */
export function materialize(options) {
  const { directory } = options;
  if (fs.readdirSync(directory).length !== 0)
    throw new Error('Run directory must be empty; never adopt it.');
  const { files, manifest } = buildArtifacts(options);
  for (const [name, bytes] of Object.entries(files)) writeNew(directory, name, bytes);
  writeNew(directory, 'inventory.json', `${JSON.stringify(manifest, null, 2)}\n`);
  writeNew(directory, 'state.json', JSON.stringify({ stage: 'prepared', resources: [] }));
  for (const name of ['.home', '.tmp']) fs.mkdirSync(path.join(directory, name), { mode: 0o700 });
  return { manifest, approval: sha256(JSON.stringify(manifest)) };
}

/** Refuse altered sources, generated files, environment files or linked CLI project state. */
export function loadInventory(root, directory) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'inventory.json'), 'utf8'));
  if (manifest.format !== 1) throw new Error('Unsupported inventory format.');
  projectNames(manifest.names.project);
  const expected = buildArtifacts({
    root,
    directory,
    source: manifest.source,
    project: manifest.names.project,
  }).manifest;
  if (JSON.stringify(expected) !== JSON.stringify(manifest))
    throw new Error('Source/profile/location inventory changed.');
  for (const [relative, expected] of Object.entries(manifest.files)) {
    const target = path.resolve(directory, relative);
    if (!target.startsWith(`${directory}${path.sep}`))
      throw new Error('Inventory path escaped run directory.');
    for (let cursor = target; cursor !== directory; cursor = path.dirname(cursor)) {
      if (fs.lstatSync(cursor).isSymbolicLink())
        throw new Error('Symlink materialized path refused.');
    }
    if (sha256(fs.readFileSync(target)) !== expected)
      throw new Error('Materialized file hash mismatch.');
  }
  for (const target of [directory, path.join(directory, 'supabase')]) {
    if (fs.readdirSync(target).some((name) => name.startsWith('.env'))) {
      throw new Error('Environment files are prohibited in the isolated CLI project.');
    }
  }
  const temporary = path.join(directory, 'supabase', '.temp');
  if (fs.existsSync(temporary) && fs.readdirSync(temporary).some((name) => name !== 'cli-latest')) {
    throw new Error('Linked/foreign CLI temporary state refused.');
  }
  return { manifest, approval: sha256(JSON.stringify(manifest)) };
}
