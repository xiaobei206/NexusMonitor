import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: '.',
  plugins: [react()],
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // HardwareService is built by dotnet while Vite serves the renderer.
    // Never watch transient obj/bin/publish files: Windows locks them during builds.
    watch: { ignored: ['**/HardwareService/obj/**', '**/HardwareService/bin/**', '**/HardwareService/publish-win/**', '**/release/**'] },
  },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
});
