import {randomUUID} from 'node:crypto';
import {
  outputInfo,
  outputToken,
  outputContent,
} from '@shopify/cli-kit/node/output';
import {resolvePath} from '@shopify/cli-kit/node/path';
import {fileExists, readFile} from '@shopify/cli-kit/node/fs';
import colors from '@shopify/cli-kit/node/colors';
import {renderSuccess} from '@shopify/cli-kit/node/ui';
import {
  startServer,
  Request,
  Response,
  fetch,
  type MiniOxygenOptions as InternalMiniOxygenOptions,
} from '@shopify/mini-oxygen';
import {DEFAULT_PORT} from './flags.js';
import {
  logRequestEvent,
  logSubRequestEvent,
  streamRequestEvents,
} from './request-events.js';

type MiniOxygenOptions = {
  root: string;
  port?: number;
  watch?: boolean;
  autoReload?: boolean;
  buildPathClient: string;
  buildPathWorkerFile: string;
  env?: {[key: string]: string};
};

export type MiniOxygen = Awaited<ReturnType<typeof startMiniOxygen>>;

export async function startMiniOxygen({
  root,
  port = DEFAULT_PORT,
  watch = false,
  autoReload = watch,
  buildPathWorkerFile,
  buildPathClient,
  env,
}: MiniOxygenOptions) {
  const dotenvPath = resolvePath(root, '.env');

  const miniOxygen = await startServer({
    script: await readFile(buildPathWorkerFile),
    assetsDir: buildPathClient,
    publicPath: '',
    port,
    watch,
    autoReload,
    modules: true,
    env: {
      ...env,
      ...process.env,
    },
    envPath: !env && (await fileExists(dotenvPath)) ? dotenvPath : undefined,
    log: () => {},
    onRequest: (request) => {
      const url = new URL(request.url);
      if (url.pathname === '/debug-network-server') {
        return streamRequestEvents(request);
      }

      request.headers.set('request-id', randomUUID());
      request.headers.set('x-start-time', String(new Date().getTime()));
    },
    onResponse: (request, response) => {
      logRequestEvent({
        request,
        startTime: Number(request.headers.get('x-start-time')!),
      });

      logResponse(request, response);
    },
    globalFetch: async (requestInfo, requestInit) => {
      const startTime = new Date().getTime();

      const response = await fetch(requestInfo, requestInit);

      const eventRequest = new Request(requestInfo, requestInit);
      logSubRequestEvent({
        response,
        startTime,
        requestUrl: eventRequest.url,
        requestHeaders: eventRequest.headers,
        requestBody:
          typeof requestInit?.body === 'string' ? requestInit.body : '',
      });

      return response;
    },
  });

  const listeningAt = `http://localhost:${miniOxygen.port}`;

  return {
    listeningAt,
    port: miniOxygen.port,
    async reload(
      options: Partial<Pick<MiniOxygenOptions, 'env'>> & {
        worker?: boolean;
      } = {},
    ) {
      const nextOptions: Partial<InternalMiniOxygenOptions> = {};

      if (options.env) {
        nextOptions.env = {
          ...options.env,
          ...(process.env as Record<string, string>),
        };
      }

      if (options.worker) {
        nextOptions.script = await readFile(buildPathWorkerFile);
      }

      return miniOxygen.reload(nextOptions);
    },
    showBanner(options?: {
      mode?: string;
      headlinePrefix?: string;
      extraLines?: string[];
      appName?: string;
    }) {
      console.log('');
      renderSuccess({
        headline: `${options?.headlinePrefix ?? ''}MiniOxygen ${
          options?.mode ?? 'development'
        } server running.`,
        body: [
          `View ${options?.appName ?? 'Hydrogen'} app: ${listeningAt}`,
          ...(options?.extraLines ?? []),
        ],
      });
      console.log('');
    },
  };
}

export function logResponse(request: Request, response: Response) {
  try {
    const url = new URL(request.url);
    if (['/graphiql', '/debug-network'].includes(url.pathname)) {
      return;
    }

    const isProxy = !!response.url && response.url !== request.url;
    const isDataRequest = !isProxy && url.searchParams.has('_data');
    let route = request.url.replace(url.origin, '');
    let info = '';
    let type = 'render';

    if (isProxy) {
      type = 'proxy';
      info = `[${response.url}]`;
    }

    if (isDataRequest) {
      type = request.method === 'GET' ? 'loader' : 'action';
      const dataParam = url.searchParams.get('_data')?.replace('routes/', '');
      route = url.pathname;
      info = `[${dataParam}]`;
    }

    const colorizeStatus =
      response.status < 300
        ? outputToken.green
        : response.status < 400
        ? outputToken.cyan
        : outputToken.errorText;

    outputInfo(
      outputContent`${request.method.padStart(6)}  ${colorizeStatus(
        String(response.status),
      )}  ${outputToken.italic(type.padEnd(7, ' '))} ${route}${
        info ? ' ' + colors.dim(info) : ''
      } ${
        request.headers.get('purpose') === 'prefetch'
          ? outputToken.italic('(prefetch)')
          : ''
      }`,
    );
  } catch {
    if (request && response) {
      outputInfo(`${request.method} ${response.status} ${request.url}`);
    }
  }
}
