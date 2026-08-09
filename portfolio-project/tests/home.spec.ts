import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('renders the hero heading and tagline', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hi, I am UT');
  await expect(page.getByTestId('hero-tagline')).toBeVisible();
});

test('has the expected document title', async ({ page }) => {
  await expect(page).toHaveTitle('UT | Front-end engineer');
});

test('shows three career stats', async ({ page }) => {
  const stats = page.getByRole('region', { name: 'Career stats' });
  await expect(stats.locator('.stat')).toHaveCount(3);
  await expect(stats).toContainText('Projects shipped');
});

test('lists exactly three featured projects', async ({ page }) => {
  await expect(page.getByTestId('featured-grid').getByTestId('project-card')).toHaveCount(3);
});

test('the primary call to action opens the projects page', async ({ page }) => {
  await page.getByRole('link', { name: 'View my work' }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Projects');
});
