// Shared helpers for Playwright E2E tests.

function isoDate(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// Reset DB + create a fresh logged-in test user. Called from beforeEach.
async function resetAndLogin(page) {
    await page.request.post('/test/reset');
    const res = await page.request.post('/test/login');
    if (!res.ok()) throw new Error(`test/login failed: ${res.status()}`);
}

async function createRecipe(page, title = 'Pasta Bolognese') {
    const res = await page.request.post('/api/recipes', {
        data: {
            title,
            ingredients: ['400g pasta', '500g beef'],
            instructions: ['Cook pasta.', 'Brown mince.'],
            servings: '4',
        },
    });
    if (!res.ok()) throw new Error(`create recipe failed: ${res.status()}`);
    const body = await res.json();
    return body.id;
}

async function addCalendarEntry(page, { recipeId, date, meal = 'dinner', servings = 2 }) {
    const res = await page.request.post('/api/calendar/entries', {
        data: {
            entry_date: date,
            meal_type: meal,
            recipe_id: recipeId,
            servings,
        },
    });
    if (!res.ok()) throw new Error(`add entry failed: ${res.status()}`);
    return (await res.json()).id;
}

module.exports = { isoDate, resetAndLogin, createRecipe, addCalendarEntry };
