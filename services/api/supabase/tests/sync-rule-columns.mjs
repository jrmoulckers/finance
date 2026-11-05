// Disposable PostgreSQL only. Usage: npm run test:sync-schema from services/api.
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { execute } from '../../../../tools/isolated-sync/files.mjs';

const rules = yaml.load(
  readFileSync(new URL('../../powersync/sync-rules.yaml', import.meta.url), 'utf8'),
);
const statements = [];
for (const bucket of Object.values(rules.bucket_definitions)) {
  for (const query of [...(bucket.parameters ?? []), ...(bucket.data ?? [])]) {
    const match = query.match(/^\s*SELECT\s+([\s\S]+?)\s+FROM\s+([a-z_][a-z0-9_]*)\b/i);
    if (!match || !/^[a-z0-9_,\s]+$/i.test(match[1]))
      throw new Error('Review required for changed sync-rule column syntax.');
    statements.push(`SELECT ${match[1]} FROM public."${match[2]}" WHERE false;`);
  }
}
if (statements.length !== 39) throw new Error('Review required for changed sync-rule inventory.');
execute('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '-f', '-'], {
  input: `BEGIN READ ONLY;\n${statements.join('\n')}\nROLLBACK;\n`,
  sqlOperation: 'rule-columns',
});
process.stdout.write('All 39 sync-rule column queries passed against the migrated database.\n');
