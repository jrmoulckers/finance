import { config } from './index.js';

/**
 * Svelte variant. Adds the Svelte plugin and routes `.svelte` files to its
 * parser. Requires `prettier-plugin-svelte` in the consumer.
 *
 * @type {import('prettier').Config}
 */
export const svelteConfig = {
  ...config,
  plugins: ['prettier-plugin-svelte'],
  overrides: [{ files: '*.svelte', options: { parser: 'svelte' } }, ...(config.overrides ?? [])],
};

export default svelteConfig;
