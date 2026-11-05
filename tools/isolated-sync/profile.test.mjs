// Synthetic-only contract tests. Usage: node --test tools/isolated-sync/*.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { test } from 'node:test';
import {
  ADAPTER,
  LABEL,
  MIGRATIONS,
  definitions,
  gateway,
  migrationInventory,
  projectNames,
  sha256,
  validateCredentials,
} from './profile.mjs';
import {
  assertPrivate,
  execute,
  materialize,
  privateEnvironment,
  sourceInventory,
} from './files.mjs';
import {
  assertFreePorts,
  assertFresh,
  CONTAINER_FORMAT,
  hostPath,
  validateContainer,
  verifyStageResources,
} from './ownership.mjs';
import { assertStage, runStage } from './runtime.mjs';
import {
  root,
  pins,
  source,
  project,
  names,
  migrationNames,
  sources,
  git,
  fixture,
} from './fixtures.mjs';

test('private permission gate accepts only the current user-owned fixture', () => {
  const f = fixture();
  try {
    if (process.platform === 'win32') {
      for (const name of ['.home', '.tmp']) fs.mkdirSync(path.join(f.directory, name));
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
    } else {
      fs.chmodSync(f.directory, 0o700);
    }
    assertPrivate(f.directory, f.directory);
    if (process.platform !== 'win32') {
      fs.chmodSync(f.directory, 0o750);
      assert.throws(() => assertPrivate(f.directory, f.directory), /group\/other/);
    }
  } finally {
    f.cleanup();
  }
});

test('all seven images are immutable, with separate CLI and PowerSync source pins', () => {
  assert.equal(Object.keys(pins.images).length, 7);
  for (const image of Object.values(pins.images)) assert.match(image, /@sha256:[a-f0-9]{64}$/);
  assert.equal(pins.cli.version, '2.75.0');
  assert.match(pins.cli.source, /^[a-f0-9]{40}$/);
  assert.match(pins.powersyncSource, /^[a-f0-9]{40}$/);
  assert.match(pins.images.mongo, /^mongo:8\.0\.20@sha256:/);
  assert.throws(
    () => definitions(names, { ...pins, images: { db: 'postgres:latest' } }),
    /immutable/,
  );
});

test('names cannot be shared, hosted or injected', () => {
  for (const value of [
    'finance-local',
    'finance-sync-proof-',
    '../outside',
    'finance-sync-proof-x;stop',
  ]) {
    assert.throws(() => projectNames(value));
  }
  assertFresh(names, { container: ['foreign'], network: [], volume: [] });
  for (const kind of ['container', 'network', 'volume']) {
    assert.throws(() => assertFresh(names, { [kind]: [`${project}-existing`] }), /Preexisting/);
  }
});

test('complete exact 60-version chain is required, never a successful subset', () => {
  assert.equal(migrationInventory(migrationNames, sources[ADAPTER]).versions.length, 60);
  for (const files of [
    migrationNames.slice(1),
    [...migrationNames, `${MIGRATIONS}20990101000001_future.sql`],
    [...migrationNames.slice(0, -1), migrationNames[0]],
  ]) {
    assert.throws(() => migrationInventory(files, sources[ADAPTER]), /inventory mismatch/);
  }
});

test('preparation preserves exact Git bytes and hashes every migration, function and adapter', () => {
  const f = fixture();
  try {
    const result = materialize(f.options);
    assert.equal(result.manifest.versions.length, 60);
    assert.equal(
      result.manifest.sourceFiles[migrationNames[0]],
      sha256(sources[migrationNames[0]]),
    );
    assert.equal(
      readRelative(f.directory, `supabase/migrations/${path.posix.basename(migrationNames[0])}`),
      sources[migrationNames[0]],
    );
    assert.equal(result.manifest.files['adapter.sql'], sha256(sources[ADAPTER]));
    assert.equal(result.manifest.directory, f.directory);
    assert.equal(fs.existsSync(path.join(f.directory, 'private-input.json')), false);
    assert.throws(() => materialize(f.options), /empty/);
  } finally {
    f.cleanup();
  }
});

function readRelative(directory, relative) {
  return fs.readFileSync(path.join(directory, relative), 'utf8');
}

test('wrong revision, symlink sources and environment source files fail before writing', () => {
  assert.throws(() => sourceInventory('main', git), /full approved/);
  assert.throws(
    () =>
      sourceInventory(source, (args) =>
        args[0] === 'ls-tree' ? git(args).replace('100644', '120000') : git(args),
      ),
    /Symlink/,
  );
  assert.throws(
    () =>
      sourceInventory(source, (args) =>
        args[0] === 'ls-tree'
          ? [git(args), `100644 blob ${source}\tservices/api/supabase/functions/.env`].join('\0')
          : git(args),
      ),
    /secret source/,
  );
  const unusual = 'services/api/supabase/functions/nested/caf\u00e9.ts';
  const inventory = sourceInventory(source, (args) => {
    if (args[0] === 'ls-tree') return [git(args), `100644 blob ${source}\t${unusual}`].join('\0');
    if (args[0] === 'show' && args[1] === `${source}:${unusual}`) return '// exact bytes\n';
    return git(args);
  });
  assert.equal(inventory.sources[unusual], '// exact bytes\n');
});

test('profile has no shared resources, foreign mounts, implicit env files or wildcard publications', () => {
  const { api, sync } = definitions(names, pins);
  assert.deepEqual(api.services.db.ports, ['127.0.0.1:55432:5432']);
  assert.deepEqual(api.services.gateway.ports, ['127.0.0.1:55431:8000']);
  assert.deepEqual(sync.services.powersync.ports, ['127.0.0.1:55440:8080']);
  assert.equal(sync.services.mongo.ports, undefined);
  assert.equal(sync.services['mongo-init'].ports, undefined);
  assert.deepEqual(sync.services.powersync.networks, ['private', 'backend']);
  assert.deepEqual(sync.services.mongo.networks, ['private']);
  assert.deepEqual(sync.services.mongo.tmpfs, ['/data/configdb']);
  assert.deepEqual(sync.services['mongo-init'].tmpfs, ['/data/db', '/data/configdb']);
  assert.deepEqual(api.services.db.command.slice(0, 3), ['postgres', '-D', '/etc/postgresql']);
  for (const service of [...Object.values(api.services), ...Object.values(sync.services)]) {
    assert.equal(service.env_file, undefined);
    assert.equal(service.logging.driver, 'none');
    assert.equal(service.restart, 'no');
    assert.equal(service.labels[LABEL], '${ISOLATED_INVENTORY:?human approval required}');
  }
  assert.match(gateway, /auth-login\|auth-signup\|auth-refresh\|auth-logout/);
  assert.match(gateway, /location \/ \{ return 404;/);
  assert.doesNotMatch(
    JSON.stringify({ api, sync }),
    /finance-local|latest|\/etc\/passwd|seed\.sql|supabase_network/,
  );
});

test('ambient hosted/provider/process/registry configuration is not inherited', () => {
  const result = privateEnvironment(path.join(root, '.fixture'), {
    PATH: 'synthetic-path',
    SUPABASE_ACCESS_TOKEN: 'synthetic-placeholder',
    PS_PG_URI: 'synthetic-placeholder',
    NODE_OPTIONS: 'synthetic-placeholder',
    DOCKER_HOST: 'tcp://hosted.invalid',
    DOCKER_CONTEXT: 'hosted',
    COMPOSE_FILE: 'foreign',
    PGHOST: 'hosted.invalid',
    VITE_E2E_MOCK: 'true',
    GOOGLE_CLIENT_ID: 'synthetic-placeholder',
  });
  assert.equal(result.PATH, 'synthetic-path');
  for (const key of [
    'SUPABASE_ACCESS_TOKEN',
    'PS_PG_URI',
    'NODE_OPTIONS',
    'DOCKER_CONTEXT',
    'COMPOSE_FILE',
    'PGHOST',
    'VITE_E2E_MOCK',
    'GOOGLE_CLIENT_ID',
  ])
    assert.equal(result[key], undefined);
  assert.doesNotMatch(result.DOCKER_HOST, /hosted/);
  assert.ok(result.HOME.startsWith(root));
});

test('upstream output is never included in classified child failures', () => {
  assert.throws(
    () =>
      execute(process.execPath, [
        '-e',
        'process.stderr.write("synthetic-private-diagnostic"); process.exit(7)',
      ]),
    (error) => {
      assert.match(error.message, /exit 7/);
      assert.doesNotMatch(error.message, /synthetic-private/);
      return true;
    },
  );
});

test('repository format and lint exclude private inputs and inventoried runtime files', async () => {
  const { getFileInfo } = await import('prettier');
  const { ESLint } = await import('eslint');
  const eslint = new ESLint({ cwd: root });
  for (const relative of [
    '.isolated-sync/synthetic/private-input.json',
    '.isolated-sync/synthetic/supabase/functions/main/index.ts',
  ]) {
    const target = path.join(root, relative);
    assert.equal(
      (await getFileInfo(target, { ignorePath: path.join(root, '.prettierignore') })).ignored,
      true,
    );
    assert.equal(await eslint.isPathIgnored(target), true);
  }
});

test('approval, ordering and failed-run gates are hard failures', async () => {
  assertStage('database', { stage: 'prepared' }, 'approved', 'approved');
  assert.throws(
    () => assertStage('database', { stage: 'prepared' }, 'approved', 'other'),
    /Human approval/,
  );
  assert.throws(
    () => assertStage('api', { stage: 'prepared' }, 'approved', 'approved'),
    /out of order/,
  );
  assert.throws(
    () => assertStage('migrate', { stage: 'database', failed: true }, 'approved', 'approved'),
    /failed/,
  );
  assert.throws(() => assertStage('remove', { stage: 'database' }, 'approved', 'approved'), /Stop/);
  assertStage('stop', { stage: 'database', failed: true }, 'approved', 'approved');
  const f = fixture();
  try {
    materialize(f.options);
    await assert.rejects(
      runStage({
        directory: f.directory,
        manifest: f.manifest,
        approval: 'approved',
        supplied: 'other',
        stage: 'database',
        run: () => assert.fail('No child invocation before approval.'),
      }),
      /Human approval/,
    );
  } finally {
    f.cleanup();
  }
});

test('credential errors never echo malformed private input', () => {
  assert.throws(
    () =>
      validateCredentials({
        databasePassword: "synthetic-quote-containing-password'",
        jwtSecret: 'synthetic-jwt-secret-placeholder-long',
        anonKey: 'not-a-token',
        serviceRoleKey: 'not-a-token',
      }),
    /URL-safe/,
  );
  assert.throws(
    () => validateCredentials({ unexpected: 'synthetic-private-placeholder' }),
    (error) => !error.message.includes('synthetic-private-placeholder'),
  );
  assert.throws(
    () =>
      validateCredentials({
        databasePassword: 'synthetic-password-placeholder',
        jwtSecret: 'synthetic-jwt-secret-placeholder-long',
        anonKey: 'not-a-token',
        serviceRoleKey: 'not-a-token',
      }),
    /valid unexpired HS256/,
  );
});

test('ownership validator rejects foreign labels, images, mounts, networks and IPv6/wildcard exposure', () => {
  const directory = path.join(root, '.fixture');
  const base = {
    name: names.containers.gateway,
    image: pins.images.gateway,
    labels: { [LABEL]: 'approved' },
    networks: { [names.backend]: {} },
    ports: { '8000/tcp': [{ HostIp: '127.0.0.1', HostPort: '55431' }] },
    mounts: [
      {
        Type: 'bind',
        Source: path.join(directory, 'gateway.conf'),
        Destination: '/etc/nginx/nginx.conf',
        RW: false,
      },
    ],
  };
  validateContainer(base, { names, pins }, directory, 'approved');
  for (const mutate of [
    (r) => {
      r.labels[LABEL] = 'foreign';
    },
    (r) => {
      r.image = 'nginx:latest';
    },
    (r) => {
      r.networks.foreign = {};
    },
    (r) => {
      r.mounts[0].RW = true;
    },
    (r) => {
      r.mounts[0].Source = path.join(root, 'foreign');
    },
    (r) => {
      r.ports['8000/tcp'][0].HostIp = '0.0.0.0';
    },
    (r) => {
      r.ports['8000/tcp'][0].HostIp = '::';
    },
  ]) {
    const record = structuredClone(base);
    mutate(record);
    assert.throws(() => validateContainer(record, { names, pins }, directory, 'approved'));
  }
  assert.doesNotMatch(CONTAINER_FORMAT, /Config\.Env|\.Args|\.Cmd/);
  assert.equal(hostPath('/run/desktop/mnt/host/c/Users/fixture'), 'c:/users/fixture');
});

test('occupied IPv4 and IPv6 ports fail without stopping any listener', async () => {
  const f = fixture();
  try {
    materialize(f.options);
    for (const host of ['127.0.0.1', '::1']) {
      const server = net.createServer();
      await new Promise((resolve) => server.listen({ port: 0, host, ipv6Only: true }, resolve));
      try {
        await assert.rejects(assertFreePorts([server.address().port], f.directory), /unavailable/);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    }
  } finally {
    f.cleanup();
  }
});

test('stage success requires every expected live service and completed one-shot', () => {
  const resources = [
    { kind: 'network' },
    { kind: 'network' },
    { kind: 'volume' },
    { kind: 'volume' },
    { kind: 'container', name: names.containers.db, running: true },
  ];
  verifyStageResources('database', resources, names);
  assert.throws(() => verifyStageResources('database', resources.slice(1), names), /population/);
  assert.throws(
    () =>
      verifyStageResources(
        'database',
        [...resources.slice(0, -1), { ...resources.at(-1), running: false }],
        names,
      ),
    /state mismatch/,
  );
  verifyStageResources(
    'migrate',
    [...resources, { kind: 'container', name: names.containers['auth-migrate'], running: false }],
    names,
  );
  assert.throws(
    () =>
      verifyStageResources(
        'migrate',
        [
          ...resources,
          { kind: 'container', name: names.containers['auth-migrate'], running: true },
        ],
        names,
      ),
    /state mismatch/,
  );
});
