import {fileURLToPath} from 'node:url';
import {findPathUp} from '@shopify/cli-kit/node/fs';
import {AbortError} from '@shopify/cli-kit/node/error';
import {joinPath} from '@shopify/cli-kit/node/path';
import {execAsync} from './process.js';

const monorepoPackagesPath = new URL('../../..', import.meta.url).pathname;
export const isHydrogenMonorepo = monorepoPackagesPath.endsWith(
  '/hydrogen/packages/',
);
export const hydrogenPackagesPath = isHydrogenMonorepo
  ? monorepoPackagesPath
  : undefined;

export const ASSETS_DIR_PREFIX = 'assets/hydrogen';
export const ASSETS_STARTER_DIR = 'starter';
export const GENERATOR_APP_DIR = 'app';
export const GENERATOR_ROUTE_DIR = 'routes';
export const GENERATOR_SETUP_ASSETS_SUB_DIRS = [
  'tailwind',
  'css-modules',
  'vanilla-extract',
  'postcss',
  'vite',
] as const;

export type AssetDir = (typeof GENERATOR_SETUP_ASSETS_SUB_DIRS)[number];

let pkgJsonPath: string | undefined;
export async function getAssetsDir(...subpaths: string[]) {
  pkgJsonPath ??= await findPathUp('package.json', {
    cwd: fileURLToPath(import.meta.url),
    type: 'file',
  });

  if (!pkgJsonPath) {
    throw new AbortError(
      'Could not find assets directory',
      'Please report this error.',
    );
  }

  return joinPath(
    pkgJsonPath.replace(/\/package\.json$/, ''),
    process.env.SHOPIFY_UNIT_TEST
      ? `assets` // Use source for unit tests
      : `dist/${ASSETS_DIR_PREFIX}`,
    ...subpaths,
  );
}

export function getSetupAssetDir(feature: AssetDir) {
  return getAssetsDir('setup', feature);
}

export async function getTemplateAppFile(filepath: string, root?: string) {
  root ??= await getStarterDir();

  const url = new URL(
    `${root}/${GENERATOR_APP_DIR}${filepath ? `/${filepath}` : ''}`,
    import.meta.url,
  );
  return url.protocol === 'file:' ? fileURLToPath(url) : url.toString();
}

export function getStarterDir(useSource = !!process.env.SHOPIFY_UNIT_TEST) {
  if (useSource) return getSkeletonSourceDir();

  return getAssetsDir(ASSETS_STARTER_DIR);
}

export function getSkeletonSourceDir() {
  if (!isHydrogenMonorepo) {
    throw new AbortError(
      'Trying to use skeleton source dir outside of Hydrogen monorepo.',
      'Please report this error.',
    );
  }

  return monorepoPackagesPath.replace(/\/packages\/$/, '/templates/skeleton/');
}

export async function getRepoNodeModules() {
  const {stdout} = await execAsync('npm root');
  let nodeModulesPath = stdout.trim();

  if (!nodeModulesPath && isHydrogenMonorepo) {
    nodeModulesPath = monorepoPackagesPath.replace(
      /\/packages\/$/,
      '/node_modules/',
    );
  }

  return nodeModulesPath;
}
