// Synthetic in-workspace fixtures. Usage: imported by isolated-sync regression tests.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADAPTER, MIGRATIONS, projectNames } from './profile.mjs';
import { buildArtifacts } from './files.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
export const pins = JSON.parse(read('tools/isolated-sync/pins.json'));
export const source = 'a'.repeat(40);
export const project = 'finance-sync-proof-fixture';
export const names = projectNames(project);
export const migrationNames = fs
  .readdirSync(path.join(root, MIGRATIONS))
  .filter((name) => /^[0-9]{14}_[^/]+\.sql$/.test(name))
  .map((name) => `${MIGRATIONS}${name}`)
  .sort();
export const sources = {
  [ADAPTER]: read(ADAPTER),
  'services/api/supabase/tests/isolated-signup-adapter.test.sql':
    'BEGIN;\n\\ir ../local-only/isolated-signup-adapter.sql\nROLLBACK;\n',
  'services/api/supabase/tests/isolated-signup-contract.test.mjs': '// synthetic\n',
  'services/api/supabase/config.toml': 'project_id = "fixture"\n',
  'services/api/powersync/sync-rules.yaml':
    'bucket_definitions:\n  fixture:\n    parameters: [SELECT id FROM users]\n    data: [SELECT id FROM accounts]\n',
  'deploy/powersync.yaml': read('deploy/powersync.yaml'),
  'services/api/supabase/functions/main/index.ts': '// synthetic function\n',
  'services/api/supabase/functions/deno.lock': read('services/api/supabase/functions/deno.lock'),
  'tools/isolated-sync.mjs': '// synthetic tool\n',
  'tools/isolated-sync/pins.json': read('tools/isolated-sync/pins.json'),
  ...Object.fromEntries(
    migrationNames.map((name) => [name, '-- exact synthetic bytes\nSELECT 1;\n\n']),
  ),
};

/** Return deterministic Git objects without accessing another checkout. */
export function git(args) {
  if (args[0] === 'rev-parse') return source;
  if (args[0] === 'ls-tree')
    return Object.keys(sources)
      .sort()
      .map((name) => `100644 blob ${source}\t${name}`)
      .join('\0');
  if (args[0] === 'show') return sources[args[1].slice(41)];
  throw new Error('Unexpected synthetic git command.');
}

/** Create source-only artifacts; remove only known individual fixture files/empty directories. */
export function fixture() {
  const directory = fs.mkdtempSync(path.join(root, 'tools', 'isolated-sync', '.fixture-'));
  const options = { root, directory, source, project, git };
  const artifacts = buildArtifacts(options);
  return {
    directory,
    options,
    ...artifacts,
    cleanup() {
      const directories = new Set([directory]);
      for (const relative of [...Object.keys(artifacts.files), 'inventory.json', 'state.json']) {
        const target = path.join(directory, relative);
        if (fs.existsSync(target)) fs.unlinkSync(target);
        for (let cursor = path.dirname(target); cursor !== directory; cursor = path.dirname(cursor))
          directories.add(cursor);
      }
      for (const name of ['.home', '.tmp', '.home/AppData', '.home/AppData/Roaming']) {
        const target = path.join(directory, name);
        if (fs.existsSync(target)) directories.add(target);
      }
      for (const target of [...directories].sort((a, b) => b.length - a.length)) {
        if (fs.existsSync(target)) fs.rmdirSync(target);
      }
    },
  };
}
