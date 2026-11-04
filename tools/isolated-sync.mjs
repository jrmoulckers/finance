#!/usr/bin/env node
// Usage: node tools/isolated-sync.mjs --help. Preparation is source-only; lifecycle is human-gated.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadInventory, materialize, runDirectory } from './isolated-sync/files.mjs';
import { runStage } from './isolated-sync/runtime.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const help = `Finance isolated synthetic sync tooling (#4605)

Source-only (no Docker, services, secrets or migrations):
  node tools/isolated-sync.mjs prepare --directory .isolated-sync/RUN --project finance-sync-proof-NAME --source FULL_HEAD_SHA

Human-only, AFTER exact resource/location/command approval:
  node tools/isolated-sync.mjs STAGE --directory .isolated-sync/RUN --approve INVENTORY_SHA256 --cli ABSOLUTE_WORKSPACE_CLI_PATH

Ordered stages: database, migrate, adapter, api, sync, readiness
Separate cleanup: stop, then remove (permanently deletes only inventoried disposable volumes).
No retry, reset, repair, adoption, credential generation, status/key dumps or .env loading.
Create the empty private run directory first; see tools/isolated-sync/README.md.
Real signup, JWT isolation, web household adoption and replication acceptance are separate gates.
`;

async function main(args) {
  if (args.length === 0 || args.includes('--help')) {
    console.log(help);
    return;
  }
  const [stage, ...rest] = args;
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    if (
      !['--directory', '--project', '--source', '--approve', '--cli'].includes(key) ||
      !rest[i + 1] ||
      options[key]
    )
      throw new Error('Unknown, duplicate or incomplete option; use --help.');
    options[key] = rest[i + 1];
  }
  if (
    ![
      'prepare',
      'database',
      'migrate',
      'adapter',
      'api',
      'sync',
      'readiness',
      'stop',
      'remove',
    ].includes(stage)
  ) {
    throw new Error('Unknown stage; use --help.');
  }
  if (!options['--directory'])
    throw new Error('An explicit approved workspace-local directory is required.');
  const directory = runDirectory(root, options['--directory']);
  if (stage === 'prepare') {
    if (!options['--source'] || !options['--project'] || options['--approve'] || options['--cli']) {
      throw new Error('Preparation requires only --directory, --project and --source.');
    }
    const { manifest, approval } = materialize({
      root,
      directory,
      source: options['--source'],
      project: options['--project'],
    });
    console.log(
      JSON.stringify({
        source: manifest.source,
        approval,
        names: manifest.names,
        endpoints: manifest.endpoints,
      }),
    );
  } else {
    if (options['--source'] || options['--project'])
      throw new Error('Runtime consumes the existing exact inventory.');
    const { manifest, approval } = loadInventory(root, directory);
    const result = await runStage({
      directory,
      manifest,
      approval,
      supplied: options['--approve'],
      stage,
      cli: options['--cli'],
    });
    console.log(JSON.stringify(result));
  }
}

main(process.argv.slice(2)).catch((error) => {
  // Only deliberately classified errors are shareable; never print upstream output or input values.
  console.error(
    error?.constructor === Error && !('code' in error)
      ? error.message
      : 'Isolated stage failed; private review required.',
  );
  process.exitCode = 1;
});
