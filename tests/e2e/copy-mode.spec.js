const { test, expect } = require('@playwright/test');
const { resetAndLogin, createRecipe, addCalendarEntry, isoDate } = require('./helpers');

test.describe('Copy-to pick-a-slot flow', () => {
    test.beforeEach(async ({ page }) => {
        await resetAndLogin(page);
        const recipeId = await createRecipe(page, 'Copy Me');
        await addCalendarEntry(page, { recipeId, date: isoDate(new Date()) });
    });

    async function openContextMenu(page, isMobile) {
        const entry = page.locator('.cal-entry').first();
        await expect(entry).toBeVisible();
        if (isMobile) {
            await entry.dispatchEvent('touchstart');
            await page.waitForTimeout(650);
        } else {
            await entry.hover();
        }
        await expect(page.locator('.cal-ctx-menu')).toBeVisible();
    }

    test('copy banner appears after selecting Copy to', async ({ page, isMobile }) => {
        await page.goto('/calendar');
        await openContextMenu(page, isMobile);
        await page.locator('.ctx-copy').click();
        await expect(page.locator('#copy-mode-banner')).toBeVisible();
        await expect(page.locator('#copy-mode-banner .copy-mode-msg')).toContainText(/Tap \+/i);
    });

    test('clicking + in copy mode adds a new entry and keeps banner armed', async ({ page, isMobile }) => {
        await page.goto('/calendar');
        await openContextMenu(page, isMobile);
        await page.locator('.ctx-copy').click();
        await expect(page.locator('#copy-mode-banner')).toBeVisible();

        const entriesBefore = await page.locator('.cal-entry').count();

        // Pick a + button that's not in the same meal slot as the source entry.
        // Last one in the grid is fine (could be "dinner" the next day, etc.)
        await page.locator('.cal-add-btn').last().click();

        // After copy: entry count increased by 1, banner still visible, count updated
        await expect
            .poll(async () => await page.locator('.cal-entry').count(), { timeout: 4000 })
            .toBe(entriesBefore + 1);
        await expect(page.locator('#copy-mode-banner')).toBeVisible();
        await expect(page.locator('#copy-mode-banner .copy-mode-msg')).toContainText(/1/);
        await expect(page.locator('#copy-mode-banner .copy-mode-cancel')).toHaveText(/Done|Terminé/);
    });

    test('Done button exits copy mode', async ({ page, isMobile }) => {
        await page.goto('/calendar');
        await openContextMenu(page, isMobile);
        await page.locator('.ctx-copy').click();
        await expect(page.locator('#copy-mode-banner')).toBeVisible();
        await page.locator('#copy-mode-banner .copy-mode-cancel').click();
        await expect(page.locator('#copy-mode-banner')).toHaveCount(0);
    });

    test('navigating away exits copy mode', async ({ page, isMobile }) => {
        await page.goto('/calendar');
        await openContextMenu(page, isMobile);
        await page.locator('.ctx-copy').click();
        await expect(page.locator('#copy-mode-banner')).toBeVisible();
        // Click the Recipes sidebar nav link
        await page.locator('.nav-link[data-view="recipes"]').click();
        await expect(page.locator('#copy-mode-banner')).toHaveCount(0);
    });
});
