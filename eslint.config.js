import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    '**/dist/**',
    '**/node_modules/**',
    '**/.wrangler/**',
    '**/worker-configuration.d.ts',
    // Local agent worktrees (gitignored) are other checkouts of this repo.
    '.claude/worktrees/**',
  ]),
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Plain JS/config files are not part of any tsconfig project.
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // Node scripts run by CI or agents with plain `node` (no dependencies).
    files: ['apps/worker/scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        AbortSignal: 'readonly',
        URL: 'readonly',
      },
    },
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'Math.random is banned: use the seeded PRNG (game logic) or crypto.getRandomValues.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML is banned: render text via JSX, never raw HTML.',
        },
        {
          selector:
            'AssignmentExpression > MemberExpression.left[property.name=/^(innerHTML|outerHTML)$/]',
          message: 'innerHTML/outerHTML assignment is banned: use textContent or JSX text.',
        },
        {
          selector: 'CallExpression[callee.property.name=/^(insertAdjacentHTML|write|writeln)$/]',
          message: 'Raw HTML insertion is banned: use textContent or JSX text.',
        },
      ],
    },
  },
);
