// Ownership and exposure checks. Usage: imported by runtime.mjs; no Docker calls on import.
import net from 'node:net';
import path from 'node:path';
import { LABEL } from './profile.mjs';
import { execute, privateEnvironment } from './files.mjs';

/** Reserve both address families while checking every proposed host port. */
export async function assertFreePorts(ports, directory) {
  if (ports.some((port) => !Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new Error('Invalid reserved port inventory.');
  }
  if (process.platform === 'win32') {
    if (!directory) throw new Error('Windows port inspection requires the private run directory.');
    const script = `$ErrorActionPreference='Stop'
$ports=@(${ports.join(',')})
$occupied=@(Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in $ports } |
  Select-Object -ExpandProperty LocalPort -Unique)
ConvertTo-Json -InputObject $occupied -Compress`;
    const occupied = JSON.parse(
      execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        cwd: directory,
        env: privateEnvironment(directory),
      }),
    );
    if (occupied.length !== 0) throw new Error('A reserved IPv4/IPv6 port is unavailable.');
  }
  const servers = [];
  try {
    for (const port of ports) {
      for (const host of ['0.0.0.0', '::']) {
        const server = net.createServer();
        await new Promise((resolve, reject) => {
          server.once('error', () =>
            reject(new Error(`Reserved port ${port} is unavailable on ${host}.`)),
          );
          server.listen({ port, host, exclusive: true, ipv6Only: true }, resolve);
        });
        servers.push(server);
      }
    }
  } finally {
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  }
}

/** Normalize only Docker Desktop's documented host-path representations. */
export function hostPath(value) {
  let normalized = value.replaceAll('\\', '/');
  normalized = normalized.replace(/^\/(?:run\/desktop\/mnt\/host|host_mnt)\/([a-z])\//i, '$1:/');
  return /^[a-z]:/i.test(normalized) ? normalized.toLowerCase() : normalized;
}

/** Fail before use if any container has foreign ownership, exposure, mounts or networks. */
export function validateContainer(record, manifest, directory, approval) {
  const { names, pins } = manifest;
  const name = record.name.replace(/^\//, '');
  const service = Object.keys(names.containers).find((key) => names.containers[key] === name);
  if (!service || record.labels?.[LABEL] !== approval)
    throw new Error('Foreign container ownership refused.');
  const image = service.startsWith('auth') ? 'auth' : service === 'mongo-init' ? 'mongo' : service;
  if (record.image !== pins.images[image])
    throw new Error('Container image differs from immutable inventory.');
  const networks = service.startsWith('mongo')
    ? [names.syncNetwork]
    : service === 'powersync'
      ? [names.backend, names.syncNetwork]
      : [names.backend];
  if (
    JSON.stringify(Object.keys(record.networks ?? {}).sort()) !== JSON.stringify(networks.sort())
  ) {
    throw new Error('Foreign container network attachment refused.');
  }
  const expectedPorts =
    {
      db: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55432' }] },
      gateway: { '8000/tcp': [{ HostIp: '127.0.0.1', HostPort: '55431' }] },
      powersync: { '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: '55440' }] },
    }[service] ?? {};
  if (JSON.stringify(record.ports ?? {}) !== JSON.stringify(expectedPorts)) {
    throw new Error('Unexpected/nonloopback host publication refused.');
  }
  const bindings =
    {
      db: {
        '/docker-entrypoint-initdb.d/init-scripts/99-isolated-roles.sql': 'roles.sql',
      },
      edge: { '/home/deno/functions': path.join('supabase', 'functions') },
      gateway: { '/etc/nginx/nginx.conf': 'gateway.conf' },
      powersync: {
        '/config/powersync.yaml': 'powersync.yaml',
        '/config/sync-config.yaml': 'sync-rules.yaml',
      },
    }[service] ?? {};
  const volumes =
    service === 'db'
      ? { '/var/lib/postgresql/data': names.database }
      : service === 'mongo'
        ? { '/data/db': names.mongoVolume }
        : {};
  const expected = new Set([...Object.keys(bindings), ...Object.keys(volumes)]);
  for (const mount of record.mounts ?? []) {
    if (
      mount.Type === 'tmpfs' &&
      ((service === 'mongo' && mount.Destination === '/data/configdb') ||
        (service === 'mongo-init' && ['/data/db', '/data/configdb'].includes(mount.Destination)))
    )
      continue;
    if (!expected.delete(mount.Destination)) throw new Error('Unexpected container mount refused.');
    if (mount.Type === 'bind') {
      const relative = bindings[mount.Destination];
      if (
        !relative ||
        mount.RW ||
        hostPath(mount.Source) !== hostPath(path.join(directory, relative))
      ) {
        throw new Error('Foreign/writable bind mount refused.');
      }
    } else if (mount.Type !== 'volume' || volumes[mount.Destination] !== mount.Name) {
      throw new Error('Foreign volume mount refused.');
    }
  }
  if (expected.size !== 0) throw new Error('Required mount is missing.');
}

/** Inspect selected metadata only: never request Config.Env, status keys or raw logs. */
export const CONTAINER_FORMAT = JSON.stringify({
  id: '__ID__',
  name: '__NAME__',
  labels: '__LABELS__',
  image: '__IMAGE__',
  networks: '__NETWORKS__',
  ports: '__PORTS__',
  mounts: '__MOUNTS__',
  running: '__RUNNING__',
})
  .replaceAll('"__ID__"', '{{json .Id}}')
  .replaceAll('"__NAME__"', '{{json .Name}}')
  .replaceAll('"__LABELS__"', '{{json .Config.Labels}}')
  .replaceAll('"__IMAGE__"', '{{json .Config.Image}}')
  .replaceAll('"__NETWORKS__"', '{{json .NetworkSettings.Networks}}')
  .replaceAll('"__PORTS__"', '{{json .HostConfig.PortBindings}}')
  .replaceAll('"__MOUNTS__"', '{{json .Mounts}}')
  .replaceAll('"__RUNNING__"', '{{json .State.Running}}');

/** Enumerate names, including stopped containers, without accessing configuration. */
export function resourceNames(docker) {
  const list = (args) => docker(args).split(/\r?\n/).filter(Boolean);
  return {
    container: list(['container', 'ls', '-a', '--format', '{{.Names}}']),
    network: list(['network', 'ls', '--format', '{{.Name}}']),
    volume: list(['volume', 'ls', '--format', '{{.Name}}']),
  };
}

/** First startup must not adopt any existing project-prefixed resource. */
export function assertFresh(names, existing) {
  for (const values of Object.values(existing)) {
    if (values.some((name) => name.startsWith(names.project))) {
      throw new Error(
        'Preexisting isolated-project resource refused; choose a fresh reviewed run.',
      );
    }
  }
}

/** Record and later require stable IDs/creation times, labels and network definitions. */
export function inspectResources(docker, manifest, directory, approval, previous = []) {
  const { names } = manifest;
  const existing = resourceNames(docker);
  const allowed = {
    container: Object.values(names.containers),
    network: [names.backend, names.syncNetwork],
    volume: [names.database, names.mongoVolume],
  };
  const records = [];
  for (const kind of Object.keys(allowed)) {
    for (const name of existing[kind].filter((value) => value.startsWith(names.project))) {
      if (!allowed[kind].includes(name)) throw new Error('Unlisted project resource refused.');
      let data;
      if (kind === 'container') {
        data = JSON.parse(docker(['container', 'inspect', '--format', CONTAINER_FORMAT, name]));
        validateContainer(data, manifest, directory, approval);
      } else {
        const format =
          kind === 'network'
            ? '{"id":{{json .Id}},"labels":{{json .Labels}},"driver":{{json .Driver}},"internal":{{json .Internal}},"ipv6":{{json .EnableIPv6}},"options":{{json .Options}},"containers":{{json .Containers}}}'
            : '{"id":{{json .CreatedAt}},"labels":{{json .Labels}},"driver":{{json .Driver}},"options":{{json .Options}}}';
        data = JSON.parse(docker([kind, 'inspect', '--format', format, name]));
        if (data.labels?.[LABEL] !== approval)
          throw new Error('Foreign resource ownership refused.');
        if (kind === 'network') {
          if (
            data.driver !== 'bridge' ||
            data.ipv6 ||
            data.internal !== (name === names.syncNetwork)
          ) {
            throw new Error('Unexpected network definition refused.');
          }
          if (data.options?.['com.docker.network.bridge.host_binding_ipv4'] !== '127.0.0.1') {
            throw new Error('Network default publication is not loopback-only.');
          }
          const known = new Set(Object.values(names.containers));
          if (
            Object.values(data.containers ?? {}).some((container) => !known.has(container.Name))
          ) {
            throw new Error('Foreign container attached to isolated network.');
          }
        } else if (data.driver !== 'local' || Object.keys(data.options ?? {}).length !== 0) {
          throw new Error('Foreign volume driver/mount options refused.');
        }
      }
      records.push({
        kind,
        name,
        id: data.id,
        ...(kind === 'container' ? { running: data.running } : {}),
      });
    }
  }
  for (const prior of previous) {
    if (
      !records.some(
        (record) =>
          record.kind === prior.kind && record.name === prior.name && record.id === prior.id,
      )
    ) {
      throw new Error('Owned resource disappeared or was replaced; refuse continuation.');
    }
  }
  return records;
}

/** Successful stages require the whole expected resource population, not just healthy endpoints. */
export function verifyStageResources(stage, records, names) {
  const database = ['db', 'auth-migrate'];
  const api = [...database, 'auth', 'rest', 'edge', 'gateway'];
  const services =
    stage === 'database'
      ? ['db']
      : ['migrate', 'adapter'].includes(stage)
        ? database
        : stage === 'api'
          ? api
          : Object.keys(names.containers);
  const containers = records.filter((record) => record.kind === 'container');
  if (records.length !== services.length + 4 || containers.length !== services.length) {
    throw new Error('Expected resource population is incomplete.');
  }
  for (const service of services) {
    const record = containers.find((item) => item.name === names.containers[service]);
    const running = !['auth-migrate', 'mongo-init'].includes(service);
    if (!record || record.running !== running)
      throw new Error('Expected service running/one-shot state mismatch.');
  }
}
