import { defineConfig } from "vite";

export default defineConfig(() => {
  const proxyPort = Number(process.env.AI_PROXY_PORT ?? 8787);
  const proxyTarget = `http://localhost:${proxyPort}`;
  return {
    build: {
      chunkSizeWarningLimit: 650,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalized = String(id).replaceAll("\\", "/");
            if (normalized.includes("node_modules/three")) return "vendor-three";
            if (normalized.includes("/src/ui/")) return "ui";
            return undefined;
          },
        },
      },
    },
    server: {
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
        },
        "/health": {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
        },
        "/health": {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
