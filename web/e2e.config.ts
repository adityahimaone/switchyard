import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
import { gateway } from 'ai';

export default {
  // The Vercel AI Gateway serves the model id and reads AI_GATEWAY_API_KEY, or the OIDC token of a linked Vercel project.
  // Deterministic flows never call it — only `agent.*` steps do.
  agents: {
    default: {
      model: gateway('openai/gpt-6-luna-fast'),
      system: 'You are a thorough QA agent. Verify every outcome.',
    },
  },
  targets: [{
    // `--target web` selects this; `verify:e2e` passes it explicitly.
    name: 'web',
    engine: web(),
    // No mobile target: @e2e-dev/mobile drives native apps
    // (bundleId/appPath) and cannot open a URL yet, so a web
    // app has nothing to point a device at. See design/README.md.
    app: {
      url: process.env.APP_URL ?? 'http://localhost:5173',
      // e2e starts and stops the dev server itself. The Switchyard
      // backend on :8790 must already be running — vite proxies
      // /api to it, and every page fetches it.
      command: { executable: 'pnpm', args: ['dev'], log: '.e2e/logs/app.log' },
    },
  }],
} satisfies E2EConfig;
