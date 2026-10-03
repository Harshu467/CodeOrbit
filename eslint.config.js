import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.next/**',
      '**/next-env.d.ts',
      '**/*.min.js',
      'tests/fixtures/repositories/failures/malformed.ts',
    ],
  },
  ...tseslint.configs.recommended,
];
