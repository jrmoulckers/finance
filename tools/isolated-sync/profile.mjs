// Source-only profile builder. Usage: imported by tools/isolated-sync.mjs.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import path from 'node:path';

export const LABEL = 'finance.isolated-sync.inventory';
export const PORTS = [4193, ...Array.from({ length: 11 }, (_, i) => 55430 + i)];
export const ADAPTER = 'services/api/supabase/local-only/isolated-signup-adapter.sql';
export const MIGRATIONS = 'services/api/supabase/migrations/';
export const FUNCTIONS = 'services/api/supabase/functions/';

/** Hash source bytes without recording their contents. */
export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** Only explicitly named, disposable projects can enter the profile. */
export function projectNames(project) {
  if (!/^finance-sync-proof-[a-z0-9][a-z0-9-]{0,24}$/.test(project)) {
    throw new Error(
      'Project must be finance-sync-proof- followed by 1-25 lowercase letters/digits/hyphens.',
    );
  }
  return {
    project,
    apiProject: `${project}-api`,
    syncProject: `${project}-ps`,
    backend: `${project}-backend`,
    syncNetwork: `${project}-ps-private`,
    database: `${project}-postgres`,
    mongoVolume: `${project}-mongo`,
    containers: Object.fromEntries(
      [
        'db',
        'auth-migrate',
        'auth',
        'rest',
        'edge',
        'gateway',
        'mongo',
        'mongo-init',
        'powersync',
      ].map((name) => [name, `${project}-${name}`]),
    ),
  };
}

/** Reject omitted/extra/duplicate migrations, including future unreviewed additions. */
export function migrationInventory(files, adapter) {
  const migrations = files
    .filter((name) => new RegExp(`^${MIGRATIONS}[0-9]{14}_[^/]+\\.sql$`).test(name))
    .sort();
  const versions = migrations.map((name) => path.posix.basename(name).slice(0, 14));
  const array = adapter.match(/expected_versions text\[\] := ARRAY\[([\s\S]*?)\];/);
  const expected = [...(array?.[1] ?? '').matchAll(/'([0-9]{14})'/g)].map((m) => m[1]);
  if (
    versions.length !== 59 ||
    expected.length !== 59 ||
    new Set(versions).size !== 59 ||
    JSON.stringify(versions) !== JSON.stringify(expected)
  ) {
    throw new Error(
      'Exact reviewed 59-version migration/adapter inventory mismatch; review required.',
    );
  }
  return { migrations, versions };
}

/** Secrets are supplied only during an explicitly approved human runtime stage. */
export function validateCredentials(input) {
  const keys = ['databasePassword', 'jwtSecret', 'anonKey', 'serviceRoleKey'];
  if (
    !input ||
    JSON.stringify(Object.keys(input).sort()) !== JSON.stringify([...keys].sort()) ||
    keys.some((key) => typeof input[key] !== 'string' || /[\r\n\0]/.test(input[key]))
  ) {
    throw new Error('Private credentials must contain exactly the four documented string fields.');
  }
  if (!/^[A-Za-z0-9_-]{24,128}$/.test(input.databasePassword) || input.jwtSecret.length < 32) {
    throw new Error(
      'Private database password must be 24-128 URL-safe characters; JWT secret needs at least 32 characters.',
    );
  }
  for (const [field, role] of [
    ['anonKey', 'anon'],
    ['serviceRoleKey', 'service_role'],
  ]) {
    const parts = input[field].split('.');
    try {
      if (parts.length !== 3) throw new Error();
      const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
      const actual = Buffer.from(parts[2], 'base64url');
      const expected = createHmac('sha256', input.jwtSecret)
        .update(`${parts[0]}.${parts[1]}`)
        .digest();
      if (
        header.alg !== 'HS256' ||
        claims.role !== role ||
        !Number.isFinite(claims.exp) ||
        claims.exp <= Date.now() / 1000 + 3600 ||
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      ) {
        throw new Error();
      }
    } catch {
      throw new Error(
        `Private ${field} must be a valid unexpired HS256 key for its documented role.`,
      );
    }
  }
  return input;
}

/** Render deterministic definitions; no ambient environment or secret is consumed. */
export function definitions(names, pins) {
  for (const image of Object.values(pins.images)) {
    if (!/^[a-z0-9./-]+:[a-zA-Z0-9._-]+@sha256:[a-f0-9]{64}$/.test(image)) {
      throw new Error('Every service image must have a reviewed immutable digest.');
    }
  }
  const label = { [LABEL]: '${ISOLATED_INVENTORY:?human approval required}' };
  const service = (name, image, extra) => ({
    image: pins.images[image],
    container_name: names.containers[name],
    restart: 'no',
    logging: { driver: 'none' },
    labels: label,
    networks: ['backend'],
    ...extra,
  });
  const authEnv = {
    API_EXTERNAL_URL: 'http://127.0.0.1:55431',
    GOTRUE_API_HOST: '0.0.0.0',
    GOTRUE_API_PORT: '9999',
    GOTRUE_SITE_URL: 'http://localhost:4193',
    GOTRUE_URI_ALLOW_LIST: 'http://localhost:4193/**',
    GOTRUE_DB_DRIVER: 'postgres',
    GOTRUE_DB_DATABASE_URL: '${ISOLATED_AUTH_DB_URI:?private runtime input required}',
    GOTRUE_JWT_SECRET: '${ISOLATED_JWT_SECRET:?private runtime input required}',
    GOTRUE_JWT_EXP: '3600',
    GOTRUE_JWT_ADMIN_ROLES: 'service_role',
    GOTRUE_JWT_AUD: 'authenticated',
    GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated',
    GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true',
    GOTRUE_MAILER_AUTOCONFIRM: 'true',
    GOTRUE_DISABLE_SIGNUP: 'false',
    GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED: 'false',
    GOTRUE_LOG_LEVEL: 'error',
  };
  const api = {
    name: names.apiProject,
    services: {
      db: service('db', 'db', {
        environment: {
          POSTGRES_PASSWORD: '${ISOLATED_DB_PASSWORD:?private runtime input required}',
          POSTGRES_USER: 'supabase_admin',
          POSTGRES_DB: 'postgres',
          JWT_SECRET: '${ISOLATED_JWT_SECRET:?private runtime input required}',
          JWT_EXP: '3600',
        },
        command: [
          'postgres',
          '-D',
          '/etc/postgresql',
          '-c',
          'wal_level=logical',
          '-c',
          'max_replication_slots=10',
          '-c',
          'max_wal_senders=10',
          '-c',
          'cron.launch_active_jobs=off',
          '-c',
          'log_statement=none',
          '-c',
          'log_min_error_statement=panic',
          '-c',
          'log_min_messages=panic',
        ],
        ports: ['127.0.0.1:55432:5432'],
        volumes: [
          'database:/var/lib/postgresql/data',
          './roles.sql:/docker-entrypoint-initdb.d/init-scripts/99-isolated-roles.sql:ro',
        ],
        healthcheck: {
          test: ['CMD', 'pg_isready', '-U', 'postgres', '-d', 'postgres'],
          interval: '2s',
          timeout: '5s',
          retries: 60,
        },
      }),
      'auth-migrate': service('auth-migrate', 'auth', {
        entrypoint: ['gotrue'],
        command: ['migrate'],
        environment: authEnv,
      }),
      auth: service('auth', 'auth', {
        entrypoint: ['gotrue'],
        command: [],
        environment: authEnv,
      }),
      rest: service('rest', 'rest', {
        environment: {
          PGRST_DB_URI: '${ISOLATED_REST_DB_URI:?private runtime input required}',
          PGRST_DB_SCHEMAS: 'public',
          PGRST_DB_ANON_ROLE: 'anon',
          PGRST_JWT_SECRET: '${ISOLATED_JWT_SECRET:?private runtime input required}',
          PGRST_DB_MAX_ROWS: '1000',
        },
      }),
      edge: service('edge', 'edge', {
        command: ['start', '--main-service', '/home/deno/functions/main'],
        environment: {
          SUPABASE_URL: 'http://gateway:8000',
          SUPABASE_ANON_KEY: '${ISOLATED_ANON_KEY:?private runtime input required}',
          SUPABASE_SERVICE_ROLE_KEY: '${ISOLATED_SERVICE_ROLE_KEY:?private runtime input required}',
          ALLOWED_ORIGINS: 'http://localhost:4193',
        },
        volumes: ['./supabase/functions:/home/deno/functions:ro'],
      }),
      gateway: service('gateway', 'gateway', {
        ports: ['127.0.0.1:55431:8000'],
        volumes: ['./gateway.conf:/etc/nginx/nginx.conf:ro'],
        healthcheck: {
          test: ['CMD-SHELL', 'wget -q -O /dev/null http://127.0.0.1:8000/auth/v1/health'],
          interval: '2s',
          timeout: '5s',
          retries: 60,
        },
      }),
    },
    networks: { backend: { external: true, name: names.backend } },
    volumes: { database: { external: true, name: names.database } },
  };
  const sync = {
    name: names.syncProject,
    services: {
      mongo: service('mongo', 'mongo', {
        networks: ['private'],
        command: ['mongod', '--replSet', 'rs0', '--bind_ip_all', '--quiet'],
        volumes: ['mongo:/data/db'],
        tmpfs: ['/data/configdb'],
        healthcheck: {
          test: ['CMD', 'mongosh', '--quiet', '--eval', 'db.adminCommand({ping:1})'],
          interval: '2s',
          timeout: '5s',
          retries: 60,
        },
      }),
      'mongo-init': service('mongo-init', 'mongo', {
        networks: ['private'],
        tmpfs: ['/data/db', '/data/configdb'],
        entrypoint: ['bash', '-ec'],
        command: [
          `mongosh --host mongo:27017 --quiet --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"mongo:27017"}]});'
for attempt in {1..60}; do
  if mongosh --host mongo:27017 --quiet --eval 'quit(db.hello().isWritablePrimary ? 0 : 1)'; then exit 0; fi
  sleep 1
done
exit 1`,
        ],
      }),
      powersync: service('powersync', 'powersync', {
        networks: ['private', 'backend'],
        command: ['start', '-r', 'unified'],
        environment: {
          POWERSYNC_CONFIG_PATH: '/config/powersync.yaml',
          PS_PG_URI: '${ISOLATED_REPLICATION_DB_URI:?private runtime input required}',
          PS_MONGO_URI: 'mongodb://mongo:27017/powersync?replicaSet=rs0',
          PS_JWT_SECRET: '${ISOLATED_JWT_SECRET:?private runtime input required}',
          PS_PORT: '8080',
        },
        ports: ['127.0.0.1:55440:8080'],
        healthcheck: {
          test: [
            'CMD',
            'node',
            '-e',
            "fetch('http://127.0.0.1:8080/probes/readiness').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
          ],
          interval: '2s',
          timeout: '5s',
          retries: 60,
        },
        volumes: [
          './powersync.yaml:/config/powersync.yaml:ro',
          './sync-rules.yaml:/config/sync-config.yaml:ro',
        ],
      }),
    },
    networks: {
      backend: { external: true, name: names.backend },
      private: { external: true, name: names.syncNetwork },
    },
    volumes: { mongo: { external: true, name: names.mongoVolume } },
  };
  return { api, sync };
}

export const gateway = `events {}
http {
  access_log off;
  error_log /dev/null emerg;
  server {
    listen 8000;
    add_header Access-Control-Allow-Origin "http://localhost:4193" always;
    add_header Access-Control-Allow-Headers "authorization,apikey,content-type,x-client-info,prefer" always;
    add_header Access-Control-Allow-Methods "GET,POST,PATCH,PUT,DELETE,OPTIONS" always;
    if ($request_method = OPTIONS) { return 204; }
    location /auth/v1/ { proxy_pass http://auth:9999/; }
    location /rest/v1/ { proxy_pass http://rest:3000/; }
    location ~ ^/functions/v1/(auth-login|auth-signup|auth-refresh|auth-logout)$ {
      proxy_set_header X-Forwarded-Proto http;
      proxy_pass http://edge:9000;
    }
    location / { return 404; }
  }
}
`;

export const roles = `\\set ON_ERROR_STOP on
\\getenv private_password POSTGRES_PASSWORD
ALTER ROLE postgres PASSWORD :'private_password';
ALTER ROLE authenticator PASSWORD :'private_password';
ALTER ROLE supabase_auth_admin PASSWORD :'private_password';
ALTER ROLE supabase_storage_admin PASSWORD :'private_password';
`;
