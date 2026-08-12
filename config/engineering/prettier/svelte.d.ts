import type { Config } from 'prettier';

/**
 * Svelte variant. Adds `prettier-plugin-svelte` and routes `.svelte` files to
 * its parser. Requires `prettier-plugin-svelte` in the consumer.
 */
export declare const svelteConfig: Config;

export default svelteConfig;
