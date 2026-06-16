import next from 'eslint-config-next';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  {
    ignores: ['node_modules/', 'dist/', '.next/', 'out/', 'coverage/', 'e2e/'],
  },
  ...next,
  ...nextTypescript,
  ...nextCoreWebVitals,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'react-hooks/incompatible-library': 'off',
    },
  },
];

export default config;
