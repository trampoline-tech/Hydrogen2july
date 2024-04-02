import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {readdir} from 'node:fs/promises';
import type {RemixConfig} from '@remix-run/dev/dist/config.js';

export const VIRTUAL_ROUTES_DIR = 'virtual-routes/routes';
export const VIRTUAL_ROOT = 'virtual-routes/virtual-root';

type MinimalRemixConfig = {
  appDirectory: string;
  routes: RemixConfig['routes'];
};

export async function addVirtualRoutes<T extends MinimalRemixConfig>(
  config: T,
): Promise<T> {
  const userRouteList = Object.values(config.routes);
  const distPath = path.dirname(fileURLToPath(import.meta.url));
  const virtualRoutesPath = path.join(distPath, VIRTUAL_ROUTES_DIR);

  for (const relativeFilePath of await readdir(virtualRoutesPath, {
    recursive: true,
  })) {
    const absoluteFilePath = path.join(virtualRoutesPath, relativeFilePath);
    const routePath = relativeFilePath
      .replace(/\.[jt]sx?$/, '')
      .replaceAll('\\', '/');

    // Note: index routes has path `undefined`,
    // while frame routes such as `root.jsx` have path `''`.
    const isIndex = /(^|\/)index$/.test(routePath);
    const normalizedVirtualRoutePath = isIndex
      ? routePath.slice(0, -'index'.length).replace(/\/$/, '') || undefined
      : // TODO: support v2 flat routes?
        routePath.replace(/\$/g, ':').replace(/[\[\]]/g, '');

    const hasUserRoute = userRouteList.some(
      (r) => r.parentId === 'root' && r.path === normalizedVirtualRoutePath,
    );

    if (!hasUserRoute) {
      const id = VIRTUAL_ROUTES_DIR + '/' + routePath;

      config.routes[id] = {
        id,
        parentId: VIRTUAL_ROOT,
        path: normalizedVirtualRoutePath,
        index: isIndex || undefined,
        caseSensitive: undefined,
        file: path.relative(config.appDirectory, absoluteFilePath),
      };

      if (!config.routes[VIRTUAL_ROOT]) {
        config.routes[VIRTUAL_ROOT] = {
          id: VIRTUAL_ROOT,
          path: '',
          file: path.relative(
            config.appDirectory,
            path.join(distPath, VIRTUAL_ROOT + '.jsx'),
          ),
        };
      }
    }
  }

  return config;
}
