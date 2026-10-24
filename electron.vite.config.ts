import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {},
  preload: {
    build: {
      externalizeDeps: false,
      rolldownOptions: { output: { format: 'cjs', entryFileNames: 'index.cjs' } }
    }
  },
  renderer: {
    plugins: [{
      name: 'development-style-csp',
      apply: 'serve',
      transformIndexHtml(html) {
        // Vite injects CSS during development; production keeps external styles only.
        return html
          .replace("style-src 'self';", "style-src 'self' 'unsafe-inline';")
          .replace("connect-src 'self';", "connect-src 'self' ws://localhost:* ws://127.0.0.1:*;")
      }
    }]
  }
})
