import Flags from '@oclif/core/lib/flags.js';
import {string as stringUtils} from '@shopify/cli-kit';

export const commonFlags = {
  path: Flags.string({
    description: 'the path to your hydrogen storefront',
    env: 'SHOPIFY_HYDROGEN_FLAG_PATH',
  }),
  port: Flags.integer({
    description: 'Port to run the preview server on',
    env: 'SHOPIFY_HYDROGEN_FLAG_PORT',
    default: 3000,
  }),
};

export function flagsToCamelObject(obj: Record<string, any>) {
  return Object.entries(obj).reduce((acc, [key, value]) => {
    acc[stringUtils.camelize(key)] = value;
    return acc;
  }, {} as any);
}
