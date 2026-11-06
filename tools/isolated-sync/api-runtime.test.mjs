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
  'pinned Edge boots the complete functions tree and nginx routes only approved workers',
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
      write('gateway.conf', gateway);
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
