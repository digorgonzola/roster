import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

const WORKER_TESTS = 'worker/test/**/*.test.ts'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'worker/**/*.test.ts'],
          exclude: [WORKER_TESTS],
        },
      },
      {
        plugins: [
          cloudflareTest(async () => ({
            main: './worker/index.ts',
            // Never reach a real Cloudflare account: production data lives there.
            remoteBindings: false,
            miniflare: {
              // Keep in step with wrangler.jsonc so tests run on production's runtime behaviour.
              compatibilityDate: '2026-08-06',
              // Fail closed: any request that would leave the Worker gets a 500 naming its URL.
              outboundService: (request: Request) => {
                throw new Error(`Tests must not reach the network: ${request.url}`)
              },
              d1Databases: ['DB'],
              durableObjects: { ROOMS: { className: 'RosterRoom', useSQLite: true } },
              bindings: {
                ENVIRONMENT: 'development',
                DEV_IDENTITY_EMAIL: 'you@example.com',
                HOUSEHOLD_EMAILS: 'you@example.com,partner@example.com',
                TEST_MIGRATIONS: await readD1Migrations('./migrations'),
              },
            },
          })),
        ],
        test: {
          name: 'worker',
          include: [WORKER_TESTS],
          setupFiles: ['./worker/test/setup.ts'],
        },
      },
    ],
  },
})
