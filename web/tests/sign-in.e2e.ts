import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// A deterministic flow: no agent.* steps, so it runs without a model
// key and replays from the cache. It pins the contract every other
// flow builds on — an unauthenticated session lands on the sign-in
// form, not a blank page or a redirect loop.
test('the sign-in page renders its form', async ({ app, browser, screen }) => {
  await app.open('/');
  await expect(screen.getByRole('heading', 'Sign in to Switchyard')).toBeVisible();
  await expect(browser.locator('input[type="password"]')).toBeVisible();
  await expect(screen.getByRole('button', 'Sign in')).toBeVisible();
});
