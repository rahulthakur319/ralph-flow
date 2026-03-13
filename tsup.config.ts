import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/bin/ralphflow.ts'],
  format: ['esm'],
  target: 'node18',
  dts: false,
  clean: true,
  external: ['better-sqlite3'],
});
