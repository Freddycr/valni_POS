import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    allowedHosts: ['.ngrok-free.dev'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['**/node_modules/**', '**/agent/**'],
  }
});
