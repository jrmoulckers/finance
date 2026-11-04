// SPDX-License-Identifier: BUSL-1.1

import { mergeConfig } from 'vite';
import config from './vite.config';

/** Isolated production bundle for synthetic local-only acceptance tests. */
export default mergeConfig(config, {
  envDir: false,
  build: { outDir: 'dist/local' },
});
