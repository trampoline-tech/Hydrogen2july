import Command from '@shopify/cli-kit/node/base-command';
import {muteDevLogs} from '../../lib/log.js';
import {getProjectPaths} from '../../lib/remix-config.js';
import {
  commonFlags,
  flagsToCamelObject,
  DEFAULT_PORT,
} from '../../lib/flags.js';
import {startMiniOxygen} from '../../lib/mini-oxygen/index.js';

export default class Preview extends Command {
  static description =
    'Runs a Hydrogen storefront in an Oxygen worker for production.';

  static flags = {
    path: commonFlags.path,
    port: commonFlags.port,
    ['native-unstable']: commonFlags.native,
  };

  async run(): Promise<void> {
    const {flags} = await this.parse(Preview);

    await runPreview({
      ...flagsToCamelObject(flags),
      useNative: flags['native-unstable'],
    });
  }
}

export async function runPreview({
  port = DEFAULT_PORT,
  path: appPath,
  useNative = false,
}: {
  port?: number;
  path?: string;
  useNative?: boolean;
}) {
  if (!process.env.NODE_ENV) process.env.NODE_ENV = 'production';

  muteDevLogs({workerReload: false});

  const {root, buildPathWorkerFile, buildPathClient} = getProjectPaths(appPath);

  const miniOxygen = await startMiniOxygen(
    {
      root,
      port,
      buildPathClient,
      buildPathWorkerFile,
    },
    useNative,
  );

  miniOxygen.showBanner({mode: 'preview'});
}
