import {
  generate,
  loadCodegenConfig,
  type LoadCodegenConfigResult,
} from '@graphql-codegen/cli';
import {
  schema,
  preset,
  pluckConfig,
  patchGqlPluck,
} from '@shopify/hydrogen-codegen';
import {format, resolveFormatConfig} from './transpile-ts.js';
import {renderFatalError, renderWarning} from '@shopify/cli-kit/node/ui';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export {patchGqlPluck} from '@shopify/hydrogen-codegen';

const nodePath = process.argv[1];
const modulePath = fileURLToPath(import.meta.url);
const isStandaloneProcess = nodePath === modulePath;

if (isStandaloneProcess) {
  patchGqlPluck().then(() =>
    generateTypes({
      rootDirectory: process.argv[2]!,
      appDirectory: process.argv[3]!,
      configFilePath: process.argv[4],
      watch: true,
    }),
  );
}

/**
 * Spawns a child process to run GraphlQL CLI Codegen.
 * Running on a separate process splits work from this processor
 * and also allows us to filter out logs.
 */
export function spawnCodegenProcess({
  rootDirectory,
  appDirectory,
  configFilePath,
}: CodegenOptions) {
  const child = spawn(
    'node',
    [
      fileURLToPath(import.meta.url),
      rootDirectory,
      appDirectory,
      configFilePath ?? '',
    ],
    {stdio: ['inherit', 'ignore', 'pipe']},
  );

  child.stderr.on('data', (data) => {
    const dataString: string =
      typeof data === 'string' ? data : data?.toString?.('utf8') ?? '';

    if (!dataString) return;

    const [message = '', ...rest] = dataString
      .replaceAll('[FAILED]', '')
      .replace(/\s{2,}/g, '\n')
      .trim()
      .split('\n');

    console.log('');
    renderWarning({
      headline: '[Codegen] ' + message,
      body: rest.join('\n').replace(rootDirectory + '/', ''),
    });
  });

  child.on('close', (code) => {
    if (code !== 0) {
      renderFatalError({
        type: 0,
        name: 'CodegenError',
        message: `Codegen process exited with code ${code}`,
        tryMessage: 'Try restarting the dev server.',
      });
    }
  });

  return child;
}

type ProjectDirs = {
  rootDirectory: string;
  appDirectory: string;
};

type CodegenOptions = ProjectDirs & {
  configFilePath?: string;
  watch?: boolean;
};

export async function generateTypes({
  configFilePath,
  watch,
  ...dirs
}: CodegenOptions) {
  const {config: codegenConfig} =
    // Load <root>/codegen.ts if available
    (await loadCodegenConfig({
      configFilePath,
      searchPlaces: [dirs.rootDirectory],
    })) ||
    // Fall back to default config
    generateDefaultConfig(dirs);

  await addHooksToHydrogenOptions(codegenConfig, dirs);

  await generate(
    {
      ...codegenConfig,
      cwd: dirs.rootDirectory,
      watch,
      // Note: do not use `silent` here, it will swallow errors and
      // won't hide all logs. `errorsOnly` flag doesn't work either.
    },
    true,
  );
}

function generateDefaultConfig({rootDirectory, appDirectory}: ProjectDirs) {
  const tsDefaultGlob = '*!(*.d).{ts,tsx}'; // No d.ts files
  const appDirRelative = appDirectory
    .replace(rootDirectory, '')
    .replaceAll('/', '');

  return {
    filepath: 'virtual:codegen',
    config: {
      overwrite: true,
      pluckConfig: pluckConfig as any,
      generates: {
        ['sfapi.generated.d.ts']: {
          preset,
          schema,
          documents: [
            `${tsDefaultGlob}`, // E.g. ./server.ts
            `${appDirRelative}/**/${tsDefaultGlob}`, // E.g. app/routes/_index.tsx
          ],
        },
      },
    },
  };
}

async function addHooksToHydrogenOptions(
  codegenConfig: LoadCodegenConfigResult['config'],
  {rootDirectory}: ProjectDirs,
) {
  const [, options] =
    Object.entries(codegenConfig.generates).find(
      ([, value]) =>
        (Array.isArray(value) ? value[0] : value)?.schema === schema,
    ) || [];

  const hydrogenOptions = Array.isArray(options) ? options[0] : options;

  if (hydrogenOptions) {
    const formatConfig = await resolveFormatConfig(rootDirectory);

    hydrogenOptions.hooks = {
      beforeOneFileWrite: (file, content) =>
        format(content, formatConfig, file), // Run Prettier before writing files
      ...hydrogenOptions.hooks,
    };
  }
}
