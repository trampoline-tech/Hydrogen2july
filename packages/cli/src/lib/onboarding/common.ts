import {readdir} from 'node:fs/promises';
import {
  installNodeModules,
  packageManagerUsedForCreating,
  type PackageManager,
} from '@shopify/cli-kit/node/node-package-manager';
import {
  renderSuccess,
  renderInfo,
  renderSelectPrompt,
  renderTextPrompt,
  renderConfirmationPrompt,
  renderFatalError,
  renderWarning,
} from '@shopify/cli-kit/node/ui';
import {capitalize, hyphenate} from '@shopify/cli-kit/common/string';
import {basename, resolvePath, joinPath} from '@shopify/cli-kit/node/path';
import {
  initializeGitRepository,
  addAllToGitFromDirectory,
  createGitCommit,
} from '@shopify/cli-kit/node/git';
import {AbortError} from '@shopify/cli-kit/node/error';
import {AbortController} from '@shopify/cli-kit/node/abort';
import {rmdir, fileExists, isDirectory} from '@shopify/cli-kit/node/fs';
import {
  outputDebug,
  formatPackageManagerCommand,
} from '@shopify/cli-kit/node/output';
import colors from '@shopify/cli-kit/node/colors';
import {type AdminSession, login, renderLoginSuccess} from '../auth.js';
import {
  type I18nStrategy,
  I18N_STRATEGY_NAME_MAP,
  setupI18nStrategy,
} from '../setups/i18n/index.js';
import {titleize} from '../string.js';
import {
  ALIAS_NAME,
  createPlatformShortcut,
  getCliCommand,
  type CliCommand,
} from '../shell.js';
import {transpileProject} from '../transpile-ts.js';
import {
  CSS_STRATEGY_NAME_MAP,
  SETUP_CSS_STRATEGIES,
  setupCssStrategy,
  type CssStrategy,
} from '../setups/css/index.js';
import {generateMultipleRoutes, ROUTE_MAP} from '../setups/routes/generate.js';

export type InitOptions = {
  path?: string;
  template?: string;
  language?: Language;
  mockShop?: boolean;
  styling?: StylingChoice;
  i18n?: I18nChoice;
  token?: string;
  force?: boolean;
  routes?: boolean;
  shortcut?: boolean;
  installDeps?: boolean;
};

export const LANGUAGES = {
  js: 'JavaScript',
  ts: 'TypeScript',
} as const;
type Language = keyof typeof LANGUAGES;

export type StylingChoice = (typeof SETUP_CSS_STRATEGIES)[number];

export type I18nChoice = I18nStrategy | 'none';

const i18nStrategies = {
  ...I18N_STRATEGY_NAME_MAP,
  none: 'No internationalization',
};

export async function handleI18n(
  controller: AbortController,
  flagI18n?: I18nChoice,
) {
  let selection =
    flagI18n ??
    (await renderSelectPrompt<I18nChoice>({
      message: 'Select an internationalization strategy',
      choices: Object.entries(i18nStrategies).map(([value, label]) => ({
        value: value as I18nStrategy,
        label,
      })),
      abortSignal: controller.signal,
    }));

  const i18nStrategy = selection === 'none' ? undefined : selection;

  return {
    i18nStrategy,
    setupI18n: async (rootDirectory: string, language: Language) => {
      if (i18nStrategy) {
        await setupI18nStrategy(i18nStrategy, {
          rootDirectory,
          serverEntryPoint: language === 'ts' ? 'server.ts' : 'server.js',
        });
      }
    },
  };
}

export async function handleRouteGeneration(
  controller: AbortController,
  flagRoutes: boolean = true, // TODO: Remove default value when multi-select UI component is available
) {
  // TODO: Need a multi-select UI component
  const shouldScaffoldAllRoutes =
    flagRoutes ??
    (await renderConfirmationPrompt({
      message:
        'Scaffold all standard route files? ' +
        Object.keys(ROUTE_MAP).join(', '),
      confirmationMessage: 'Yes',
      cancellationMessage: 'No',
      abortSignal: controller.signal,
    }));

  const routes = shouldScaffoldAllRoutes ? ROUTE_MAP : {};

  return {
    routes,
    setupRoutes: async (
      directory: string,
      language: Language,
      i18nStrategy?: I18nStrategy,
    ) => {
      if (shouldScaffoldAllRoutes) {
        await generateMultipleRoutes({
          routeName: 'all',
          directory,
          force: true,
          typescript: language === 'ts',
          localePrefix: i18nStrategy === 'subfolders' ? 'locale' : false,
          signal: controller.signal,
        });
      }
    },
  };
}

/**
 * Prompts the user to create a global alias (h2) for the Hydrogen CLI.
 * @returns A function that creates the shortcut, or undefined if the user chose not to create a shortcut.
 */
export async function handleCliShortcut(
  controller: AbortController,
  cliCommand: CliCommand,
  flagShortcut?: boolean,
) {
  const shouldCreateShortcut =
    flagShortcut ??
    (await renderConfirmationPrompt({
      confirmationMessage: 'Yes',
      cancellationMessage: 'No',
      message: [
        'Create a global',
        {command: ALIAS_NAME},
        'alias to run commands instead of',
        {command: cliCommand},
        '?',
      ],
      abortSignal: controller.signal,
    }));

  if (!shouldCreateShortcut) return;

  return async () => {
    try {
      const shortcuts = await createPlatformShortcut();
      return shortcuts.length > 0;
    } catch (error: any) {
      // Ignore errors.
      // We'll inform the user to create the
      // shortcut manually in the next step.
      outputDebug(
        'Failed to create shortcut.' +
          (error?.stack ?? error?.message ?? error),
      );

      return false;
    }
  };
}

type StorefrontInfo = {
  title: string;
  shop: string;
  shopName: string;
  email: string;
  session: AdminSession;
};

/**
 * Prompts the user to link a Hydrogen storefront to their project.
 * @returns The linked shop and storefront.
 */
export async function handleStorefrontLink(
  controller: AbortController,
): Promise<StorefrontInfo> {
  const {session, config} = await login();
  renderLoginSuccess(config);

  const title = await renderTextPrompt({
    message: 'New storefront name',
    defaultValue: titleize(config.shopName),
    abortSignal: controller.signal,
  });

  return {...config, title, session};
}

type Project = {
  location: string;
  name: string;
  directory: string;
  storefrontInfo?: Awaited<ReturnType<typeof handleStorefrontLink>>;
};

/**
 * Prompts the user to select a project directory location.
 * @returns Project information, or undefined if the user chose not to force project creation.
 */
export async function handleProjectLocation({
  storefrontInfo,
  controller,
  force,
  path: flagPath,
}: {
  path?: string;
  force?: boolean;
  controller: AbortController;
  storefrontInfo?: StorefrontInfo;
}): Promise<Project | undefined> {
  const storefrontDirectory = storefrontInfo && hyphenate(storefrontInfo.title);

  let location =
    flagPath ??
    storefrontDirectory ??
    (await renderTextPrompt({
      message: 'Where would you like to create your storefront?',
      defaultValue: './hydrogen-storefront',
      abortSignal: controller.signal,
    }));

  let directory = resolvePath(process.cwd(), location);

  if (await projectExists(directory)) {
    if (!force && storefrontDirectory) {
      location = await renderTextPrompt({
        message: `There's already a folder called \`${storefrontDirectory}\`. Where do you want to create the app?`,
        defaultValue: './' + storefrontDirectory,
        abortSignal: controller.signal,
      });

      directory = resolvePath(process.cwd(), location);

      if (!(await projectExists(directory))) {
        force = true;
      }
    }

    if (!force) {
      const deleteFiles = await renderConfirmationPrompt({
        message: `The directory ${colors.cyan(
          location,
        )} is not empty. Do you want to delete the existing files and continue?`,
        defaultValue: false,
        abortSignal: controller.signal,
      });

      if (!deleteFiles) {
        renderInfo({
          body: `Destination path ${colors.cyan(
            location,
          )} already exists and is not an empty directory. You may use \`--force\` or \`-f\` to override it.`,
        });

        return;
      }
    }

    await rmdir(directory);
  }

  return {location, name: basename(location), directory, storefrontInfo};
}

/**
 * Prompts the user to select a JS or TS.
 * @returns A function that optionally transpiles the project to JS, if that was chosen.
 */
export async function handleLanguage(
  projectDir: string,
  controller: AbortController,
  flagLanguage?: Language,
) {
  const language =
    flagLanguage ??
    (await renderSelectPrompt({
      message: 'Choose a language',
      choices: [
        {label: 'JavaScript', value: 'js'},
        {label: 'TypeScript', value: 'ts'},
      ],
      defaultValue: 'js',
      abortSignal: controller.signal,
    }));

  return {
    language,
    async transpileProject() {
      if (language === 'js') {
        await transpileProject(projectDir);
      }
    },
  };
}

/**
 * Prompts the user to select a CSS strategy.
 * @returns The chosen strategy name and a function that sets up the CSS strategy.
 */
export async function handleCssStrategy(
  projectDir: string,
  controller: AbortController,
  flagStyling?: StylingChoice,
) {
  const selectedCssStrategy =
    flagStyling ??
    (await renderSelectPrompt<CssStrategy>({
      message: `Select a styling library`,
      choices: SETUP_CSS_STRATEGIES.map((strategy) => ({
        label: CSS_STRATEGY_NAME_MAP[strategy],
        value: strategy,
      })),
      defaultValue: 'tailwind',
      abortSignal: controller.signal,
    }));

  return {
    cssStrategy: selectedCssStrategy,
    async setupCss() {
      const result = await setupCssStrategy(
        selectedCssStrategy,
        {
          rootDirectory: projectDir,
          appDirectory: joinPath(projectDir, 'app'), // Default value in new projects
        },
        true,
      );

      if (result) {
        await result.workPromise;
      }
    },
  };
}

/**
 * Prompts the user to choose whether to install dependencies and which package manager to use.
 * It infers the package manager used for creating the project and uses that as the default.
 * @returns The chosen pacakge manager and a function that optionally installs dependencies.
 */
export async function handleDependencies(
  projectDir: string,
  controller: AbortController,
  shouldInstallDeps?: boolean,
) {
  const detectedPackageManager = await packageManagerUsedForCreating();
  let actualPackageManager: PackageManager = 'npm';

  if (shouldInstallDeps !== false) {
    if (detectedPackageManager === 'unknown') {
      const result = await renderSelectPrompt<'no' | PackageManager>({
        message: `Select package manager to install dependencies`,
        choices: [
          {label: 'NPM', value: 'npm'},
          {label: 'PNPM', value: 'pnpm'},
          {label: 'Yarn v1', value: 'yarn'},
          {label: 'Skip, install later', value: 'no'},
        ],
        defaultValue: 'npm',
        abortSignal: controller.signal,
      });

      if (result === 'no') {
        shouldInstallDeps = false;
      } else {
        actualPackageManager = result;
        shouldInstallDeps = true;
      }
    } else if (shouldInstallDeps === undefined) {
      actualPackageManager = detectedPackageManager;
      shouldInstallDeps = await renderConfirmationPrompt({
        message: `Install dependencies with ${detectedPackageManager}?`,
        confirmationMessage: 'Yes',
        cancellationMessage: 'No',
        abortSignal: controller.signal,
      });
    }
  }

  return {
    packageManager: actualPackageManager,
    shouldInstallDeps,
    installDeps: shouldInstallDeps
      ? async () => {
          await installNodeModules({
            directory: projectDir,
            packageManager: actualPackageManager,
            args: [],
            signal: controller.signal,
          });
        }
      : () => {},
  };
}

export async function createInitialCommit(directory: string) {
  try {
    await initializeGitRepository(directory);
    await addAllToGitFromDirectory(directory);
    await createGitCommit('Scaffold Storefront', {directory});
  } catch (error: any) {
    // Ignore errors
    outputDebug(
      'Failed to initialize Git.\n' + error?.stack ?? error?.message ?? error,
    );
  }
}

export type SetupSummary = {
  language: Language;
  packageManager: 'npm' | 'pnpm' | 'yarn';
  cssStrategy?: CssStrategy;
  hasCreatedShortcut: boolean;
  depsInstalled: boolean;
  depsError?: Error;
  i18n?: I18nStrategy;
  i18nError?: Error;
  routes?: Record<string, string | string[]>;
  routesError?: Error;
};

/**
 * Shows a summary success message with next steps.
 */
export async function renderProjectReady(
  project: Project,
  {
    language,
    packageManager,
    depsInstalled,
    cssStrategy,
    hasCreatedShortcut,
    routes,
    i18n,
    depsError,
    i18nError,
    routesError,
  }: SetupSummary,
) {
  const hasErrors = Boolean(depsError || i18nError || routesError);
  const bodyLines: [string, string][] = [
    ['Shopify', project.storefrontInfo?.title ?? 'Mock.shop'],
    ['Language', LANGUAGES[language]],
  ];

  if (cssStrategy) {
    bodyLines.push(['Styling', CSS_STRATEGY_NAME_MAP[cssStrategy]]);
  }

  if (!i18nError && i18n) {
    bodyLines.push(['i18n', I18N_STRATEGY_NAME_MAP[i18n].split(' (')[0]!]);
  }

  let routeSummary = '';

  if (!routesError && routes && Object.keys(routes).length) {
    bodyLines.push(['Routes', '']);

    for (let [routeName, routePaths] of Object.entries(routes)) {
      routePaths = Array.isArray(routePaths) ? routePaths : [routePaths];

      routeSummary += `\n    • ${capitalize(routeName)} ${colors.dim(
        '(' +
          routePaths.map((item) => '/' + normalizeRoutePath(item)).join(' & ') +
          ')',
      )}`;
    }
  }

  const padMin =
    1 + bodyLines.reduce((max, [label]) => Math.max(max, label.length), 0);

  const cliCommand = hasCreatedShortcut
    ? ALIAS_NAME
    : await getCliCommand(project.directory, packageManager);

  const render = hasErrors ? renderWarning : renderSuccess;

  render({
    headline:
      `Storefront setup complete` +
      (hasErrors ? ' with errors (see warnings below).' : '!'),

    body:
      bodyLines
        .map(
          ([label, value]) =>
            `  ${(label + ':').padEnd(padMin, ' ')}  ${colors.dim(value)}`,
        )
        .join('\n') + routeSummary,

    // Use `customSections` instead of `nextSteps` and `references`
    // here to enforce a newline between title and items.
    customSections: [
      hasErrors && {
        title: 'Warnings\n',
        body: [
          {
            list: {
              items: [
                depsError && [
                  'Failed to install dependencies:',
                  {subdued: depsError.message},
                ],
                i18nError && [
                  'Failed to scaffold i18n:',
                  {subdued: i18nError.message},
                ],
                routesError && [
                  'Failed to scaffold routes:',
                  {subdued: routesError.message},
                ],
              ].filter((step): step is string[] => Boolean(step)),
            },
          },
        ],
      },
      {
        title: 'Help\n',
        body: {
          list: {
            items: [
              {
                link: {
                  label: 'Guides',
                  url: 'https://shopify.dev/docs/custom-storefronts/hydrogen/building',
                },
              },
              {
                link: {
                  label: 'API reference',
                  url: 'https://shopify.dev/docs/api/storefront',
                },
              },
              {
                link: {
                  label: 'Demo Store code',
                  url: 'https://github.com/Shopify/hydrogen/tree/HEAD/templates/demo-store',
                },
              },
              [
                'Run',
                {
                  command: `${cliCommand} --help`,
                },
              ],
            ],
          },
        },
      },
      {
        title: 'Next steps\n',
        body: [
          {
            list: {
              items: [
                [
                  'Run',
                  {
                    command: `cd ${project.location.replace(/^\.\//, '')}${
                      depsInstalled ? '' : ` && ${packageManager} install`
                    } && ${formatPackageManagerCommand(packageManager, 'dev')}`,
                  },
                ],
              ].filter((step): step is string[] => Boolean(step)),
            },
          },
        ],
      },
    ].filter((step): step is {title: string; body: any} => Boolean(step)),
  });
}

export function createAbortHandler(
  controller: AbortController,
  project: {directory: string},
) {
  return async function abort(error: AbortError): Promise<never> {
    controller.abort();

    if (typeof project !== 'undefined') {
      await rmdir(project!.directory, {force: true}).catch(() => {});
    }

    renderFatalError(
      new AbortError(
        'Failed to initialize project: ' + error?.message ?? '',
        error?.tryMessage ?? error?.stack,
      ),
    );

    process.exit(1);
  };
}

/**
 * @returns Whether the project directory exists and is not empty.
 */
async function projectExists(projectDir: string) {
  return (
    (await fileExists(projectDir)) &&
    (await isDirectory(projectDir)) &&
    (await readdir(projectDir)).length > 0
  );
}

function normalizeRoutePath(routePath: string) {
  const isIndex = /(^|\/)index$/.test(routePath);
  return isIndex
    ? routePath.slice(0, -'index'.length).replace(/\/$/, '')
    : routePath
        .replace(/\$/g, ':')
        .replace(/[\[\]]/g, '')
        .replace(/:(\w+)Handle/i, ':handle');
}
