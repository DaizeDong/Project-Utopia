import { defineConfig } from "vite";

export default defineConfig(() => {
  const proxyPort = Number(process.env.AI_PROXY_PORT ?? 8787);
  const proxyTarget = `http://localhost:${proxyPort}`;
  return {
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
  };
});

