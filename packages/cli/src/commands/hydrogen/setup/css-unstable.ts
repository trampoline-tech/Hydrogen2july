import {resolvePath} from '@shopify/cli-kit/node/path';
import {
  commonFlags,
  overrideFlag,
  flagsToCamelObject,
} from '../../../lib/flags.js';
import Command from '@shopify/cli-kit/node/base-command';
import {
  renderSelectPrompt,
  renderSuccess,
  renderTasks,
} from '@shopify/cli-kit/node/ui';
import {
  getPackageManager,
  installNodeModules,
} from '@shopify/cli-kit/node/node-package-manager';
import {Args} from '@oclif/core';
import {getRemixConfig} from '../../../lib/config.js';
import {
  setupCssStrategy,
  SETUP_CSS_STRATEGIES,
  type CssStrategy,
} from '../../../lib/setups/css/index.js';

export const CSS_STRATEGY_NAME_MAP: Record<CssStrategy, string> = {
  tailwind: 'Tailwind',
  'css-modules': 'CSS Modules',
  'vanilla-extract': 'Vanilla Extract',
  postcss: 'CSS',
};

export default class SetupCSS extends Command {
  static description = 'Setup CSS strategies for your project.';

  static hidden = true;

  static flags = {
    path: commonFlags.path,
    force: commonFlags.force,
    'install-deps': overrideFlag(commonFlags.installDeps, {default: true}),
  };

  static args = {
    strategy: Args.string({
      name: 'strategy',
      description: `The CSS strategy to setup. One of ${SETUP_CSS_STRATEGIES.join()}`,
      options: SETUP_CSS_STRATEGIES as unknown as string[],
    }),
  };

  async run(): Promise<void> {
    const {flags, args} = await this.parse(SetupCSS);
    const directory = flags.path ? resolvePath(flags.path) : process.cwd();

    await runSetupCSS({
      ...flagsToCamelObject(flags),
      strategy: args.strategy as CssStrategy,
      directory,
    });
  }
}

export async function runSetupCSS({
  strategy,
  directory,
  force = false,
  installDeps = true,
}: {
  strategy?: CssStrategy;
  directory: string;
  force?: boolean;
  installDeps: boolean;
}) {
  if (!strategy) {
    strategy = await renderSelectPrompt<CssStrategy>({
      message: `Select a styling library`,
      choices: SETUP_CSS_STRATEGIES.map((strategy) => ({
        label: CSS_STRATEGY_NAME_MAP[strategy],
        value: strategy,
      })),
    });
  }

  const remixConfig = await getRemixConfig(directory);

  const setupOutput = await setupCssStrategy(strategy, remixConfig, force);
  if (!setupOutput) return;

  const {workPromise, generatedAssets, helpUrl} = setupOutput;

  const tasks = [
    {
      title: 'Updating files',
      task: async () => {
        await workPromise;
      },
    },
  ];

  if (installDeps) {
    const gettingPkgManagerPromise = getPackageManager(
      remixConfig.rootDirectory,
    );

    tasks.push({
      title: 'Installing new dependencies',
      task: async () => {
        const packageManager = await gettingPkgManagerPromise;
        await installNodeModules({
          directory: remixConfig.rootDirectory,
          packageManager,
          args: [],
        });
      },
    });
  }

  await renderTasks(tasks);

  renderSuccess({
    headline: `${CSS_STRATEGY_NAME_MAP[strategy]} setup complete.`,
    body:
      (generatedAssets.length > 0
        ? 'You can now modify CSS configuration in the following files:\n' +
          generatedAssets.map((file) => `  - ${file}`).join('\n') +
          '\n'
        : '') + `\nFor more information, visit ${helpUrl}.`,
  });
}
