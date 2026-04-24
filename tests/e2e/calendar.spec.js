const { test, expect } = require('@playwright/test');
const { resetAndLogin, createRecipe, addCalendarEntry, isoDate } = require('./helpers');

test.describe('Calendar layout', () => {
    test.beforeEach(async ({ page }) => {
        await resetAndLogin(page);
        const recipeId = await createRecipe(page);
        await addCalendarEntry(page, { recipeId, date: isoDate(new Date()) });
    });

    test('desktop: week row arranges day label beside meals', async ({ page, isMobile }) => {
        test.skip(isMobile, 'desktop-only');
        await page.goto('/calendar');
        const row = page.locator('.cal-week-row').first();
        await expect(row).toBeVisible();
        const flexDir = await row.evaluate((el) => getComputedStyle(el).flexDirection);
        expect(flexDir).toBe('row');
    });

    test('mobile: week row stacks day label above meals', async ({ page, isMobile }) => {
        test.skip(!isMobile, 'mobile-only');
        await page.goto('/calendar');
        const row = page.locator('.cal-week-row').first();
        await expect(row).toBeVisible();
        const flexDir = await row.evaluate((el) => getComputedStyle(el).flexDirection);
        expect(flexDir).toBe('column');
    });

    test('mobile: page does not overflow horizontally', async ({ page, isMobile }) => {
        test.skip(!isMobile, 'mobile-only');
        await page.goto('/calendar');
        // Wait for calendar to render
        await expect(page.locator('.cal-week-row').first()).toBeVisible();
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
        }));
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // +1 for sub-pixel rounding
    });

    test('mobile: 2-digit date is fully visible in the day header', async ({ page, isMobile }) => {
        test.skip(!isMobile, 'mobile-only');
        await page.goto('/calendar');
        const dateNum = page.locator('.cal-week-date-num').first();
        await expect(dateNum).toBeVisible();
        const { scrollWidth, clientWidth } = await dateNum.evaluate((el) => ({
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
        }));
        // Full number visible = no horizontal clipping
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    });
});
