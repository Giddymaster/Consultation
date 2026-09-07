import { defineConfig, loadEnv, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }): UserConfig => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiUrl = env.VITE_API_URL ?? 'http://localhost:4000';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      strictPort: true,
      // Proxying in development keeps the browser same-origin, so the refresh
      // cookie behaves exactly as it will in production behind one domain.
      proxy: {
        '/api': { target: apiUrl, changeOrigin: true, secure: false },
      },
    },
    build: {
      target: 'es2022',
      sourcemap: true,
      rollupOptions: {
        output: {
          // Split the heavy, rarely-changing libraries out of the app chunk so
          // a content deploy does not invalidate the whole vendor bundle.
          // Vite 8 takes a function here rather than a map.
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom)[\\/]/.test(id)) return 'react';
            if (id.includes('recharts') || id.includes('d3-')) return 'charts';
            if (id.includes('@tanstack')) return 'query';
            if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('/zod/')) return 'forms';
            if (id.includes('luxon')) return 'datetime';
            return undefined;
          },
        },
      },
      chunkSizeWarningLimit: 900,
    },
  };
});
