// Opt-in pinned-image smoke: FINANCE_ISOLATED_API_SMOKE=1 node --test tools/isolated-sync/api-runtime.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { execute, privateEnvironment, writeNew } from './files.mjs';
import { gateway } from './profile.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test(
  'pinned Edge boots real workers and nginx preserves routing and single-origin CORS',
  { skip: process.env.FINANCE_ISOLATED_API_SMOKE !== '1', timeout: 90000 },
  async () => {
    const directory = fs.mkdtempSync(path.join(root, 'tools', 'isolated-sync', '.api-smoke-'));
    const files = [];
    const containers = [];
    const directories = new Set([directory]);
    const env = privateEnvironment(directory);
    const pins = JSON.parse(
      fs.readFileSync(path.join(root, 'tools', 'isolated-sync', 'pins.json')),
    );
    const docker = (args) => execute('docker', args, { env, cwd: directory, timeout: 30000 });
    const write = (relative, bytes) => {
      writeNew(directory, relative, bytes);
      const target = path.join(directory, relative);
      files.push(target);
      for (let cursor = path.dirname(target); cursor !== directory; cursor = path.dirname(cursor)) {
        directories.add(cursor);
      }
    };
    const create = (role, args) => {
      const name = `finance-sync-proof-api-check-${role}-${process.pid}`;
      assert.equal(
        docker(['container', 'ls', '-a', '--filter', `name=^/${name}$`, '--format', '{{.ID}}']),
        '',
        'Diagnostic name collision',
      );
      const id = docker([
        'create',
        '--name',
        name,
        '--label',
        'finance.isolated-sync.diagnostic=4621',
        '--log-driver',
        'none',
        ...args,
      ]);
      assert.match(id, /^[a-f0-9]{64}$/);
      containers.push(id);
      docker(['start', id]);
      return id;
    };
    const running = (id) => {
      const state = JSON.parse(docker(['container', 'inspect', '--format', '{{json .State}}', id]));
      assert.equal(state.Running, true, `Diagnostic container exited with code ${state.ExitCode}`);
    };
    const request = (id, url) =>
      Number(
        docker([
          'exec',
          id,
          'sh',
          '-c',
          `wget -T 5 -S -O /dev/null '${url}' 2>&1 | awk '/^[[:space:]]*HTTP\\/[0-9.]+ [0-9]+/{code=$2} END {print code}'`,
        ]),
      );
    const corsResponse = (id, method) => {
      const command =
        method === 'OPTIONS'
          ? `printf '%s\\r\\n' 'OPTIONS /rest/v1/accounts HTTP/1.1' 'Host: localhost' 'Origin: http://localhost:4193' 'Connection: close' '' | nc -w 5 127.0.0.1 8000`
          : `wget -T 5 -S -O /dev/null --header='Origin: http://localhost:4193' 'http://127.0.0.1:8000/rest/v1/accounts' 2>&1`;
      const output = docker([
        'exec',
        id,
        'sh',
        '-c',
        `${command} | awk '/^[[:space:]]*HTTP\\// || tolower($0) ~ /^[[:space:]]*access-control-allow-origin:/'`,
      ]);
      const lines = output.split('\n').map((line) => line.trim());
      return {
        status: Number(lines[0]?.split(' ')[1]),
        origins: lines
          .filter((line) => /^access-control-allow-origin:/i.test(line))
          .map((line) => line.slice(line.indexOf(':') + 1).trim()),
      };
    };
    try {
      for (const relative of ['.home', '.tmp']) {
        fs.mkdirSync(path.join(directory, relative));
        directories.add(path.join(directory, relative));
      }
      const source = execute('git', ['rev-parse', 'HEAD'], { env, cwd: root });
      execute('git', ['diff', '--quiet', source, '--', 'services/api/supabase/functions'], {
        env,
        cwd: root,
      });
      const tracked = execute(
        'git',
        ['ls-tree', '-rz', source, '--', 'services/api/supabase/functions'],
        { env, cwd: root },
      )
        .split('\0')
        .filter(Boolean);
      assert.ok(tracked.some((record) => record.endsWith('/deno.lock')));
      for (const record of tracked) {
        const match = record.match(/^100(?:644|755) blob [a-f0-9]{40}\t(.+)$/);
        assert.ok(match, 'Only regular tracked functions source files are accepted');
        const name = match[1];
        assert.ok(!name.split('/').some((part) => part.startsWith('.env') || part === 'secrets'));
        write(
          name.slice('services/api/supabase/'.length),
          execute('git', ['show', `${source}:${name}`], { env, cwd: root, rawOutput: true }),
        );
      }
      assert.ok(gateway.endsWith('\n}\n'));
      // Reproduce PostgREST's wildcard header without credentials or another service.
      const upstream = `  server {
    listen 3000;
    add_header Access-Control-Allow-Origin "*" always;
    default_type application/json;
    return 200 '[]';
  }
`;
      write('gateway.conf', `${gateway.slice(0, -2)}${upstream}}\n`);
      const edge = create('edge', [
        '--network',
        'none',
        '--add-host',
        'auth:127.0.0.1',
        '--add-host',
        'rest:127.0.0.1',
        '--add-host',
        'edge:127.0.0.1',
        '--mount',
        `type=bind,source=${path.join(directory, 'functions')},target=/home/deno/functions,readonly`,
        pins.images.edge,
        'start',
        '--main-service',
        '/home/deno/functions/main',
      ]);
      const proxy = create('gateway', [
        '--network',
        `container:${edge}`,
        '--mount',
        `type=bind,source=${path.join(directory, 'gateway.conf')},target=/etc/nginx/nginx.conf,readonly`,
        pins.images.gateway,
      ]);
      let ready = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        running(edge);
        running(proxy);
        if (request(proxy, 'http://127.0.0.1:9000/_internal/health') === 200) {
          ready = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      assert.equal(ready, true, 'Pinned Edge did not become ready');
      docker(['exec', proxy, 'nginx', '-t']);
      assert.equal(request(proxy, 'http://127.0.0.1:3000/accounts'), 200);
      for (const [method, status] of [
        ['OPTIONS', 204],
        ['GET', 200],
      ]) {
        assert.deepEqual(corsResponse(proxy, method), {
          status,
          origins: ['http://localhost:4193'],
        });
      }
      for (const name of ['auth-login', 'auth-signup', 'auth-refresh', 'auth-logout']) {
        assert.equal(
          request(proxy, `http://127.0.0.1:8000/functions/v1/${name}`),
          503,
          `${name} must reach its real worker and fail closed without credentials`,
        );
      }
      for (const route of ['/functions/v1/data-export', '/_internal/health', '/unknown']) {
        assert.equal(request(proxy, `http://127.0.0.1:8000${route}`), 404);
      }
      running(edge);
      running(proxy);
    } finally {
      for (const id of containers.reverse()) {
        docker(['container', 'stop', id]);
        docker(['container', 'rm', id]);
      }
      for (const target of files) fs.unlinkSync(target);
      for (const target of [...directories].sort((a, b) => b.length - a.length)) {
        fs.rmdirSync(target);
      }
    }
  },
);
