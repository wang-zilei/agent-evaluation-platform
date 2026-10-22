import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const pagesBase = process.env.CI_PAGES_URL
  ? `${new URL(process.env.CI_PAGES_URL).pathname.replace(/\/$/, '')}/`
  : '/'

// https://vite.dev/config/
export default defineConfig({
  base: pagesBase,
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    css: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
