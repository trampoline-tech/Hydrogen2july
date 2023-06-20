import * as path from 'path';
import * as fs from 'fs';
import type {Socket} from 'net';

import getPort from 'get-port';

import {MiniOxygen} from './mini-oxygen/core';
import type {MiniOxygenServerOptions} from './mini-oxygen/server';

class WorkerNotFoundError extends Error {
  name = 'WorkerNotFoundError';
  message =
    'A worker file is required for this command. Try building your project or check your mini-oxygen config file to ensure a workerFile is specified and the path is correct.';
}

export type MiniOxygenOptions = Partial<{
  log(message: string): unknown;
  workerFile: string;
  workDir: string;
  watch: boolean;
  modules: boolean;
  buildCommand: string;
  buildWatchPaths: string[];
  sourceMap: boolean;
  envPath: string;
  env: {[key: string]: unknown};
}>;

export type MiniOxygenCreateServerOptions = MiniOxygenServerOptions & {
  port?: number;
};

export type MiniOxygenPreviewOptions = MiniOxygenOptions &
  MiniOxygenCreateServerOptions;

export const configFileName = 'mini-oxygen.config.json';

interface MiniOxygenPublicInstance {
  init: () => Promise<void>;
  dispose: () => Promise<void>;
  reload: (
    options?: Partial<Pick<MiniOxygenPreviewOptions, 'env'>>,
  ) => Promise<void>;
  createServer: (opts: MiniOxygenCreateServerOptions) => Promise<{
    port: number;
    close: () => Promise<void>;
  }>;
}

export function createMiniOxygen(
  opts: MiniOxygenOptions,
): MiniOxygenPublicInstance {
  const {
    // eslint-disable-next-line no-console
    log = (message: string) => console.log(message),
    workerFile,
    workDir,
    watch = false,
    buildWatchPaths,
    buildCommand,
    modules = true,
    sourceMap = true,
    envPath,
    env = {},
  } = opts;

  const root = workDir ?? process.cwd();

  if (!workerFile || !fs.existsSync(workerFile)) {
    throw new WorkerNotFoundError();
  }

  const mf = new MiniOxygen(
    {
      buildCommand,
      envPath,
      scriptPath: path.resolve(root, workerFile),
      watch,
      modules,
      sourceMap,
      buildWatchPaths,
      // this should stay in sync with oxygen-dms
      compatibilityFlags: ['streams_enable_constructors'],
      compatibilityDate: '2022-10-31',
    },
    env,
  );

  return {
    async init() {
      // Miniflare awaits internally for the #init promise to resolve,
      // which means that it has loaded the initial worker code.
      await mf.getPlugins();
    },
    async reload(options: any) {
      await mf.setOptions({bindings: options?.env});
    },
    async dispose() {
      await mf.dispose();
    },
    async createServer(serverOptions) {
      const {
        assetsDir,
        publicPath,
        port = 3000,
        autoReload = false,
        proxyServer,
        oxygenHeaders,
        onRequest,
        onResponseError,
        onResponse = (req, res) => {
          log(
            `${req.method}  ${res.status}  ${req.url.replace(
              new URL(req.url).origin,
              '',
            )}`,
          );
        },
      } = serverOptions;

      if (
        publicPath !== undefined &&
        publicPath.length > 0 &&
        !publicPath.endsWith('/')
      ) {
        log(`\nWARNING: publicPath must end with a trailing slash`);
      }

      const app = mf.createServer({
        assetsDir: assetsDir ? path.resolve(root, assetsDir) : undefined,
        publicPath,
        autoReload,
        proxyServer,
        oxygenHeaders,
        onRequest,
        onResponse,
        onResponseError,
      });

      const actualPort = await getPort({port});
      if (actualPort !== port) {
        log(
          `\nWARNING: Port ${port} is not available. Using ${actualPort} instead.`,
        );
      }

      const sockets = new Set<Socket>();
      app.on('connection', (socket) => {
        sockets.add(socket);
        socket.once('close', () => sockets.delete(socket));
      });

      // eslint-disable-next-line promise/param-names
      return new Promise((res) => {
        app.listen(actualPort, () => {
          log(
            `\nStarted miniOxygen server. Listening at http://localhost:${actualPort}\n`,
          );

          res({
            port: actualPort,
            close: () =>
              new Promise((resolve) => {
                sockets.forEach((socket) => socket.destroy());
                sockets.clear();
                app.closeAllConnections();
                app.close(() => resolve(undefined));
              }),
          });
        });
      });
    },
  };
}

export async function preview(opts: MiniOxygenPreviewOptions) {
  const {createServer, dispose, reload} = createMiniOxygen(opts);
  const {port, close} = await createServer(opts);

  return {
    port,
    reload,
    close: () => close().then(dispose),
  };
}
