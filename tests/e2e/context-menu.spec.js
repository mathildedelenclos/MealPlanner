const { test, expect } = require('@playwright/test');
const { resetAndLogin, createRecipe, addCalendarEntry, isoDate } = require('./helpers');

test.describe('Calendar entry context menu', () => {
    test.beforeEach(async ({ page }) => {
        await resetAndLogin(page);
        const recipeId = await createRecipe(page, 'Test Recipe');
        await addCalendarEntry(page, { recipeId, date: isoDate(new Date()) });
    });

    test('desktop: hover opens context menu', async ({ page, isMobile }) => {
        test.skip(isMobile, 'desktop-only');
        await page.goto('/calendar');
        const entry = page.locator('.cal-entry').first();
        await expect(entry).toBeVisible();
        await entry.hover();
        await expect(page.locator('.cal-ctx-menu')).toBeVisible();
    });

    test('desktop: entry is draggable', async ({ page, isMobile }) => {
        test.skip(isMobile, 'desktop-only');
        await page.goto('/calendar');
        const entry = page.locator('.cal-entry').first();
        await expect(entry).toHaveAttribute('draggable', 'true');
    });

    test('mobile: tap opens recipe modal (not context menu)', async ({ page, isMobile }) => {
        test.skip(!isMobile, 'mobile-only');
        await page.goto('/calendar');
        const link = page.locator('.cal-entry-link').first();
        await expect(link).toBeVisible();
        await link.tap();
        await expect(page.locator('#recipe-modal')).not.toHaveClass(/hidden/);
        // Context menu must NOT have opened on a simple tap
        await expect(page.locator('.cal-ctx-menu')).toHaveCount(0);
    });

    test('mobile: long-press opens context menu', async ({ page, isMobile }) => {
        test.skip(!isMobile, 'mobile-only');
        await page.goto('/calendar');
        const entry = page.locator('.cal-entry').first();
        await expect(entry).toBeVisible();
        await entry.dispatchEvent('touchstart');
        // Long-press threshold in app.js is 500ms
        await page.waitForTimeout(650);
        await expect(page.locator('.cal-ctx-menu')).toBeVisible();
    });

    test('mobile: draggable attribute is stripped', async ({ page, isMobile }) => {
        test.skip(!isMobile, 'mobile-only');
        await page.goto('/calendar');
        const entry = page.locator('.cal-entry').first();
        await expect(entry).toBeVisible();
        const hasDraggable = await entry.evaluate((el) => el.hasAttribute('draggable'));
        expect(hasDraggable).toBe(false);
    });
});
