import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('homepage text, entry point, inspection, evidence and report', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page).toHaveTitle("ORIL — Know what you're signing");
  await expect(page.getByRole('heading', { name: "Know what you're signing." })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('â');
  await expect(page.getByRole('link', { name: /Inspect a signature/ })).toBeVisible();
  const inspectButton = page.getByRole('button', { name: 'Inspect a signature' });
  expect((await inspectButton.boundingBox())?.y).toBeLessThan(900);
  await inspectButton.click();
  await expect(page.locator('.error')).toContainText('Paste a signature request');
  await page.getByRole('textbox', { name: 'Signature request' }).fill('{bad');
  await inspectButton.click();
  await expect(page.locator('.error')).toContainText('Invalid JSON');
  await page.getByRole('button', { name: /Load example/ }).click();
  await inspectButton.click();
  await expect(page.getByText('ERC-2612 permit').first()).toBeVisible();
  const map = page.getByRole('region', { name: 'Authorization map' });
  await expect(map).toBeVisible();
  await map.getByRole('button', { name: /Claimed owner/ }).first().click();
  await expect(map.getByText('Source: message.owner')).toBeVisible();
  await map.getByRole('button', { name: 'Zoom in' }).click();
  await expect(map.getByText('110%')).toBeVisible();
  await map.getByRole('button', { name: 'Reset map' }).click();
  await expect(map.getByText('100%')).toBeVisible();
  await expect(page.getByText('Contract behavior is unverified')).toBeVisible();
  const jsonDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const jsonFile = await jsonDownload;
  expect(jsonFile.suggestedFilename()).toBe('oril-report.json');
  expect(JSON.parse(await readFile(await jsonFile.path(), 'utf8')).kind).toBe('ERC-2612 permit');
  await page.getByRole('button', { name: /Open report/ }).click();
  await expect(page.getByText('Request inspection')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download redacted JSON' }).click();
  const redactedFile = await download;
  expect(redactedFile.suggestedFilename()).toBe('oril-redacted.json');
  expect(await readFile(await redactedFile.path(), 'utf8')).not.toContain('0x0000000000000000000000000000000000000003');
  await page.getByRole('button', { name: /Back to workspace/ }).click();
  await page.getByRole('button', { name: 'Documentation' }).first().click();
  await expect(page.getByRole('heading', { name: /Understand the request/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('network selection flags declared-chain mismatch', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'NETWORK' }).selectOption('8453');
  await page.getByRole('button', { name: /Load example/ }).click();
  await page.getByRole('button', { name: 'Inspect a signature' }).click();
  await expect(page.getByText('Domain chain differs from selected network')).toBeVisible();
  await expect(page.getByText('Lookup network: Base. Metadata is untrusted.')).toBeVisible();
  await page.getByRole('combobox', { name: 'NETWORK' }).selectOption('4663');
  await page.getByRole('button', { name: 'Inspect a signature' }).click();
  await expect(page.getByText('Lookup network: Robinhood Chain. Metadata is untrusted.')).toBeVisible();
});

test('responsive controls and no horizontal overflow', async ({ page }) => {
  test.setTimeout(120_000);
  for (const width of [320, 390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    if (width === 320 || width === 1440) await page.screenshot({ path: `test-results/home-${width}.png`, fullPage: true });
    await expect(page.getByRole('button', { name: 'Inspect a signature' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.getByRole('button', { name: /Load example/ }).click();
    await page.getByRole('button', { name: 'Inspect a signature' }).click();
    await expect(page.getByRole('region', { name: 'Authorization map' })).toBeVisible();
    if (width === 320 || width === 1440) { await page.waitForTimeout(700); await page.screenshot({ path: `test-results/workspace-${width}.png`, fullPage: true }); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});
