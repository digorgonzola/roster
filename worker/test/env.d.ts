import type { D1Migration } from 'cloudflare:test'
import type { Env as WorkerEnv } from '../env'

declare global {
  namespace Cloudflare {
    // The bindings vitest.config.ts gives the worker test project.
    interface Env extends WorkerEnv {
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}
