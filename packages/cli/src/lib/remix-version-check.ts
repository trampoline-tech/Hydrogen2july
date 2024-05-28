import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {renderWarning} from '@shopify/cli-kit/node/ui';

export function getRequiredRemixVersion(
  require = createRequire(import.meta.url),
) {
  const hydrogenPkgJson = require(fileURLToPath(
    new URL('../../package.json', import.meta.url),
  ));

  return hydrogenPkgJson.peerDependencies['@remix-run/dev'] as string;
}

export function checkRemixVersions(projectPath: string) {
  const require = createRequire(import.meta.url);
  const requiredVersionInHydrogen = getRequiredRemixVersion(require);

  // Require this after requiring the hydrogen
  // package version to avoid breaking test mocks.
  const satisfiesSemver =
    require('semver/functions/satisfies.js') as typeof import('semver/functions/satisfies.js');

  const pkgs = [
    'dev',
    'react',
    'server-runtime',
    'css-bundle',
    'node',
    'express',
    'eslint-config',
  ].map((name) => getRemixPackageVersion(require, name, projectPath));

  const outOfSyncPkgs = pkgs.filter(
    (pkg) =>
      pkg.version && !satisfiesSemver(pkg.version, requiredVersionInHydrogen),
  );

  if (outOfSyncPkgs.length === 0) return;

  const items = outOfSyncPkgs.reduce((acc, item) => {
    if (item.version) {
      acc.push(`${item.name}@${item.version}`);
    }

    return acc;
  }, [] as string[]);

  renderWarning({
    headline: `The current version of Hydrogen requires Remix @${requiredVersionInHydrogen}. The following packages are out of sync:`,
    body: [
      {list: {items}},
      '\nPlease ensure your Remix packages have the same version and are in sync with Hydrogen.',
    ],
  });
}

// When using the global CLI, remix packages are loaded from the project root.
function getRemixPackageVersion(
  require: NodeRequire,
  name: string,
  root: string,
) {
  const pkgName = '@remix-run/' + name;
  const result = {name: pkgName, version: ''};

  try {
    const pkgJsonPath = require.resolve(`${pkgName}/package.json`, {
      paths: [root],
    });
    const pkgJson = require(pkgJsonPath);
    result.version = pkgJson.version as string;
  } catch {
    // Ignore errors
  }

  return result;
}
