// Human-only lifecycle. Usage: tools/isolated-sync.mjs <stage> --approve <inventory hash>.
import fs from 'node:fs';
import path from 'node:path';
import { assertPrivate, execute, privateEnvironment } from './files.mjs';
import { LABEL, PORTS, validateCredentials } from './profile.mjs';
import {
  assertFreePorts,
  assertFresh,
  inspectResources,
  resourceNames,
  verifyStageResources,
} from './ownership.mjs';
import { installAdapter, migrate, verifyAdapter, verifyHistory } from './database.mjs';

const ORDER = ['prepared', 'database', 'migrate', 'adapter', 'api', 'sync', 'readiness'];

/** Require explicit approval of the exact inventory before reading any private runtime input. */
export function assertStage(stage, state, approval, supplied) {
  if (approval !== supplied)
    throw new Error('Human approval must match the exact prepared inventory SHA256.');
  if (['stop', 'remove'].includes(stage)) {
    if (stage === 'remove' && state.stage !== 'stopped')
      throw new Error('Stop and verify ownership before removal.');
    if (state.stage === 'removed') throw new Error('Run has already been retired.');
    return;
  }
  if (ORDER.indexOf(stage) !== ORDER.indexOf(state.stage) + 1 || state.failed) {
    throw new Error('Stage is out of order or this run failed. No retry/adoption/heal fallback.');
  }
}

/** Construct only local, inventory-owned credential destinations; no URI is accepted from a user. */
export function runtimeEnvironment(directory, manifest, approval, credentials) {
  const env = privateEnvironment(directory);
  const { databasePassword, jwtSecret, anonKey, serviceRoleKey } = validateCredentials(credentials);
  const uri = (role) =>
    `postgresql://${role}:${encodeURIComponent(databasePassword)}@${manifest.names.containers.db}:5432/postgres?sslmode=disable`;
  return {
    ...env,
    ISOLATED_INVENTORY: approval,
    ISOLATED_DB_PASSWORD: databasePassword,
    ISOLATED_JWT_SECRET: jwtSecret,
    ISOLATED_ANON_KEY: anonKey,
    ISOLATED_SERVICE_ROLE_KEY: serviceRoleKey,
    ISOLATED_AUTH_DB_URI: uri('supabase_auth_admin'),
    ISOLATED_REST_DB_URI: uri('authenticator'),
    ISOLATED_REPLICATION_DB_URI: uri('postgres'),
    PGPASSWORD: databasePassword,
  };
}

/** Execute one approved stage. No Docker/CLI command runs while importing this module. */
export async function runStage({
  directory,
  manifest,
  approval,
  supplied,
  stage,
  cli,
  run = execute,
  checkPorts = assertFreePorts,
}) {
  if (approval !== supplied)
    throw new Error('Human approval must match the exact prepared inventory SHA256.');
  const statePath = path.join(directory, 'state.json');
  assertPrivate(statePath);
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assertStage(stage, state, approval, supplied);
  const lock = path.join(directory, 'stage.lock');
  const lockFd = fs.openSync(lock, 'wx', 0o600);
  const save = () =>
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  let env = privateEnvironment(directory);
  const docker = (args, input) =>
    run('docker', args, { cwd: directory, env, input, timeout: 600000 });
  const compose = (which, args) =>
    docker([
      'compose',
      '--env-file',
      path.join(directory, 'empty.compose-input'),
      '--project-directory',
      directory,
      '-p',
      manifest.names[which === 'api' ? 'apiProject' : 'syncProject'],
      '-f',
      path.join(directory, `${which}.compose.json`),
      ...args,
    ]);
  const sql = (input) =>
    docker(
      [
        'exec',
        '-i',
        manifest.names.containers.db,
        'psql',
        '-X',
        '-qAt',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'postgres',
        '-d',
        'postgres',
      ],
      input,
    );
  const inspect = (prior = state.resources) =>
    inspectResources(docker, manifest, directory, approval, prior);
  const wait = (service) => {
    if (docker(['container', 'wait', manifest.names.containers[service]]) !== '0') {
      throw new Error('Isolated one-shot container failed; no server startup is permitted.');
    }
  };
  const context = {
    manifest,
    directory,
    cli,
    compose,
    sql,
    wait,
    historyHash: state.historyHash,
    requireHistoryHash: stage !== 'migrate',
    executeCli: (command, args) => run(command, args, { cwd: directory, env, timeout: 600000 }),
  };
  try {
    const version = JSON.parse(docker(['version', '--format', '{{json .Server}}']));
    if (
      version.Os !== 'linux' ||
      !/^\d+\./.test(version.Version) ||
      Number(version.Version.split('.')[0]) < 28
    ) {
      throw new Error(
        'Local Linux Docker Engine >=28 is required for loopback publication safety.',
      );
    }
    const composeVersion = docker(['compose', 'version', '--short'])
      .replace(/^v/, '')
      .split('.')
      .map(Number);
    if (composeVersion[0] !== 2 || composeVersion[1] < 39)
      throw new Error('Docker Compose 2.39+ is required.');
    if (stage === 'database') {
      assertFresh(manifest.names, resourceNames(docker));
      await checkPorts(PORTS, directory);
    } else {
      state.resources = inspect();
    }
    if (!['stop', 'remove'].includes(stage)) {
      if (!cli || !path.isAbsolute(cli))
        throw new Error('Supply the absolute workspace-local pinned CLI path.');
      if (
        !cli.startsWith(`${path.dirname(path.dirname(directory))}${path.sep}`) ||
        fs.lstatSync(cli).isSymbolicLink()
      ) {
        throw new Error('Pinned CLI must be a nonsymlink executable inside this workspace.');
      }
      for (let cursor = cli; cursor !== manifest.workspace; cursor = path.dirname(cursor)) {
        if (path.dirname(cursor) === cursor || fs.lstatSync(cursor).isSymbolicLink()) {
          throw new Error('Pinned CLI ancestor escaped the workspace or is a symlink.');
        }
      }
      if (run(cli, ['--version'], { cwd: directory, env }) !== manifest.pins.cli.version) {
        throw new Error('Supabase CLI version differs from the reviewed pin.');
      }
      const inputPath = path.join(directory, 'private-input.json');
      assertPrivate(inputPath);
      env = runtimeEnvironment(
        directory,
        manifest,
        approval,
        JSON.parse(fs.readFileSync(inputPath, 'utf8')),
      );
    }
    // Persist the in-flight marker before the first mutation. Interrupted stages are never retried.
    state.failed = true;
    state.attemptedStage = stage;
    save();
    if (stage === 'database') {
      for (const name of [manifest.names.backend, manifest.names.syncNetwork]) {
        docker([
          'network',
          'create',
          '--driver',
          'bridge',
          '--label',
          `${LABEL}=${approval}`,
          '--opt',
          'com.docker.network.bridge.host_binding_ipv4=127.0.0.1',
          ...(name === manifest.names.syncNetwork ? ['--internal'] : []),
          name,
        ]);
      }
      for (const name of [manifest.names.database, manifest.names.mongoVolume]) {
        docker(['volume', 'create', '--driver', 'local', '--label', `${LABEL}=${approval}`, name]);
      }
      state.resources = inspect([]);
      save();
      for (const image of ['db', 'auth']) docker(['pull', manifest.pins.images[image]]);
      compose('api', [
        'up',
        '-d',
        '--no-deps',
        '--no-recreate',
        '--pull',
        'never',
        '--wait',
        '--wait-timeout',
        '180',
        'db',
      ]);
    } else if (stage === 'migrate') {
      state.historyHash = migrate(context);
      state.appliedSourceFiles = Object.fromEntries(
        Object.entries(manifest.sourceFiles).filter(([name]) =>
          /^services\/api\/supabase\/migrations\/[0-9]{14}_[^/]+\.sql$/.test(name),
        ),
      );
    } else if (stage === 'adapter') {
      installAdapter(context);
    } else if (stage === 'api') {
      verifyHistory(context);
      verifyAdapter(context);
      await checkPorts([55431], directory);
      for (const image of ['rest', 'edge', 'gateway'])
        docker(['pull', manifest.pins.images[image]]);
      compose('api', [
        'up',
        '-d',
        '--no-deps',
        '--no-recreate',
        '--pull',
        'never',
        'auth',
        'rest',
        'edge',
      ]);
      state.resources = inspect();
      save();
      compose('api', [
        'up',
        '-d',
        '--no-deps',
        '--no-recreate',
        '--pull',
        'never',
        '--wait',
        '--wait-timeout',
        '180',
        'gateway',
      ]);
    } else if (stage === 'sync') {
      verifyHistory(context);
      verifyAdapter(context);
      await checkPorts([55440], directory);
      for (const image of ['mongo', 'powersync']) docker(['pull', manifest.pins.images[image]]);
      compose('sync', [
        'up',
        '-d',
        '--no-deps',
        '--no-recreate',
        '--pull',
        'never',
        '--wait',
        '--wait-timeout',
        '180',
        'mongo',
      ]);
      compose('sync', ['up', '-d', '--no-deps', '--no-recreate', '--pull', 'never', 'mongo-init']);
      wait('mongo-init');
      compose('sync', [
        'up',
        '-d',
        '--no-deps',
        '--no-recreate',
        '--pull',
        'never',
        '--wait',
        '--wait-timeout',
        '180',
        'powersync',
      ]);
    } else if (stage === 'readiness') {
      verifyHistory(context);
      verifyAdapter(context);
      for (const endpoint of [
        'http://127.0.0.1:55431/auth/v1/health',
        'http://127.0.0.1:55440/probes/liveness',
        'http://127.0.0.1:55440/probes/readiness',
      ]) {
        const response = await fetch(endpoint, {
          redirect: 'error',
          signal: AbortSignal.timeout(10000),
        });
        await response.body?.cancel();
        if (!response.ok) throw new Error('Isolated HTTP readiness probe failed.');
      }
      if (sql('SELECT EXISTS (SELECT 1 FROM pg_replication_slots WHERE active);') !== 't') {
        throw new Error('No active replication slot; replication transport is not ready.');
      }
    } else if (stage === 'stop') {
      for (const resource of [...state.resources]
        .reverse()
        .filter((item) => item.kind === 'container')) {
        docker(['container', 'stop', resource.id]);
      }
    } else if (stage === 'remove') {
      for (const kind of ['container', 'volume', 'network']) {
        for (const resource of state.resources.filter((item) => item.kind === kind)) {
          docker([kind, 'rm', kind === 'volume' ? resource.name : resource.id]);
        }
      }
    }
    state.resources = stage === 'remove' ? [] : inspect();
    if (!['stop', 'remove'].includes(stage)) {
      verifyStageResources(stage, state.resources, manifest.names);
    } else if (
      stage === 'stop' &&
      state.resources.some((item) => item.kind === 'container' && item.running)
    ) {
      throw new Error('An inventoried container is still running; removal is not permitted.');
    }
    state.stage = stage === 'stop' ? 'stopped' : stage === 'remove' ? 'removed' : stage;
    state.failed = false;
    save();
    return {
      stage: state.stage,
      source: manifest.source,
      inventory: approval,
      migrationHistory: state.historyHash ?? null,
      resources: state.resources,
    };
  } catch (error) {
    // Keep the failure terminal. Cleanup may inventory only exact named/labeled resources.
    state.failed = true;
    save();
    throw error;
  } finally {
    fs.closeSync(lockFd);
    fs.unlinkSync(lock);
  }
}
