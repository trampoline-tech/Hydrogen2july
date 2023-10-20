import {fileURLToPath} from 'node:url';
import {describe, it, expect} from 'vitest';
import {getLocaleFromRequest} from './templates/subdomains.js';
import {readFile} from '@shopify/cli-kit/node/fs';

describe('Setup i18n with subdomains', () => {
  it('extracts the locale from the subdomain', () => {
    expect(
      getLocaleFromRequest(new Request('https://example.com')),
    ).toMatchObject({
      language: 'EN',
      country: 'US',
    });
    expect(
      getLocaleFromRequest(new Request('https://jp.example.com')),
    ).toMatchObject({
      language: 'JA',
      country: 'JP',
    });
    expect(
      getLocaleFromRequest(new Request('https://es.sub.example.com')),
    ).toMatchObject({
      language: 'ES',
      country: 'ES',
    });
  });

  it('does not access imported types directly', async () => {
    const template = await readFile(
      fileURLToPath(new URL('./templates/domains.ts', import.meta.url)),
    );

    const typeImports = (template.match(/import\s+type\s+{([^}]+)}/)?.[1] || '')
      .trim()
      .split(/\s*,\s*/);

    expect(typeImports).not.toHaveLength(0);

    // Assert that typed imports are not accessed directly but via `I18nLocale[...]` instead.
    // These types are not imported in the final file.
    const fnCode = template.match(/function .*\n}$/ms)?.[0] || '';
    expect(fnCode).toBeTruthy();

    typeImports.forEach((typeImport) =>
      expect(fnCode).not.toContain(typeImport),
    );
  });
});
