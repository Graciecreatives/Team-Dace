export default defineNuxtConfig({
  devServer: { host: '::', port: 3000 },
  compatibilityDate: '2026-10-24',
  nitro: {
    experimental: { wasm: true },
    cloudflare: { nodeCompat: true },
    ...(process.env.NITRO_PRESET?.startsWith('cloudflare') ? {
      alias: { '@cf-wasm/photon/node': '@cf-wasm/photon/workerd' },
    } : { alias: { '@cf-wasm/photon/workerd': '@cf-wasm/photon/node' } }),
  },
  devtools: { enabled: true },
  runtimeConfig: {
    public: {
      mapTileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      mapAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    },
  },
  modules: ['@nuxtjs/tailwindcss'],
  css: ['~/assets/css/main.css', '~/assets/css/components.css'],
  tailwindcss: {
    config: {
      theme: {
        extend: {
          fontFamily: {
            sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
          },
        },
      },
    },
  },
  app: {
    head: {
      title: 'FarmBuddy',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'anonymous' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200..800&display=swap',
        },
      ],
    },
  },
})
