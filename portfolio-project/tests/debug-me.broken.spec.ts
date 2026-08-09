import { expect, test } from '@playwright/test';

test('opens the home page from the site name', async ({ page }) => {
  await page.goto('/projects');
  await page.getByText('UT').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hi, I am UT');
});

test('shows how many projects are visible after filtering', async ({ page }) => {
  await page.goto('/projects');
  await page.getByRole('button', { name: 'React' }).click();
  await expect(page.getByTestId('result-count')).toHaveText('Showing 3 projects');
});

test('shows a validation error when the form is empty', async ({ page }) => {
  await page.goto('/contact');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByTestId('error-name')).toBeVisible();
});

test('confirms the contact form was sent', async ({ page }) => {
  await page.goto('/contact');
  await page.fill('#name', 'Random Person');
  await page.fill('#email', 'random@example.com');
  await page.fill('#message', 'I would like to talk about a new landing page.');
  await page.click('button[type="submit"]');
  await expect(page.locator('.success-toast')).toBeVisible({ timeout: 3000 });
});
