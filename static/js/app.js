// ═══════════════════════════════════
// Meal Planner – Client-Side App
// ═══════════════════════════════════

const API = "";

// ─── Auth: intercept 401 responses globally ───
const _originalFetch = window.fetch;
window.fetch = async function (...args) {
    const res = await _originalFetch.apply(this, args);
    if (res.status === 401) {
        window.location = "/login";
        return res;
    }
    return res;
};

// ─── State ───
let calendarMonth = new Date();  // currently displayed month
let calendarViewMode = "week";   // "week" or "month"
let calendarWeekStart = null;    // set after settings load
let chatHistory = [];
let weekStartDay = 1;            // 0=Sun, 1=Mon, 6=Sat (loaded from settings)

// ─── DOM Helpers ───
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const show = (el) => el.classList.remove("hidden");
const hide = (el) => el.classList.add("hidden");

// ═══════════════════════════════════
// Navigation (URL-based routing)
// ═══════════════════════════════════

const PATH_TO_VIEW = {
    "/": "meal-plans",
    "/calendar": "meal-plans",
    "/recipes": "recipes",
    "/favourites": "favourites",
    "/shopping": "shopping",
    "/chat": "chat",
    "/settings": "settings",
};

const VIEW_TO_PATH = {
    "meal-plans": "/calendar",
    "recipes": "/recipes",
    "favourites": "/favourites",
    "shopping": "/shopping",
    "chat": "/chat",
    "settings": "/settings",
};

function navigateToView(view, pushState = true) {
    $$(".nav-link").forEach((l) => l.classList.remove("active"));
    const activeLink = document.querySelector(`.nav-link[data-view="${view}"]`);
    if (activeLink) activeLink.classList.add("active");
    $$(".view").forEach((v) => v.classList.remove("active"));
    $(`#view-${view}`).classList.add("active");

    if (pushState) {
        const path = VIEW_TO_PATH[view] || "/calendar";
        history.pushState({ view }, "", path);
    }

    // Load data for the view
    if (view === "meal-plans") loadCalendar();
    if (view === "recipes") loadRecipes();
    if (view === "favourites") loadFavourites();
    if (view === "shopping") {
        const weekParam = new URLSearchParams(location.search).get("week");
        if (weekParam) {
            const target = new Date(weekParam + "T00:00:00");
            const { start } = getWeekRange(0);
            const current = new Date(start + "T00:00:00");
            shoppingWeekOffset = Math.round((target - current) / (7 * 86400000));
        }
        loadShoppingView();
    }
}

$$(".nav-link").forEach((link) => {
    link.addEventListener("click", (e) => {
        e.preventDefault();
        navigateToView(link.dataset.view);
    });
});

// Handle browser back/forward
window.addEventListener("popstate", (e) => {
    const view = (e.state && e.state.view) || PATH_TO_VIEW[location.pathname] || "meal-plans";
    navigateToView(view, false);
});

// ─── Settings ───
async function loadSettings() {
    try {
        const res = await fetch(`${API}/api/settings`);
        const data = await res.json();
        if (data.week_start_day !== undefined) {
            weekStartDay = parseInt(data.week_start_day);
        }
        if (data.language) {
            setLanguage(data.language);
        }
    } catch (e) { /* use defaults */ }
}

function initSettingsUI() {
    const select = $("#setting-week-start");
    if (!select) return;
    select.value = String(weekStartDay);
    select.addEventListener("change", async () => {
        weekStartDay = parseInt(select.value);
        await fetch(`${API}/api/settings`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ week_start_day: weekStartDay }),
        });
        calendarWeekStart = getWeekStart(new Date());
    });

    const langSelect = $("#setting-language");
    if (langSelect) {
        langSelect.value = getLanguage();
        langSelect.addEventListener("change", async () => {
            setLanguage(langSelect.value);
            await fetch(`${API}/api/settings`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ language: langSelect.value }),
            });
            translatePage();
            const view = PATH_TO_VIEW[location.pathname] || "meal-plans";
            navigateToView(view, false);
        });
    }
}

// Resolve initial view from URL on page load
(async function initRouting() {
    // Load user info for sidebar
    try {
        const meRes = await fetch(`${API}/api/me`);
        if (meRes.ok) {
            const user = await meRes.json();
            const avatar = document.getElementById("sidebar-avatar");
            const username = document.getElementById("sidebar-username");
            if (user.picture) { avatar.src = user.picture; avatar.style.display = ""; }
            if (user.name) username.textContent = user.name;
        }
    } catch (_) { /* will redirect on 401 via global fetch */ }

    // Logout button
    document.getElementById("btn-logout").addEventListener("click", async () => {
        await fetch("/auth/logout", { method: "POST" });
        window.location = "/login";
    });

    // Load settings before first render so calendar uses correct week start
    await loadSettings();
    calendarWeekStart = getWeekStart(new Date());
    translatePage();
    initSettingsUI();

    const view = PATH_TO_VIEW[location.pathname] || "meal-plans";
    navigateToView(view, false);
    // Replace current history entry so back button works correctly
    history.replaceState({ view }, "", location.pathname === "/" ? "/calendar" : location.pathname);
})();

// ═══════════════════════════════════
// Recipes
// ═══════════════════════════════════

let selectedCategoryFilters = []; // category names currently filtering
let currentSearchQuery = "";
let recipeViewMode = "grid"; // "grid" or "list"
let maxTimeFilter = null; // null = any, else max minutes
let currentSort = "newest"; // newest | oldest | a-z | z-a | time-asc | time-desc
let selectedRecipeIds = new Set();
let searchCategoriesList = []; // populated from /api/categories

$("#btn-toggle-view").addEventListener("click", () => {
    recipeViewMode = recipeViewMode === "grid" ? "list" : "grid";
    $(".toggle-grid").classList.toggle("hidden", recipeViewMode === "list");
    $(".toggle-list").classList.toggle("hidden", recipeViewMode === "grid");
    selectedRecipeIds.clear();
    updateBulkActionBar();
    loadRecipes();
});

// Time slider filter
$("#time-slider").addEventListener("input", (() => {
    let timer;
    return (e) => {
        const val = parseInt(e.target.value);
        if (val >= 180) {
            $("#time-slider-label").textContent = t("recipes.timeAny");
            maxTimeFilter = null;
        } else if (val === 0) {
            $("#time-slider-label").textContent = t("recipes.timeNone");
            maxTimeFilter = 0;
        } else {
            const h = Math.floor(val / 60);
            const m = val % 60;
            $("#time-slider-label").textContent = h > 0 ? `${h}h${m > 0 ? " " + m + "min" : ""}` : `${m} min`;
            maxTimeFilter = val;
        }
        clearTimeout(timer);
        timer = setTimeout(loadRecipes, 150);
    };
})());

// Debounced search input
$("#recipe-search").addEventListener("input", (() => {
    let timer;
    return (e) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            currentSearchQuery = e.target.value.trim().toLowerCase();
            showSearchCategoryDropdown();
            loadRecipes();
        }, 250);
    };
})());

// ── Search bar category autocomplete ──
const searchInput = $("#recipe-search");
const searchChipsEl = $("#search-category-chips");
const searchDropdown = $("#search-category-dropdown");

function renderSearchCategoryChips() {
    searchChipsEl.innerHTML = selectedCategoryFilters.map((c, i) =>
        `<span class="tag-chip">${escHtml(c)}<button class="tag-chip-remove" data-idx="${i}">&times;</button></span>`
    ).join("");
    searchChipsEl.querySelectorAll(".tag-chip-remove").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            selectedCategoryFilters.splice(parseInt(btn.dataset.idx), 1);
            renderSearchCategoryChips();
            loadRecipes();
        });
    });
    // Update placeholder based on selections
    searchInput.placeholder = selectedCategoryFilters.length > 0
        ? t("recipes.searchCategories")
        : t("recipes.searchPlaceholder");
}

function showSearchCategoryDropdown() {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) { searchDropdown.classList.add("hidden"); return; }
    const suggestions = searchCategoriesList.filter((c) =>
        !selectedCategoryFilters.includes(c) && c.toLowerCase().includes(q)
    );
    if (suggestions.length === 0) { searchDropdown.classList.add("hidden"); return; }
    searchDropdown.innerHTML = suggestions.map((c) =>
        `<div class="tag-dropdown-item" data-value="${escHtml(c)}">${escHtml(c)}</div>`
    ).join("");
    searchDropdown.classList.remove("hidden");
    searchDropdown.querySelectorAll(".tag-dropdown-item").forEach((item) => {
        item.addEventListener("mousedown", (e) => {
            e.preventDefault();
            const cat = item.dataset.value;
            if (!selectedCategoryFilters.includes(cat)) {
                selectedCategoryFilters.push(cat);
            }
            searchInput.value = "";
            currentSearchQuery = "";
            searchDropdown.classList.add("hidden");
            renderSearchCategoryChips();
            loadRecipes();
            searchInput.focus();
        });
    });
}

searchInput.addEventListener("focus", showSearchCategoryDropdown);
searchInput.addEventListener("blur", () => {
    setTimeout(() => searchDropdown.classList.add("hidden"), 150);
});
searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" && !searchInput.value && selectedCategoryFilters.length > 0) {
        selectedCategoryFilters.pop();
        renderSearchCategoryChips();
        loadRecipes();
    }
});

// Click on the container focuses the input
$("#search-tag-picker").addEventListener("click", () => searchInput.focus());

$("#recipe-sort").addEventListener("change", (e) => {
    currentSort = e.target.value;
    loadRecipes();
});

async function loadRecipes() {
    const [recipesRes, catsRes] = await Promise.all([
        fetch(`${API}/api/recipes`),
        fetch(`${API}/api/categories`),
    ]);
    const recipes = await recipesRes.json();
    const categories = await catsRes.json();
    const container = $("#recipes-list");

    // Update category list for search autocomplete
    searchCategoriesList = categories;

    // Filter by category (multi-select)
    let filtered = selectedCategoryFilters.length === 0
        ? recipes
        : recipes.filter((r) => selectedCategoryFilters.every((c) => (r.categories || []).includes(c)));

    // Filter by search query (name or ingredients)
    if (currentSearchQuery) {
        filtered = filtered.filter((r) => {
            const titleMatch = r.title.toLowerCase().includes(currentSearchQuery);
            const ingredientMatch = (r.ingredients || []).some((i) => i.toLowerCase().includes(currentSearchQuery));
            return titleMatch || ingredientMatch;
        });
    }

    // Filter by max cook time
    if (maxTimeFilter !== null) {
        filtered = filtered.filter((r) => {
            const mins = parseTotalTimeMinutes(r.total_time);
            if (maxTimeFilter === 0) return mins === null;
            return mins !== null && mins <= maxTimeFilter;
        });
    }

    // Sort
    filtered.sort((a, b) => {
        switch (currentSort) {
            case "oldest":  return a.id - b.id;
            case "a-z":     return a.title.localeCompare(b.title);
            case "z-a":     return b.title.localeCompare(a.title);
            case "time-asc": {
                const ma = parseTotalTimeMinutes(a.total_time);
                const mb = parseTotalTimeMinutes(b.total_time);
                if (ma === null && mb === null) return 0;
                if (ma === null) return 1;
                if (mb === null) return -1;
                return ma - mb;
            }
            case "time-desc": {
                const ma = parseTotalTimeMinutes(a.total_time);
                const mb = parseTotalTimeMinutes(b.total_time);
                if (ma === null && mb === null) return 0;
                if (ma === null) return 1;
                if (mb === null) return -1;
                return mb - ma;
            }
            default:        return b.id - a.id; // newest
        }
    });

    if (filtered.length === 0) {
        const msg = recipes.length === 0
            ? t("recipes.emptyNone")
            : currentSearchQuery
                ? t("recipes.emptySearch")
                : selectedCategoryFilters.length > 0
                    ? t("recipes.emptyCategory")
                    : t("recipes.emptyDefault");
        container.innerHTML = `<div class="empty-state"><span class="emoji">📖</span>${msg}</div>`;
        return;
    }

    const isList = recipeViewMode === "list";
    container.className = isList ? "recipes-list" : "recipes-grid";

    container.innerHTML = filtered
        .map(
            (r) => isList ? `
        <div class="recipe-row${selectedRecipeIds.has(r.id) ? " selected" : ""}" data-id="${r.id}">
            <input type="checkbox" class="recipe-select-cb" ${selectedRecipeIds.has(r.id) ? "checked" : ""}>
            ${r.image_url
                ? `<img class="recipe-row-img" src="${r.image_url}" alt="">`
                : `<div class="recipe-row-img placeholder">🍳</div>`}
            <div class="recipe-row-body">
                <h3>${escHtml(r.title)}</h3>
                <span class="meta">${r.servings || ""}${(r.categories || []).length ? (r.servings ? " · " : "") + r.categories.map(c => escHtml(c)).join(", ") : ""}</span>
            </div>
            ${r.total_time ? `<span class="recipe-row-time">⏱ ${escHtml(r.total_time)}</span>` : ""}
            <button class="btn-favourite${r.is_favourite ? " is-favourite" : ""}" data-id="${r.id}" title="${t("favourites.toggle")}">${r.is_favourite ? "❤️" : "🤍"}</button>
        </div>` : `
        <div class="recipe-card" data-id="${r.id}">
            <button class="btn-favourite${r.is_favourite ? " is-favourite" : ""}" data-id="${r.id}" title="${t("favourites.toggle")}">${r.is_favourite ? "❤️" : "🤍"}</button>
            ${
                r.image_url
                    ? `<img class="recipe-card-img" src="${r.image_url}" alt="${r.title}">`
                    : `<div class="recipe-card-img placeholder">🍳</div>`
            }
            <div class="recipe-card-body">
                <h3>${escHtml(r.title)}</h3>
                <span class="meta">${r.total_time || ""} ${r.servings ? "· " + r.servings : ""}</span>
                ${(r.categories || []).length > 0
                    ? `<div class="recipe-card-cats">${r.categories.map((c) => `<span class="cat-pill">${escHtml(c)}</span>`).join("")}</div>`
                    : ""}
            </div>
        </div>`
        )
        .join("");

    container.querySelectorAll(".recipe-card, .recipe-row").forEach((card) => {
        const cb = card.querySelector(".recipe-select-cb");
        if (cb) {
            cb.addEventListener("click", (e) => {
                e.stopPropagation();
                const id = parseInt(card.dataset.id);
                if (cb.checked) {
                    selectedRecipeIds.add(id);
                    card.classList.add("selected");
                } else {
                    selectedRecipeIds.delete(id);
                    card.classList.remove("selected");
                }
                updateBulkActionBar();
            });
        }
        const favBtn = card.querySelector(".btn-favourite");
        if (favBtn) {
            favBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                toggleFavourite(parseInt(favBtn.dataset.id), favBtn);
            });
        }
        card.addEventListener("click", (e) => {
            if (e.target.classList.contains("recipe-select-cb")) return;
            if (e.target.closest(".btn-favourite")) return;
            openRecipeModal(card.dataset.id);
        });
    });
}

async function toggleFavourite(recipeId, btn) {
    const res = await fetch(`${API}/api/recipes/${recipeId}/favourite`, { method: "POST" });
    const data = await res.json();
    if (data.is_favourite) {
        btn.classList.add("is-favourite");
        btn.textContent = "❤️";
    } else {
        btn.classList.remove("is-favourite");
        btn.textContent = "🤍";
    }
}

async function loadFavourites() {
    const res = await fetch(`${API}/api/recipes`);
    const recipes = await res.json();
    const container = $("#favourites-list");
    const favourites = recipes.filter((r) => r.is_favourite);

    if (favourites.length === 0) {
        container.innerHTML = `<div class="empty-state"><span class="emoji">❤️</span>${t("favourites.empty")}</div>`;
        return;
    }

    container.className = "recipes-grid";
    container.innerHTML = favourites.map((r) => `
        <div class="recipe-card" data-id="${r.id}">
            <button class="btn-favourite is-favourite" data-id="${r.id}" title="${t("favourites.toggle")}">❤️</button>
            ${r.image_url
                ? `<img class="recipe-card-img" src="${r.image_url}" alt="${escHtml(r.title)}">`
                : `<div class="recipe-card-img placeholder">🍳</div>`}
            <div class="recipe-card-body">
                <h3>${escHtml(r.title)}</h3>
                <span class="meta">${r.total_time || ""} ${r.servings ? "· " + r.servings : ""}</span>
                ${(r.categories || []).length > 0
                    ? `<div class="recipe-card-cats">${r.categories.map((c) => `<span class="cat-pill">${escHtml(c)}</span>`).join("")}</div>`
                    : ""}
            </div>
        </div>`).join("");

    container.querySelectorAll(".recipe-card").forEach((card) => {
        const favBtn = card.querySelector(".btn-favourite");
        if (favBtn) {
            favBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                toggleFavourite(parseInt(favBtn.dataset.id), favBtn).then(() => loadFavourites());
            });
        }
        card.addEventListener("click", (e) => {
            if (e.target.closest(".btn-favourite")) return;
            openRecipeModal(card.dataset.id);
        });
    });
}

// ─── Bulk Actions ───
function updateBulkActionBar() {
    const count = selectedRecipeIds.size;
    $("#bulk-selected-count").textContent = t("bulk.selected", { count });
    $("#btn-bulk-delete").disabled = count === 0;
    $("#bulk-action-bar").classList.toggle("hidden", count === 0);
}

$("#btn-cancel-select").addEventListener("click", () => {
    selectedRecipeIds.clear();
    updateBulkActionBar();
    loadRecipes();
});

$("#btn-select-all").addEventListener("click", () => {
    const rows = $$("#recipes-list .recipe-row");
    const allSelected = rows.length > 0 && selectedRecipeIds.size === rows.length;
    if (allSelected) {
        selectedRecipeIds.clear();
        rows.forEach((row) => {
            row.classList.remove("selected");
            row.querySelector(".recipe-select-cb").checked = false;
        });
    } else {
        rows.forEach((row) => {
            const id = parseInt(row.dataset.id);
            selectedRecipeIds.add(id);
            row.classList.add("selected");
            row.querySelector(".recipe-select-cb").checked = true;
        });
    }
    updateBulkActionBar();
    $("#btn-select-all").textContent = allSelected ? t("bulk.selectAll") : t("bulk.deselectAll");
});

$("#btn-bulk-delete").addEventListener("click", async () => {
    const count = selectedRecipeIds.size;
    if (count === 0) return;
    if (!confirm(t("bulk.confirmDelete", { count }))) return;
    await fetch(`${API}/api/recipes/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selectedRecipeIds] }),
    });
    selectedRecipeIds.clear();
    updateBulkActionBar();
    loadRecipes();
});

async function openRecipeModal(id, entryId, plannedServings) {
    const res = await fetch(`${API}/api/recipes/${id}`);
    const r = await res.json();
    const body = $("#modal-recipe-body");

    const recipeServings = parseServings(r.servings);
    const displayServings = plannedServings || recipeServings || null;
    const ratio = (recipeServings && plannedServings && recipeServings !== plannedServings)
        ? plannedServings / recipeServings : null;
    const ingredients = ratio
        ? r.ingredients.map((i) => scaleIngredient(i, ratio))
        : r.ingredients;
    const servingsLabel = displayServings
        ? (ratio ? `· ${t("recipes.servingsScaled", { count: displayServings })}` : (r.servings ? "· " + r.servings : ""))
        : "";

    const actionBtn = entryId
        ? `<button class="btn btn-danger btn-small" id="btn-remove-entry-modal" data-entry-id="${entryId}">${t("recipes.removeFromCalendar")}</button>`
        : `<button class="btn btn-primary btn-small" id="btn-add-to-calendar-modal">📅 ${t("calendar.addToCalendar")}</button>
           <button class="btn btn-secondary btn-small" id="btn-edit-recipe-modal">✏️ ${t("recipes.edit")}</button>
           <button class="btn btn-danger btn-small" onclick="deleteRecipe(${r.id})">${t("recipes.deleteRecipe")}</button>`;

    const hasMethods = r.instructions && r.instructions.length > 0;
    const cookBtn = hasMethods
        ? `<button class="btn btn-start-cooking btn-small" id="btn-start-cooking">🍳 ${t("recipes.startCooking")}</button>`
        : '';

    body.innerHTML = `
        ${r.image_url ? `<img class="modal-recipe-image" src="${r.image_url}" alt="">` : ""}
        <h2 class="modal-recipe-title">${escHtml(r.title)}</h2>
        <p class="modal-recipe-meta">${r.total_time || ""} ${servingsLabel} ${r.source_url ? `· <a href="${r.source_url}" target="_blank">${t("recipes.source")}</a>` : ""}</p>
        <div class="modal-actions">
            ${cookBtn}
            ${actionBtn}
        </div>
        ${(r.categories || []).length > 0
            ? `<div class="modal-recipe-cats">${r.categories.map((c) => `<span class="cat-pill">${escHtml(c)}</span>`).join("")}</div>`
            : ""}
        <h4>${t("recipes.ingredients")}</h4>
        <ul class="ingredient-list">${ingredients.map((i) => `<li>${escHtml(i)}</li>`).join("")}</ul>
        <h4>${t("recipes.method")}</h4>
        <ol class="instruction-list">${r.instructions.map((s) => `<li>${escHtml(s)}</li>`).join("")}</ol>`;

    const removeBtn = body.querySelector("#btn-remove-entry-modal");
    if (removeBtn) {
        removeBtn.addEventListener("click", async () => {
            await fetch(`${API}/api/calendar/entries/${entryId}`, { method: "DELETE" });
            hide($("#recipe-modal"));
            loadCalendar();
        });
    }

    const cookingBtn = body.querySelector("#btn-start-cooking");
    if (cookingBtn) {
        cookingBtn.addEventListener("click", () => {
            hide($("#recipe-modal"));
            showPrecookScreen(r);
        });
    }

    const addToCalBtn = body.querySelector("#btn-add-to-calendar-modal");
    if (addToCalBtn) {
        addToCalBtn.addEventListener("click", () => {
            hide($("#recipe-modal"));
            openAssignToCalendarModal(r.id, r.title, parseServings(r.servings) || 2);
        });
    }

    const editBtn = body.querySelector("#btn-edit-recipe-modal");
    if (editBtn) {
        editBtn.addEventListener("click", () => {
            showEditRecipeForm(r);
        });
    }

    show($("#recipe-modal"));
}

async function showEditRecipeForm(recipe) {
    const body = $("#modal-recipe-body");
    let editCategories = [...(recipe.categories || [])];

    body.innerHTML = `
        <h2 style="margin-top:0">${t("recipes.editRecipe")}</h2>
        <input type="text" id="edit-recipe-title" class="input" value="${escHtml(recipe.title)}" placeholder="${t("recipes.placeholderTitle")}">
        <div class="tag-picker" id="edit-category-picker">
            <div class="tag-picker-tags" id="edit-category-tags"></div>
            <input type="text" id="edit-category-input" class="tag-picker-input" placeholder="${t("recipes.placeholderCategory")}" autocomplete="off">
            <div class="tag-picker-dropdown hidden" id="edit-category-dropdown"></div>
        </div>
        <input type="text" id="edit-recipe-servings" class="input" value="${escHtml(recipe.servings || "")}" placeholder="${t("recipes.placeholderServings")}">
        <input type="text" id="edit-recipe-time" class="input" value="${escHtml(recipe.total_time || "")}" placeholder="${t("recipes.placeholderTime")}">
        <textarea id="edit-recipe-ingredients" class="input textarea" rows="8" placeholder="${t("recipes.placeholderIngredients")}">${escHtml(recipe.ingredients.join("\n"))}</textarea>
        <textarea id="edit-recipe-instructions" class="input textarea" rows="8" placeholder="${t("recipes.placeholderInstructions")}">${escHtml(recipe.instructions.join("\n"))}</textarea>
        <div class="form-actions" style="margin-top:12px">
            <button class="btn btn-primary" id="btn-save-edit-recipe">${t("recipes.saveChanges")}</button>
            <button class="btn btn-ghost" id="btn-cancel-edit-recipe">${t("common.cancel")}</button>
        </div>`;

    function renderEditTags() {
        const container = body.querySelector("#edit-category-tags");
        container.innerHTML = editCategories.map((c, i) =>
            `<span class="tag-chip">${escHtml(c)}<button class="tag-chip-remove" data-idx="${i}">&times;</button></span>`
        ).join("");
        container.querySelectorAll(".tag-chip-remove").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                editCategories.splice(parseInt(btn.dataset.idx), 1);
                renderEditTags();
            });
        });
    }
    renderEditTags();

    const editCatInput = body.querySelector("#edit-category-input");
    const editCatDropdown = body.querySelector("#edit-category-dropdown");

    function showEditCategoryDropdown() {
        const q = editCatInput.value.trim().toLowerCase();
        const suggestions = allCategoriesList.filter((c) =>
            !editCategories.includes(c) && c.toLowerCase().includes(q)
        );
        if (suggestions.length === 0 && !q) {
            editCatDropdown.classList.add("hidden");
            return;
        }
        let items = suggestions.map((c) =>
            `<div class="tag-dropdown-item" data-value="${escHtml(c)}">${escHtml(c)}</div>`
        ).join("");
        if (q && !allCategoriesList.some((c) => c.toLowerCase() === q)) {
            items += `<div class="tag-dropdown-item tag-dropdown-new" data-value="${escHtml(editCatInput.value.trim())}">${t("recipes.createCategory", { name: escHtml(editCatInput.value.trim()) })}</div>`;
        }
        if (!items) { editCatDropdown.classList.add("hidden"); return; }
        editCatDropdown.innerHTML = items;
        editCatDropdown.classList.remove("hidden");
        editCatDropdown.querySelectorAll(".tag-dropdown-item").forEach((item) => {
            item.addEventListener("mousedown", (e) => {
                e.preventDefault();
                addEditCategory(item.dataset.value);
            });
        });
    }

    function addEditCategory(name) {
        const trimmed = name.trim();
        if (trimmed && !editCategories.includes(trimmed)) {
            editCategories.push(trimmed);
            if (!allCategoriesList.includes(trimmed)) allCategoriesList.push(trimmed);
        }
        editCatInput.value = "";
        editCatDropdown.classList.add("hidden");
        renderEditTags();
        editCatInput.focus();
    }

    editCatInput.addEventListener("input", showEditCategoryDropdown);
    editCatInput.addEventListener("focus", showEditCategoryDropdown);
    editCatInput.addEventListener("blur", () => {
        setTimeout(() => editCatDropdown.classList.add("hidden"), 150);
    });
    editCatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            const val = editCatInput.value.trim().replace(/,$/, "");
            if (val) addEditCategory(val);
        }
        if (e.key === "Backspace" && !editCatInput.value && editCategories.length > 0) {
            editCategories.pop();
            renderEditTags();
        }
    });

    // Fetch categories for autocomplete if not already loaded
    if (allCategoriesList.length === 0) {
        fetch(`${API}/api/categories`).then(r => r.json()).then(cats => { allCategoriesList = cats; }).catch(() => {});
    }

    body.querySelector("#btn-cancel-edit-recipe").addEventListener("click", () => {
        openRecipeModal(recipe.id);
    });

    body.querySelector("#btn-save-edit-recipe").addEventListener("click", async () => {
        const title = body.querySelector("#edit-recipe-title").value.trim();
        const ingredients = body.querySelector("#edit-recipe-ingredients").value.split("\n").filter((l) => l.trim());
        const instructions = body.querySelector("#edit-recipe-instructions").value.split("\n").filter((l) => l.trim());
        const servings = body.querySelector("#edit-recipe-servings").value.trim() || null;
        const totalTime = body.querySelector("#edit-recipe-time").value.trim() || null;

        if (!title || ingredients.length === 0) {
            alert(t("recipes.validationError"));
            return;
        }

        const saveBtn = body.querySelector("#btn-save-edit-recipe");
        saveBtn.disabled = true;
        saveBtn.textContent = t("recipes.saving");

        const updateRes = await fetch(`${API}/api/recipes/${recipe.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title,
                ingredients,
                instructions,
                servings,
                total_time: totalTime,
                categories: editCategories,
                source_url: recipe.source_url,
                image_url: recipe.image_url,
            }),
        });
        if (!updateRes.ok) {
            const err = await updateRes.json().catch(() => ({}));
            alert(err.error || t("recipes.saveError"));
            saveBtn.disabled = false;
            saveBtn.textContent = t("recipes.save");
            return;
        }

        openRecipeModal(recipe.id);
        loadRecipes();
    });
}

$("#btn-close-modal").addEventListener("click", () => hide($("#recipe-modal")));
$(".modal-overlay").addEventListener("click", () => hide($("#recipe-modal")));

async function deleteRecipe(id) {
    if (!confirm(t("recipes.confirmDelete"))) return;
    await fetch(`${API}/api/recipes/${id}`, { method: "DELETE" });
    hide($("#recipe-modal"));
    loadRecipes();
}

// New recipe form
let selectedCategories = [];
let allCategoriesList = [];

// ── Add Recipe dropdown toggle ──
const addRecipeMenu = $("#add-recipe-menu");
$("#btn-add-recipe-toggle").addEventListener("click", (e) => {
    e.stopPropagation();
    addRecipeMenu.classList.toggle("hidden");
});
// Close dropdown when clicking outside
document.addEventListener("click", (e) => {
    if (!e.target.closest("#add-recipe-dropdown")) {
        addRecipeMenu.classList.add("hidden");
    }
});
// Close dropdown when any option is clicked
addRecipeMenu.querySelectorAll(".add-recipe-option").forEach((opt) => {
    opt.addEventListener("click", () => {
        addRecipeMenu.classList.add("hidden");
    });
});

$("#btn-new-recipe").addEventListener("click", async () => {
    hide($("#import-section"));
    hide($("#scrape-result"));
    show($("#new-recipe-form"));
    // Fetch existing categories for autocomplete
    try {
        const res = await fetch(`${API}/api/categories`);
        allCategoriesList = await res.json();
    } catch (e) { allCategoriesList = []; }
    renderCategoryTags();
});
$("#btn-cancel-recipe").addEventListener("click", () => {
    hide($("#new-recipe-form"));
    selectedCategories = [];
    renderCategoryTags();
});

// ── Category tag picker ──
const catInput = $("#recipe-categories-input");
const catDropdown = $("#category-dropdown");
const catTagsEl = $("#category-tags");

function renderCategoryTags() {
    catTagsEl.innerHTML = selectedCategories.map((c, i) =>
        `<span class="tag-chip">${escHtml(c)}<button class="tag-chip-remove" data-idx="${i}">&times;</button></span>`
    ).join("");
    catTagsEl.querySelectorAll(".tag-chip-remove").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            selectedCategories.splice(parseInt(btn.dataset.idx), 1);
            renderCategoryTags();
        });
    });
}

function showCategoryDropdown() {
    const q = catInput.value.trim().toLowerCase();
    const suggestions = allCategoriesList.filter((c) =>
        !selectedCategories.includes(c) && c.toLowerCase().includes(q)
    );
    if (suggestions.length === 0 && !q) {
        catDropdown.classList.add("hidden");
        return;
    }
    let items = suggestions.map((c) =>
        `<div class="tag-dropdown-item" data-value="${escHtml(c)}">${escHtml(c)}</div>`
    ).join("");
    if (q && !allCategoriesList.some((c) => c.toLowerCase() === q)) {
        items += `<div class="tag-dropdown-item tag-dropdown-new" data-value="${escHtml(catInput.value.trim())}">${t("recipes.createCategory", { name: escHtml(catInput.value.trim()) })}</div>`;
    }
    if (!items) { catDropdown.classList.add("hidden"); return; }
    catDropdown.innerHTML = items;
    catDropdown.classList.remove("hidden");
    catDropdown.querySelectorAll(".tag-dropdown-item").forEach((item) => {
        item.addEventListener("mousedown", (e) => {
            e.preventDefault();
            addCategory(item.dataset.value);
        });
    });
}

function addCategory(name) {
    const trimmed = name.trim();
    if (trimmed && !selectedCategories.includes(trimmed)) {
        selectedCategories.push(trimmed);
        if (!allCategoriesList.includes(trimmed)) allCategoriesList.push(trimmed);
    }
    catInput.value = "";
    catDropdown.classList.add("hidden");
    renderCategoryTags();
    catInput.focus();
}

catInput.addEventListener("input", showCategoryDropdown);
catInput.addEventListener("focus", showCategoryDropdown);
catInput.addEventListener("blur", () => {
    setTimeout(() => catDropdown.classList.add("hidden"), 150);
});
catInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        const val = catInput.value.trim().replace(/,$/, "");
        if (val) addCategory(val);
    }
    if (e.key === "Backspace" && !catInput.value && selectedCategories.length > 0) {
        selectedCategories.pop();
        renderCategoryTags();
    }
});

// Import from file (.paprikarecipes, .xlsx)
$("#btn-import-file").addEventListener("click", () => {
    $("#paprika-file-input").click();
});
$("#paprika-file-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");
    const endpoint = isExcel ? `${API}/api/import-excel` : `${API}/api/import-paprika`;
    try {
        const res = await fetch(endpoint, { method: "POST", body: formData });
        const data = await res.json();
        if (data.error) {
            alert(t("recipes.importError", { error: data.error }));
        } else {
            alert(t("recipes.importedSuccess", { count: data.count }));
            loadRecipes();
        }
    } catch (err) {
        alert(t("recipes.importFailed"));
    }
    e.target.value = "";
});

// Import from URL toggle
$("#btn-import-url").addEventListener("click", () => {
    hide($("#new-recipe-form"));
    const section = $("#import-section");
    if (section.classList.contains("hidden")) {
        show(section);
        $("#import-url").focus();
    } else {
        hide(section);
        hide($("#scrape-result"));
        hide($("#scrape-error"));
    }
});

$("#btn-save-recipe").addEventListener("click", async () => {
    const title = $("#recipe-title").value.trim();
    const ingredients = $("#recipe-ingredients").value.split("\n").filter((l) => l.trim());
    const instructions = $("#recipe-instructions").value.split("\n").filter((l) => l.trim());
    const servings = $("#recipe-servings").value.trim() || null;
    const totalTime = $("#recipe-time").value.trim() || null;
    const categories = [...selectedCategories];

    if (!title || ingredients.length === 0) {
        alert(t("recipes.validationError"));
        return;
    }

    const saveRes = await fetch(`${API}/api/recipes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, ingredients, instructions, servings, total_time: totalTime, categories }),
    });
    if (!saveRes.ok) {
        const err = await saveRes.json().catch(() => ({}));
        alert(err.error || t("recipes.saveError"));
        return;
    }

    hide($("#new-recipe-form"));
    $("#recipe-title").value = "";
    selectedCategories = [];
    renderCategoryTags();
    catInput.value = "";
    $("#recipe-ingredients").value = "";
    $("#recipe-instructions").value = "";
    $("#recipe-servings").value = "";
    $("#recipe-time").value = "";
    loadRecipes();
});

// ═══════════════════════════════════
// URL Import / Scraper
// ═══════════════════════════════════

let scrapedData = null;

$("#btn-scrape").addEventListener("click", async () => {
    const url = $("#import-url").value.trim();
    if (!url) return;

    hide($("#scrape-result"));
    hide($("#scrape-error"));
    show($("#scrape-loading"));

    try {
        const res = await fetch(`${API}/api/scrape`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
        });
        const data = await res.json();
        hide($("#scrape-loading"));

        if (data.error) {
            $("#scrape-error").textContent = data.error;
            show($("#scrape-error"));
            return;
        }

        scrapedData = data;
        $("#scraped-title").textContent = data.title;
        $("#scraped-time").textContent = data.total_time || "";
        $("#scraped-servings").textContent = data.servings || "";

        if (data.image_url) {
            $("#scraped-image").src = data.image_url;
            show($("#scraped-image"));
        } else {
            hide($("#scraped-image"));
        }

        $("#scraped-ingredients").innerHTML = data.ingredients
            .map((i) => `<li>${escHtml(i)}</li>`)
            .join("");
        $("#scraped-instructions").innerHTML = data.instructions
            .map((s) => `<li>${escHtml(s)}</li>`)
            .join("");

        show($("#scrape-result"));
    } catch (err) {
        hide($("#scrape-loading"));
        $("#scrape-error").textContent = t("recipes.fetchError");
        show($("#scrape-error"));
    }
});

// Allow pressing Enter in the URL field
$("#import-url").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        $("#btn-scrape").click();
    }
});

$("#btn-save-scraped").addEventListener("click", async () => {
    if (!scrapedData) return;
    const saveRes = await fetch(`${API}/api/recipes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scrapedData),
    });
    if (!saveRes.ok) {
        const err = await saveRes.json().catch(() => ({}));
        alert(err.error || t("recipes.saveError"));
        return;
    }
    alert(t("recipes.recipeSaved"));
    hide($("#scrape-result"));
    hide($("#import-section"));
    $("#import-url").value = "";
    scrapedData = null;
    loadRecipes();
});

// ═══════════════════════════════════
// Calendar
// ═══════════════════════════════════

const MEALS = ["lunch", "dinner"];

// Get Monday of a given date's week
function getWeekStart(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = (day - weekStartDay + 7) % 7;
    date.setDate(date.getDate() - diff);
    date.setHours(0, 0, 0, 0);
    return date;
}

// Get 7 dates for a week starting from the configured start day
function getWeekGridDates(start) {
    const dates = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        dates.push(d);
    }
    return dates;
}

// Helpers to get dates for the visible calendar grid
function getCalendarGridDates(year, month) {
    // month is 0-indexed
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    // Start from configured week start day
    let startDay = (first.getDay() - weekStartDay + 7) % 7;
    const startDate = new Date(year, month, 1 - startDay);
    const dates = [];
    // Always show 6 rows (42 cells) to keep grid consistent
    for (let i = 0; i < 42; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        dates.push(d);
    }
    return dates;
}

function isoDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

async function loadCalendar() {
    if (calendarViewMode === "week") {
        await loadCalendarWeek();
    } else {
        await loadCalendarMonth();
    }
}

async function loadCalendarWeek() {
    const weekDates = getWeekGridDates(calendarWeekStart);

    // Update label
    const startLabel = weekDates[0].toLocaleDateString(getLocale(), { day: "numeric", month: "short" });
    const endLabel = weekDates[6].toLocaleDateString(getLocale(), { day: "numeric", month: "short", year: "numeric" });
    $("#cal-month-label").textContent = `${startLabel} – ${endLabel}`;

    // Fetch entries — may span two months
    const months = new Set(weekDates.map(d => `${d.getFullYear()}-${d.getMonth() + 1}`));
    let entries = [];
    for (const key of months) {
        const [y, m] = key.split("-");
        const res = await fetch(`${API}/api/calendar?year=${y}&month=${m}`);
        entries = entries.concat(await res.json());
    }

    const entryMap = {};
    entries.forEach((e) => {
        if (!entryMap[e.entry_date]) entryMap[e.entry_date] = [];
        entryMap[e.entry_date].push(e);
    });

    const today = new Date();
    today.setHours(0,0,0,0);
    const todayISO = isoDate(today);

    const grid = $("#calendar-grid");
    grid.className = "calendar-week-grid";

    let html = `<div class="cal-week-grid-inner">`;
    weekDates.forEach((dateObj) => {
        const iso = isoDate(dateObj);
        const isToday = iso === todayISO;
        const dayEntries = entryMap[iso] || [];
        const dayName = dateObj.toLocaleDateString(getLocale(), { weekday: "short" });
        const dayNum = dateObj.getDate();
        const monthName = dateObj.toLocaleDateString(getLocale(), { month: "short" });

        html += `<div class="cal-week-row${isToday ? " cal-week-row-today" : ""}" data-date="${iso}">`;
        html += `<div class="cal-week-day-label">`;
        html += `<span class="cal-week-day-name">${dayName}</span>`;
        html += `<span class="cal-week-date-num">${dayNum}</span>`;
        html += `<span class="cal-week-month-name">${monthName}</span>`;
        html += `</div>`;
        html += `<div class="cal-week-meals">`;

        MEALS.forEach((meal) => {
            const mealEntries = dayEntries.filter((e) => e.meal_type === meal);
            html += `<div class="cal-meal-slot" data-day="${iso}" data-meal="${meal}">`;
            html += `<span class="cal-meal-label">${tMeal(meal)}</span>`;
            mealEntries.forEach((e) => {
                if (e.note) {
                    html += `<div class="cal-entry cal-entry-note" draggable="true"
                                  data-entry-id="${e.id}" data-entry-type="note"
                                  data-note="${escHtml(e.note)}">
                        <span class="cal-entry-text">📝 ${escHtml(e.note)}</span>
                    </div>`;
                } else {
                    html += `<div class="cal-entry" draggable="true"
                                  data-entry-id="${e.id}" data-entry-type="recipe"
                                  data-recipe-id="${e.recipe_id}" data-servings="${e.servings}">
                        <a href="#" class="cal-entry-link" data-recipe-id="${e.recipe_id}" data-entry-id="${e.id}" data-servings="${e.servings}">${escHtml(e.recipe_title)}</a>
                        <span class="cal-entry-srv">${t("calendar.srvBadge", { n: e.servings })}</span>
                    </div>`;
                }
            });
            html += `<button class="cal-add-btn" data-day="${iso}" data-meal="${meal}">+</button>`;
            html += `</div>`;
        });

        html += `</div>`; // .cal-week-meals
        html += `</div>`; // .cal-week-row
    });
    html += `</div>`;
    grid.innerHTML = html;

    bindCalendarEvents(grid);
}

async function loadCalendarMonth() {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth(); // 0-indexed
    const apiMonth = month + 1; // 1-indexed for API

    // Update month label
    const monthName = calendarMonth.toLocaleDateString(getLocale(), { month: "long", year: "numeric" });
    $("#cal-month-label").textContent = monthName;

    // We need entries that may span the visible grid (includes prev/next month days)
    const gridDates = getCalendarGridDates(year, month);
    const startISO = isoDate(gridDates[0]);
    const endISO = isoDate(gridDates[gridDates.length - 1]);

    // Fetch entries for the visible range (may span 2-3 months)
    const res = await fetch(`${API}/api/calendar?year=${year}&month=${apiMonth}`);
    let entries = await res.json();

    // Also fetch bordering months if grid extends
    const startMonth = gridDates[0].getMonth() + 1;
    const startYear = gridDates[0].getFullYear();
    const endMonth = gridDates[gridDates.length-1].getMonth() + 1;
    const endYear = gridDates[gridDates.length-1].getFullYear();

    if (startYear !== year || startMonth !== apiMonth) {
        const res2 = await fetch(`${API}/api/calendar?year=${startYear}&month=${startMonth}`);
        const extra = await res2.json();
        entries = extra.concat(entries);
    }
    if (endYear !== year || endMonth !== apiMonth) {
        const res2 = await fetch(`${API}/api/calendar?year=${endYear}&month=${endMonth}`);
        const extra = await res2.json();
        entries = entries.concat(extra);
    }

    // Build index: date -> entries
    const entryMap = {};
    entries.forEach((e) => {
        if (!entryMap[e.entry_date]) entryMap[e.entry_date] = [];
        entryMap[e.entry_date].push(e);
    });

    const today = new Date();
    today.setHours(0,0,0,0);
    const todayISO = isoDate(today);

    const grid = $("#calendar-grid");
    grid.className = "calendar-month-grid";

    let html = `<div class="cal-weekday-header">`;
    const dayNames = ["day.sun","day.mon","day.tue","day.wed","day.thu","day.fri","day.sat"].map(k => t(k));
    for (let i = 0; i < 7; i++) {
        html += `<div class="cal-wh">${dayNames[(weekStartDay + i) % 7]}</div>`;
    }
    html += `</div><div class="cal-grid-body">`;

    gridDates.forEach((dateObj, idx) => {
        const iso = isoDate(dateObj);
        const isCurrentMonth = dateObj.getMonth() === month;
        const isToday = iso === todayISO;
        const dayEntries = entryMap[iso] || [];

        html += `<div class="cal-cell${isCurrentMonth ? "" : " cal-cell-dim"}${isToday ? " cal-cell-today" : ""}" data-date="${iso}">`;
        html += `<div class="cal-cell-date">${dateObj.getDate()}</div>`;

        MEALS.forEach((meal) => {
            const mealEntries = dayEntries.filter((e) => e.meal_type === meal);
            html += `<div class="cal-meal-slot" data-day="${iso}" data-meal="${meal}">`;
            html += `<span class="cal-meal-label">${tMeal(meal)}</span>`;
            mealEntries.forEach((e) => {
                if (e.note) {
                    html += `<div class="cal-entry cal-entry-note" draggable="true"
                                  data-entry-id="${e.id}" data-entry-type="note"
                                  data-note="${escHtml(e.note)}">
                        <span class="cal-entry-text">📝 ${escHtml(e.note)}</span>
                    </div>`;
                } else {
                    html += `<div class="cal-entry" draggable="true"
                                  data-entry-id="${e.id}" data-entry-type="recipe"
                                  data-recipe-id="${e.recipe_id}" data-servings="${e.servings}">
                        <a href="#" class="cal-entry-link" data-recipe-id="${e.recipe_id}" data-entry-id="${e.id}" data-servings="${e.servings}">${escHtml(e.recipe_title)}</a>
                        <span class="cal-entry-srv">${t("calendar.srvBadge", { n: e.servings })}</span>
                    </div>`;
                }
            });
            html += `<button class="cal-add-btn" data-day="${iso}" data-meal="${meal}">+</button>`;
            html += `</div>`;
        });

        html += `</div>`;
    });
    html += `</div>`;
    grid.innerHTML = html;

    bindCalendarEvents(grid);
}

// ── Entry context menu (hover) ──
function openEntryContextMenu(entry) {
    // Don't open a duplicate
    if (entry.querySelector(".cal-ctx-menu")) return;
    // Close any other open menu
    document.querySelectorAll(".cal-ctx-menu").forEach(m => m.remove());

    const entryId = entry.dataset.entryId;
    const isRecipe = entry.dataset.entryType === "recipe";
    const isNote = entry.dataset.entryType === "note";
    let currentServings = parseInt(entry.dataset.servings) || 2;
    const origServings = currentServings;

    const menu = document.createElement("div");
    menu.className = "cal-ctx-menu";

    let servingsHtml = "";
    if (isRecipe) {
        servingsHtml = `
            <div class="ctx-servings">
                <span class="ctx-label">${t("ctx.servings")}</span>
                <div class="ctx-srv-picker">
                    <button class="btn btn-secondary ctx-srv-dec">&minus;</button>
                    <span class="ctx-srv-val">${currentServings}</span>
                    <button class="btn btn-secondary ctx-srv-inc">+</button>
                </div>
            </div>
            <div class="ctx-divider"></div>`;
    }

    let copyHtml = "";
    if (isRecipe || isNote) {
        copyHtml = `<button class="ctx-action ctx-copy">📋 ${t("ctx.copyTo")}</button>`;
    }

    menu.innerHTML = `
        ${servingsHtml}
        ${copyHtml}
        <button class="ctx-action ctx-remove">🗑 ${t("ctx.remove")}</button>`;

    entry.appendChild(menu);

    // Flip menu upward if it overflows the viewport
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.bottom > window.innerHeight) {
        menu.style.top = "auto";
        menu.style.bottom = "100%";
    }

    // Servings +/- handlers
    if (isRecipe) {
        const valEl = menu.querySelector(".ctx-srv-val");
        menu.querySelector(".ctx-srv-dec").addEventListener("click", (e) => {
            e.stopPropagation(); e.preventDefault();
            if (currentServings > 1) { currentServings--; valEl.textContent = currentServings; }
        });
        menu.querySelector(".ctx-srv-inc").addEventListener("click", (e) => {
            e.stopPropagation(); e.preventDefault();
            currentServings++; valEl.textContent = currentServings;
        });
    }

    // Copy handler (recipes and notes)
    if (isRecipe || isNote) {
        menu.querySelector(".ctx-copy").addEventListener("click", (e) => {
            e.stopPropagation();
            closeMenu();
            openCopyModal(parseInt(entryId));
        });
    }

    // Remove handler
    menu.querySelector(".ctx-remove").addEventListener("click", async (e) => {
        e.stopPropagation();
        closeMenu();
        await fetch(`${API}/api/calendar/entries/${entryId}`, { method: "DELETE" });
        loadCalendar();
    });

    // Close menu helper — saves servings if changed
    let closed = false;
    function closeMenu() {
        if (closed) return;
        closed = true;
        menu.remove();
        if (isRecipe && currentServings !== origServings) {
            fetch(`${API}/api/calendar/entries/${entryId}/servings`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ servings: currentServings }),
            }).then(() => loadCalendar());
        }
    }

    // Close on mouseleave from entry (with delay so moving to menu doesn't close it)
    let leaveTimer = null;
    function startLeaveTimer() {
        leaveTimer = setTimeout(() => closeMenu(), 200);
    }
    function cancelLeaveTimer() {
        if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
    }
    entry.addEventListener("mouseleave", startLeaveTimer);
    entry.addEventListener("mouseenter", cancelLeaveTimer);
    menu.addEventListener("mouseenter", cancelLeaveTimer);
    menu.addEventListener("mouseleave", startLeaveTimer);
}

// ── Edit note modal ──
function openEditNoteModal(entryId, currentNote) {
    const overlay = document.createElement("div");
    overlay.className = "modal";
    overlay.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content card" style="max-width:420px">
            <button class="modal-close edit-note-close">&times;</button>
            <h3 style="margin-bottom:12px">${t("editNote.title")}</h3>
            <textarea class="input edit-note-input" rows="3">${escHtml(currentNote)}</textarea>
            <div class="form-actions" style="margin-top:12px">
                <button class="btn btn-primary edit-note-save">${t("editNote.save")}</button>
                <button class="btn btn-ghost edit-note-cancel">${t("common.cancel")}</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const input = overlay.querySelector(".edit-note-input");
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    function close() { overlay.remove(); }
    overlay.querySelector(".modal-overlay").addEventListener("click", close);
    overlay.querySelector(".edit-note-close").addEventListener("click", close);
    overlay.querySelector(".edit-note-cancel").addEventListener("click", close);

    overlay.querySelector(".edit-note-save").addEventListener("click", async () => {
        const note = input.value.trim();
        if (!note) { alert(t("calendar.pleaseEnterNote")); return; }
        await fetch(`${API}/api/calendar/entries/${entryId}/note`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ note }),
        });
        close();
        loadCalendar();
    });
}

function bindCalendarEvents(grid) {
    // Bind add buttons
    grid.querySelectorAll(".cal-add-btn").forEach((btn) => {
        btn.addEventListener("click", () => openAddMealModal(btn.dataset.day, btn.dataset.meal));
    });

    // Bind entry hover → context menu
    grid.querySelectorAll(".cal-entry").forEach((entry) => {
        entry.addEventListener("mouseenter", () => {
            openEntryContextMenu(entry);
        });
    });

    // Bind recipe links
    grid.querySelectorAll(".cal-entry-link").forEach((link) => {
        link.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const recipeId = link.dataset.recipeId;
            const entryId = link.dataset.entryId;
            const servings = link.dataset.servings ? parseInt(link.dataset.servings) : null;
            if (recipeId) openRecipeModal(recipeId, entryId, servings);
        });
    });

    // Bind note click → edit
    grid.querySelectorAll(".cal-entry-note").forEach((entry) => {
        entry.addEventListener("click", (ev) => {
            ev.stopPropagation();
            openEditNoteModal(parseInt(entry.dataset.entryId), entry.dataset.note || "");
        });
    });

    // ── Drag-and-drop ──
    grid.querySelectorAll(".cal-entry").forEach((item) => {
        item.addEventListener("dragstart", (e) => {
            e.dataTransfer.setData("text/plain", item.dataset.entryId);
            e.dataTransfer.effectAllowed = "copyMove";
            item.classList.add("dragging");
            setTimeout(() => {
                grid.querySelectorAll(".cal-meal-slot").forEach((s) => s.classList.add("drop-target"));
            }, 0);
        });
        item.addEventListener("dragend", () => {
            item.classList.remove("dragging");
            grid.querySelectorAll(".cal-meal-slot").forEach((s) => {
                s.classList.remove("drop-target", "drop-over");
            });
        });
    });

    grid.querySelectorAll(".cal-meal-slot").forEach((slot) => {
        slot.addEventListener("dragover", (e) => {
            e.preventDefault();
            if (e.dataTransfer.types.includes("application/x-chat-recipe")) {
                e.dataTransfer.dropEffect = "copy";
            } else {
                e.dataTransfer.dropEffect = e.altKey ? "copy" : "move";
            }
            slot.classList.add("drop-over");
        });
        slot.addEventListener("dragleave", (e) => {
            if (!slot.contains(e.relatedTarget)) {
                slot.classList.remove("drop-over");
            }
        });
        slot.addEventListener("drop", async (e) => {
            e.preventDefault();
            slot.classList.remove("drop-over");
            const day = slot.dataset.day;
            const meal = slot.dataset.meal;

            // Check if this is a chat recipe drop
            const chatRecipeJson = e.dataTransfer.getData("application/x-chat-recipe");
            if (chatRecipeJson) {
                try {
                    const recipe = JSON.parse(chatRecipeJson);
                    const saveRes = await fetch(`${API}/api/recipes`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(recipe),
                    });
                    const saved = await saveRes.json();
                    let servings = 2;
                    if (recipe.servings) {
                        const m = String(recipe.servings).match(/(\d+)/);
                        if (m) servings = parseInt(m[1]);
                    }
                    await fetch(`${API}/api/calendar/entries`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            recipe_id: saved.id,
                            entry_date: day,
                            meal_type: meal,
                            servings,
                        }),
                    });
                    loadCalendar();
                } catch (err) {
                    console.error("Failed to drop chat recipe", err);
                }
                return;
            }

            const entryId = e.dataTransfer.getData("text/plain");
            if (!entryId) return;

            if (e.altKey) {
                await fetch(`${API}/api/calendar/entries/${entryId}/copy`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ entry_date: day, meal_type: meal }),
                });
            } else {
                await fetch(`${API}/api/calendar/entries/${entryId}/move`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ entry_date: day, meal_type: meal }),
                });
            }
            loadCalendar();
        });
    });
}

// Calendar navigation
$("#cal-prev").addEventListener("click", () => {
    if (calendarViewMode === "week") {
        calendarWeekStart.setDate(calendarWeekStart.getDate() - 7);
    } else {
        calendarMonth.setMonth(calendarMonth.getMonth() - 1);
    }
    loadCalendar();
});
$("#cal-next").addEventListener("click", () => {
    if (calendarViewMode === "week") {
        calendarWeekStart.setDate(calendarWeekStart.getDate() + 7);
    } else {
        calendarMonth.setMonth(calendarMonth.getMonth() + 1);
    }
    loadCalendar();
});
$("#cal-today").addEventListener("click", () => {
    calendarMonth = new Date();
    calendarWeekStart = getWeekStart(new Date());
    loadCalendar();
});

// View toggle
$("#cal-view-week").addEventListener("click", () => {
    if (calendarViewMode === "week") return;
    calendarViewMode = "week";
    calendarWeekStart = getWeekStart(new Date());
    $("#cal-view-week").classList.add("active");
    $("#cal-view-month").classList.remove("active");
    loadCalendar();
});
$("#cal-view-month").addEventListener("click", () => {
    if (calendarViewMode === "month") return;
    calendarViewMode = "month";
    calendarMonth = new Date();
    $("#cal-view-month").classList.add("active");
    $("#cal-view-week").classList.remove("active");
    loadCalendar();
});

// ── Assign recipe to calendar modal ──
function openAssignToCalendarModal(recipeId, title, defaultServings) {
    // Default to following week
    const nextWeekStart = getWeekStart(new Date());
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    let weekStart = nextWeekStart;

    function renderGrid(modal) {
        const weekDates = getWeekGridDates(weekStart);
        const uniqueDates = weekDates.map(d => isoDate(d));
        const weekEnd = weekDates[6];
        const weekLabel = weekDates[0].toLocaleDateString(getLocale(), { day: "numeric", month: "short" })
            + " – " + weekEnd.toLocaleDateString(getLocale(), { day: "numeric", month: "short", year: "numeric" });

        modal.querySelector(".modal-inner").innerHTML = `
            <h3>${t("calendar.addToCalendar")}</h3>
            <p class="copy-hint">${escHtml(title)}</p>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
                <button class="btn btn-small assign-prev">&#8249;</button>
                <strong>${weekLabel}</strong>
                <button class="btn btn-small assign-next">&#8250;</button>
            </div>
            <div class="copy-grid">
                ${uniqueDates.map((date) => {
                    const d = new Date(date + "T00:00:00");
                    const label = d.toLocaleDateString(getLocale(), { weekday: "short", day: "numeric" });
                    return `
                    <div class="copy-day">
                        <strong>${label}</strong>
                        ${MEALS.map((meal) => `
                            <button class="btn btn-secondary copy-target" data-day="${date}" data-meal="${meal}">
                                ${tMeal(meal)}
                            </button>`).join("")}
                    </div>`;
                }).join("")}
            </div>
            <div class="form-actions" style="margin-top:16px">
                <button class="btn btn-ghost cancel-add">${t("common.cancel")}</button>
            </div>`;

        modal.querySelector(".assign-prev").addEventListener("click", () => {
            weekStart = new Date(weekStart);
            weekStart.setDate(weekStart.getDate() - 7);
            renderGrid(modal);
        });
        modal.querySelector(".assign-next").addEventListener("click", () => {
            weekStart = new Date(weekStart);
            weekStart.setDate(weekStart.getDate() + 7);
            renderGrid(modal);
        });
        modal.querySelector(".cancel-add").addEventListener("click", () => modal.remove());

        modal.querySelectorAll(".copy-target").forEach((btn) => {
            btn.addEventListener("click", () => {
                const day = btn.dataset.day;
                const meal = btn.dataset.meal;
                const dayLabel = new Date(day + "T00:00:00").toLocaleDateString(getLocale(), { weekday: "long", day: "numeric", month: "short" });

                modal.querySelector(".modal-inner").innerHTML = `
                    <h3>${escHtml(title)}</h3>
                    <p class="copy-hint">${dayLabel} · ${tMeal(meal)}</p>
                    <p class="servings-prompt">${t("calendar.howManyServings")}</p>
                    <div class="servings-picker">
                        <button class="btn btn-secondary servings-dec">&minus;</button>
                        <span class="servings-value">${defaultServings}</span>
                        <button class="btn btn-secondary servings-inc">+</button>
                    </div>
                    <div class="form-actions" style="margin-top:16px">
                        <button class="btn btn-primary confirm-assign">${t("calendar.addToCalendar")}</button>
                        <button class="btn btn-ghost cancel-add">${t("common.cancel")}</button>
                    </div>`;

                const valEl = modal.querySelector(".servings-value");
                modal.querySelector(".servings-dec").addEventListener("click", () => {
                    const v = parseInt(valEl.textContent);
                    if (v > 1) valEl.textContent = v - 1;
                });
                modal.querySelector(".servings-inc").addEventListener("click", () => {
                    valEl.textContent = parseInt(valEl.textContent) + 1;
                });
                modal.querySelector(".cancel-add").addEventListener("click", () => modal.remove());
                modal.querySelector(".confirm-assign").addEventListener("click", async () => {
                    modal.querySelector(".confirm-assign").disabled = true;
                    modal.querySelector(".confirm-assign").textContent = t("calendar.adding");
                    await fetch(`${API}/api/calendar/entries`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            recipe_id: recipeId,
                            entry_date: day,
                            meal_type: meal,
                            servings: parseInt(valEl.textContent),
                        }),
                    });
                    modal.remove();
                    loadCalendar();
                });
            });
        });
    }

    const modal = document.createElement("div");
    modal.className = "add-meal-modal";
    modal.innerHTML = `<div class="modal-inner"></div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
    renderGrid(modal);
}

// ── Copy-to picker modal ──
function openCopyModal(entryId) {
    const weekDates = getWeekGridDates(calendarViewMode === "week" ? calendarWeekStart : getWeekStart(new Date()));
    const uniqueDates = weekDates.map(d => isoDate(d));

    const modal = document.createElement("div");
    modal.className = "add-meal-modal";
    modal.innerHTML = `
        <div class="modal-inner">
            <h3>${t("copy.title")}</h3>
            <p class="copy-hint">${t("copy.hint")}</p>
            <div class="copy-grid">
                ${uniqueDates.map((date) => {
                    const d = new Date(date + "T00:00:00");
                    const label = d.toLocaleDateString(getLocale(), { weekday: "short", day: "numeric", month: "short" });
                    return `
                    <div class="copy-day">
                        <strong>${label}</strong>
                        ${MEALS.map((meal) => `
                            <button class="btn btn-secondary copy-target" data-day="${date}" data-meal="${meal}">
                                ${tMeal(meal)}
                            </button>`).join("")}
                    </div>`;
                }).join("")}
            </div>
            <div class="form-actions" style="margin-top:16px">
                <button class="btn btn-primary copy-confirm" disabled>${t("copy.button")}</button>
                <button class="btn btn-ghost cancel-add">${t("common.cancel")}</button>
            </div>
        </div>`;

    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
    const confirmBtn = modal.querySelector(".copy-confirm");

    modal.querySelectorAll(".copy-target").forEach((btn) => {
        btn.addEventListener("click", () => {
            btn.classList.toggle("copy-selected");
            const anySelected = modal.querySelector(".copy-target.copy-selected");
            confirmBtn.disabled = !anySelected;
        });
    });

    modal.querySelector(".cancel-add").addEventListener("click", () => modal.remove());

    confirmBtn.addEventListener("click", async () => {
        const selected = modal.querySelectorAll(".copy-target.copy-selected");
        if (selected.length === 0) return;
        confirmBtn.disabled = true;
        confirmBtn.textContent = t("copy.copying");
        await Promise.all(
            Array.from(selected).map((btn) =>
                fetch(`${API}/api/calendar/entries/${entryId}/copy`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ entry_date: btn.dataset.day, meal_type: btn.dataset.meal }),
                })
            )
        );
        modal.remove();
        loadCalendar();
    });
}

async function openAddMealModal(day, meal) {
    const res = await fetch(`${API}/api/recipes`);
    const recipes = await res.json();
    const dayLabel = new Date(day + "T00:00:00").toLocaleDateString(getLocale(), { weekday: "long", day: "numeric", month: "short" });

    const modal = document.createElement("div");
    modal.className = "add-meal-modal";
    modal.innerHTML = `
        <div class="modal-inner">
            <h3>${t("calendar.addMealFor", { meal: tMeal(meal), day: dayLabel })}</h3>
            <div class="meal-choice-btns">
                <button class="btn btn-primary choice-recipe">📖 ${t("calendar.pickRecipe")}</button>
                <button class="btn btn-secondary choice-note">📝 ${t("calendar.addNote")}</button>
            </div>
            <div class="form-actions" style="margin-top:16px">
                <button class="btn btn-ghost cancel-add">${t("common.cancel")}</button>
            </div>
        </div>`;

    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
    modal.querySelector(".cancel-add").addEventListener("click", () => modal.remove());

    // ── Pick a recipe flow ──
    modal.querySelector(".choice-recipe").addEventListener("click", () => {
        if (recipes.length === 0) {
            alert(t("calendar.noRecipes"));
            return;
        }
        modal.querySelector(".modal-inner").innerHTML = `
            <h3>${t("calendar.addMealFor", { meal: tMeal(meal), day: dayLabel })}</h3>
            <input type="text" class="input recipe-search" placeholder="${t("calendar.searchRecipes")}" autofocus>
            <div class="recipe-pick-list">
                ${recipes.map((r) => `<div class="recipe-pick" data-recipe-id="${r.id}">${escHtml(r.title)}</div>`).join("")}
            </div>
            <div class="form-actions" style="margin-top:16px">
                <button class="btn btn-ghost cancel-add">${t("common.cancel")}</button>
            </div>`;

        const searchInput = modal.querySelector(".recipe-search");
        const picks = modal.querySelectorAll(".recipe-pick");
        searchInput.addEventListener("input", () => {
            const q = searchInput.value.toLowerCase();
            picks.forEach((pick) => {
                pick.style.display = pick.textContent.toLowerCase().includes(q) ? "" : "none";
            });
        });

        modal.querySelector(".cancel-add").addEventListener("click", () => modal.remove());
        modal.querySelectorAll(".recipe-pick").forEach((pick) => {
            pick.addEventListener("click", () => {
                const recipeId = parseInt(pick.dataset.recipeId);
                const recipe = recipes.find((r) => r.id === recipeId);
                const defaultServings = parseServings(recipe ? recipe.servings : null) || 2;

                modal.querySelector(".modal-inner").innerHTML = `
                    <h3>${escHtml(recipe.title)}</h3>
                    <p class="servings-prompt">${t("calendar.howManyServings")}</p>
                    <div class="servings-picker">
                        <button class="btn btn-secondary servings-dec">&minus;</button>
                        <span class="servings-value">${defaultServings}</span>
                        <button class="btn btn-secondary servings-inc">+</button>
                    </div>
                    <div class="form-actions" style="margin-top:16px">
                        <button class="btn btn-primary confirm-add">${t("calendar.addToCalendarShort")}</button>
                        <button class="btn btn-ghost cancel-add">${t("common.cancel")}</button>
                    </div>`;

                const valEl = modal.querySelector(".servings-value");
                modal.querySelector(".servings-dec").addEventListener("click", () => {
                    const v = parseInt(valEl.textContent);
                    if (v > 1) valEl.textContent = v - 1;
                });
                modal.querySelector(".servings-inc").addEventListener("click", () => {
                    valEl.textContent = parseInt(valEl.textContent) + 1;
                });
                modal.querySelector(".cancel-add").addEventListener("click", () => modal.remove());
                modal.querySelector(".confirm-add").addEventListener("click", async () => {
                    await fetch(`${API}/api/calendar/entries`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            recipe_id: recipeId,
                            entry_date: day,
                            meal_type: meal,
                            servings: parseInt(valEl.textContent),
                        }),
                    });
                    modal.remove();
                    loadCalendar();
                });
            });
        });
    });

    // ── Add a note flow ──
    modal.querySelector(".choice-note").addEventListener("click", () => {
        modal.querySelector(".modal-inner").innerHTML = `
            <h3>${t("calendar.addNoteFor", { day: dayLabel, meal: tMeal(meal) })}</h3>
            <textarea class="input note-input" rows="3" placeholder="${t("calendar.notePlaceholder")}" autofocus></textarea>
            <div class="form-actions" style="margin-top:16px">
                <button class="btn btn-primary confirm-note">${t("calendar.addToCalendarShort")}</button>
                <button class="btn btn-ghost cancel-add">${t("common.cancel")}</button>
            </div>`;

        modal.querySelector(".cancel-add").addEventListener("click", () => modal.remove());
        modal.querySelector(".confirm-note").addEventListener("click", async () => {
            const note = modal.querySelector(".note-input").value.trim();
            if (!note) { alert(t("calendar.pleaseEnterNote")); return; }
            await fetch(`${API}/api/calendar/entries`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    note: note,
                    entry_date: day,
                    meal_type: meal,
                }),
            });
            modal.remove();
            loadCalendar();
        });
    });
}

function parseServings(s) {
    if (!s) return null;
    const m = s.match(/(\d+)/);
    return m ? parseInt(m[1]) : null;
}

function scaleIngredient(text, ratio) {
    let replaced = false;
    const result = text.replace(/\d+\.?\d*/, (match) => {
        if (replaced) return match;
        replaced = true;
        const scaled = parseFloat(match) * ratio;
        return scaled === Math.floor(scaled) ? String(Math.floor(scaled)) : scaled.toFixed(1);
    });
    if (!replaced) {
        const qty = ratio === Math.floor(ratio) ? String(Math.floor(ratio)) : ratio.toFixed(1);
        return `${qty} ${text}`;
    }
    return result;
}

// ── Shopping list ──
const CATEGORY_ORDER = [
    "Fruits & Vegetables", "Meat & Fish", "Dairy & Eggs", "Bakery & Bread",
    "Pasta, Rice & Grains", "Tins & Jars", "Oils, Sauces & Condiments",
    "Herbs, Spices & Seasonings", "Other",
];

let shoppingWeekOffset = 1; // default to next week

function shoppingCheckedKey(start, end) {
    return `shopping-checked:${start}:${end}`;
}

function getCheckedItems(start, end) {
    try {
        return JSON.parse(localStorage.getItem(shoppingCheckedKey(start, end))) || [];
    } catch { return []; }
}

function saveCheckedItems(start, end, items) {
    localStorage.setItem(shoppingCheckedKey(start, end), JSON.stringify(items));
}

function getWeekRange(offset) {
    const now = new Date();
    const day = now.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const mon = new Date(now);
    mon.setDate(now.getDate() + diffToMon + (offset * 7));
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { start: isoDate(mon), end: isoDate(sun) };
}

function formatWeekLabel(start, end) {
    const s = new Date(start + "T00:00:00");
    const e = new Date(end + "T00:00:00");
    const sLabel = s.toLocaleDateString(getLocale(), { day: "numeric", month: "short" });
    const eLabel = e.toLocaleDateString(getLocale(), { day: "numeric", month: "short" });
    return `${sLabel} – ${eLabel}`;
}

function renderShoppingList(items, start, end) {
    const list = $("#shopping-items");
    if (items.length === 0) {
        hide($("#shopping-list-container"));
        show($("#shopping-empty"));
        return;
    }
    hide($("#shopping-empty"));
    const grouped = {};
    items.forEach((item) => {
        const cat = item.category || "Other";
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(item);
    });
    let html = "";
    for (const cat of CATEGORY_ORDER) {
        if (!grouped[cat] || grouped[cat].length === 0) continue;
        html += `<li class="shopping-category-header" data-category="${escHtml(cat)}"><span class="shopping-category-left"><span class="shopping-category-chevron">&#9662;</span><span class="shopping-category-name">${escHtml(tCategory(cat))}</span></span><span class="shopping-category-count">${grouped[cat].length}</span></li>`;
        html += grouped[cat].map((item) => {
            const text = item.text;
            const recipes = item.recipes || [];
            const ocadoUrl = ocadoSearchUrl(text);
            const recipeAttr = recipes.length > 0
                ? `<span class="shopping-recipe-attr">${escHtml(recipes.join(", "))}</span>`
                : "";
            const deleteBtn = item.custom_id
                ? `<button class="btn-remove-custom" data-custom-id="${item.custom_id}" title="Remove">&times;</button>`
                : "";
            return `<li data-category="${escHtml(cat)}"><label class="shopping-item"><input type="checkbox"><span class="shopping-item-content"><span class="shopping-item-text">${escHtml(text)}</span>${recipeAttr}</span></label>${deleteBtn}<a class="ocado-link" href="${ocadoUrl}" target="_blank" rel="noopener noreferrer" title="Search on Ocado"><img src="https://www.ocado.com/favicon.ico" alt="Ocado" class="ocado-icon"></a></li>`;
        }).join("");
    }
    list.innerHTML = html;

    // Bind delete buttons for custom items
    list.querySelectorAll(".btn-remove-custom").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            await fetch(`${API}/api/custom-shopping-items/${btn.dataset.customId}`, { method: "DELETE" });
            loadShoppingView();
        });
    });

    // Restore checked state from localStorage
    const checked = new Set(getCheckedItems(start, end));
    list.querySelectorAll("li:not(.shopping-category-header)").forEach((li) => {
        const text = li.querySelector(".shopping-item-text")?.textContent;
        if (text && checked.has(text)) {
            li.querySelector("input[type=checkbox]").checked = true;
        }
    });

    // Save checked state on change
    list.querySelectorAll("input[type=checkbox]").forEach((cb) => {
        cb.addEventListener("change", () => {
            const currentChecked = [];
            list.querySelectorAll("li:not(.shopping-category-header)").forEach((li) => {
                const box = li.querySelector("input[type=checkbox]");
                const text = li.querySelector(".shopping-item-text")?.textContent;
                if (box?.checked && text) currentChecked.push(text);
            });
            saveCheckedItems(start, end, currentChecked);
        });
    });

    show($("#shopping-list-container"));
}

async function loadShoppingView() {
    const { start, end } = getWeekRange(shoppingWeekOffset);
    const label = shoppingWeekOffset === 0 ? t("shopping.thisWeek") : shoppingWeekOffset === 1 ? t("shopping.nextWeek") : null;
    const rangeText = formatWeekLabel(start, end);
    $("#shopping-date-range").textContent = label ? `${label}: ${rangeText}` : rangeText;

    // Keep URL in sync with the viewed week
    history.replaceState({ view: "shopping" }, "", `/shopping?week=${start}`);

    const [res, customRes] = await Promise.all([
        fetch(`${API}/api/shopping-list?start=${start}&end=${end}`),
        fetch(`${API}/api/custom-shopping-items?week_start=${start}`),
    ]);
    const items = await res.json();
    const customItems = await customRes.json();

    // Merge custom items into the list
    customItems.forEach((ci) => {
        items.push({ text: ci.text, category: ci.category, recipes: [], custom_id: ci.id });
    });

    renderShoppingList(items, start, end);
}

$("#shopping-week-prev").addEventListener("click", () => { shoppingWeekOffset--; loadShoppingView(); });
$("#shopping-week-next").addEventListener("click", () => { shoppingWeekOffset++; loadShoppingView(); });

// Toggle category collapse
$("#shopping-items").addEventListener("click", (e) => {
    const header = e.target.closest(".shopping-category-header");
    if (!header) return;
    const cat = header.dataset.category;
    header.classList.toggle("collapsed");
    const list = $("#shopping-items");
    list.querySelectorAll(`li[data-category="${CSS.escape(cat)}"]:not(.shopping-category-header)`).forEach((li) => {
        li.classList.toggle("category-hidden");
    });
});

// Add custom item to shopping list
async function addShoppingItem(text) {
    if (!text.trim()) return;
    const { start } = getWeekRange(shoppingWeekOffset);
    await fetch(`${API}/api/custom-shopping-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), week_start: start }),
    });
    loadShoppingView();
}

$("#btn-add-shopping-item").addEventListener("click", () => {
    const input = $("#add-shopping-item");
    addShoppingItem(input.value);
    input.value = "";
    input.focus();
});

$("#add-shopping-item").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        addShoppingItem(e.target.value);
        e.target.value = "";
    }
});

// Copy shopping list to clipboard
$("#btn-copy-shopping").addEventListener("click", async () => {
    const lines = [];
    let currentCategory = null;
    let categoryHasItems = false;

    $("#shopping-items").querySelectorAll("li").forEach((li) => {
        if (li.classList.contains("shopping-category-header")) {
            currentCategory = li.querySelector(".shopping-category-name").textContent;
            categoryHasItems = false;
        } else {
            const label = li.querySelector(".shopping-item");
            if (!label) return;
            const cb = label.querySelector("input[type=checkbox]");
            if (!cb.checked) {
                if (currentCategory && !categoryHasItems) {
                    if (lines.length > 0) lines.push("");
                    lines.push(`--- ${currentCategory} ---`);
                    categoryHasItems = true;
                }
                lines.push(label.querySelector(".shopping-item-text").textContent);
            }
        }
    });

    const itemCount = lines.filter(l => l && !l.startsWith("---")).length;
    if (itemCount === 0) {
        $("#btn-copy-shopping").textContent = "✅ " + t("shopping.allDone");
        setTimeout(() => $("#btn-copy-shopping").textContent = "📋 " + t("shopping.copy"), 2000);
        return;
    }
    const text = lines.join("\n");
    try {
        await navigator.clipboard.writeText(text);
        $("#btn-copy-shopping").textContent = "✅ " + t("shopping.itemsCopied", { count: itemCount });
    } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        $("#btn-copy-shopping").textContent = "✅ " + t("shopping.itemsCopied", { count: itemCount });
    }
    setTimeout(() => $("#btn-copy-shopping").textContent = "📋 " + t("shopping.copy"), 2500);
});

// Clear all shopping list items for the current week
$("#btn-clear-shopping").addEventListener("click", async () => {
    const { start } = getWeekRange(shoppingWeekOffset);
    await fetch(`${API}/api/custom-shopping-items?week_start=${start}`, { method: "DELETE" });
    loadShoppingView();
});

// ═══════════════════════════════════
// AI Chat
// ═══════════════════════════════════

const chatMessages = $("#chat-messages");
const chatInput = $("#chat-input");

$("#btn-send-chat").addEventListener("click", sendChat);
chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendChat();
    }
});

async function sendChat() {
    const msg = chatInput.value.trim();
    if (!msg) return;
    chatInput.value = "";

    // User bubble
    appendBubble("user", `<p>${escHtml(msg)}</p>`);
    chatHistory.push({ role: "user", content: msg });

    // Typing indicator
    const typing = document.createElement("div");
    typing.className = "chat-typing";
    typing.innerHTML = "<span></span><span></span><span></span>";
    chatMessages.appendChild(typing);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
        const res = await fetch(`${API}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: msg, history: chatHistory }),
        });
        const data = await res.json();
        typing.remove();

        if (data.error) {
            appendBubble("assistant", `<p>⚠️ ${escHtml(data.error)}</p>`);
            return;
        }

        let html = `<p>${escHtml(data.message || "")}</p>`;

        // Meal plan response
        if (data.meal_plan && data.meal_plan.entries && data.meal_plan.entries.length > 0) {
            const mp = data.meal_plan;
            html += `<div class="chat-meal-plan">`;
            html += `<h4>📅 ${t("chat.proposedMealPlan")}</h4>`;
            html += `<div class="chat-plan-grid">`;
            const planDays = [...new Set(mp.entries.map(e => e.day))].sort();
            planDays.forEach((day) => {
                const dayEntries = mp.entries.filter((e) => e.day === day);
                if (dayEntries.length === 0) return;
                const d = new Date(day + "T00:00:00");
                const dayName = d.toLocaleDateString(getLocale(), { weekday: "short" });
                const dateNum = d.toLocaleDateString(getLocale(), { day: "numeric", month: "short" });
                html += `<div class="chat-plan-day">`;
                html += `<div class="chat-day-heading"><span class="chat-day-name">${dayName}</span><span class="chat-day-date">${dateNum}</span></div>`;
                dayEntries.forEach((e) => {
                    const globalIdx = mp.entries.indexOf(e);
                    const r = e.recipe || {};
                    const timeStr = r.total_time ? `<span class="cpe-time">${escHtml(r.total_time)}</span>` : "";
                    html += `<div class="chat-plan-entry" draggable="true" data-mp-entry-idx="${globalIdx}"
                                  data-recipe-json="${escHtml(JSON.stringify(r))}"
                                  data-day="${e.day}" data-meal="${e.meal}">`;
                    html += `<span class="cpe-meal cpe-meal--${e.meal}">${tMeal(e.meal)}</span>`;
                    html += `<a href="#" class="cpe-title" data-entry-idx="${globalIdx}">${escHtml(r.title || "?")}</a>`;
                    html += timeStr;
                    html += `<button class="cpe-regen" title="Regenerate" data-entry-idx="${globalIdx}">↻</button>`;
                    html += `</div>`;
                });
                html += `</div>`;
            });
            html += `</div>`;
            html += `<div class="chat-plan-actions">`;
            html += `<button class="btn btn-primary create-chat-plan">📅 ${t("chat.addToCalendar")}</button>`;
            html += `</div>`;
            html += `</div>`;
        }

        if (data.recipes && data.recipes.length > 0) {
            data.recipes.forEach((r, idx) => {
                html += `
                    <div class="recipe-suggestion" data-recipe-idx="${idx}">
                        <div class="recipe-suggestion-img-wrap" data-img-idx="${idx}">
                            <div class="recipe-img-shimmer"></div>
                        </div>
                        <h4>${escHtml(r.title)}</h4>
                        <p class="meta">${r.total_time || ""} ${r.servings ? "· " + r.servings : ""}${r.source_url ? ` · <a href="${r.source_url}" target="_blank">${t("recipes.source")}</a>` : ""}</p>
                        <details><summary>${t("recipes.ingredients")}</summary>
                            <ul>${(r.ingredients || []).map((i) => `<li>${escHtml(i)}</li>`).join("")}</ul>
                        </details>
                        <details><summary>${t("recipes.method")}</summary>
                            <ol>${(r.instructions || []).map((s) => `<li>${escHtml(s)}</li>`).join("")}</ol>
                        </details>
                        <button class="btn btn-primary btn-small save-chat-recipe" data-chat-idx="${idx}">💾 ${t("chat.saveRecipe")}</button>
                    </div>`;
            });
        }

        const bubble = appendBubble("assistant", html);
        chatHistory.push({ role: "assistant", content: data.message || "" });

        // Bind save buttons inside the bubble
        bubble.querySelectorAll(".save-chat-recipe").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const recipe = data.recipes[parseInt(btn.dataset.chatIdx)];
                await fetch(`${API}/api/recipes`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(recipe),
                });
                btn.textContent = "✅ " + t("chat.saved");
                btn.disabled = true;
            });
        });

        // Fetch images from source URLs for recipe suggestions
        if (data.recipes && data.recipes.length > 0) {
            data.recipes.forEach((r, idx) => {
                const wrap = bubble.querySelector(`[data-img-idx="${idx}"]`);
                if (r.source_url) {
                    fetchRecipeImage(r.source_url,
                        (url) => {
                            r.image_url = url;
                            if (wrap) wrap.innerHTML = `<img class="recipe-suggestion-img" src="${url}" alt="" onerror="this.parentElement.remove()">`;
                        },
                        () => { if (wrap) wrap.remove(); }
                    );
                } else {
                    if (wrap) wrap.remove();
                }
            });
        }

        // Fetch images from source URLs for meal plan recipes
        if (data.meal_plan && data.meal_plan.entries) {
            data.meal_plan.entries.forEach((e, idx) => {
                if (e.recipe && e.recipe.source_url && !e.recipe.image_url) {
                    fetchRecipeImage(e.recipe.source_url,
                        (url) => {
                            e.recipe.image_url = url;
                            const entryEl = bubble.querySelector(`.chat-plan-entry[data-mp-entry-idx="${data.meal_plan.entries.indexOf(e)}"]`);
                            if (entryEl) {
                                entryEl.dataset.recipeJson = JSON.stringify(e.recipe);
                                const thumb = document.createElement("img");
                                thumb.className = "cpe-thumb";
                                thumb.src = url;
                                thumb.alt = "";
                                thumb.onerror = function() { this.remove(); };
                                entryEl.insertBefore(thumb, entryEl.firstChild);
                            }
                        },
                        null
                    );
                }
            });
        }

        // Bind clickable recipe titles → open recipe detail modal
        bubble.querySelectorAll(".cpe-title").forEach((link) => {
            link.addEventListener("click", (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const idx = parseInt(link.dataset.entryIdx);
                const entry = data.meal_plan.entries[idx];
                if (!entry || !entry.recipe) return;
                openChatRecipeModal(entry.recipe);
            });
        });

        // Bind regenerate buttons
        bubble.querySelectorAll(".cpe-regen").forEach((btn) => {
            btn.addEventListener("click", async (ev) => {
                ev.stopPropagation();
                const idx = parseInt(btn.dataset.entryIdx);
                const entry = data.meal_plan.entries[idx];
                if (!entry) return;
                btn.textContent = "⏳";
                btn.classList.add("spinning");
                btn.disabled = true;
                try {
                    const res2 = await fetch(`${API}/api/regenerate-recipe`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            day: entry.day,
                            meal: entry.meal,
                            old_title: entry.recipe ? entry.recipe.title : "",
                        }),
                    });
                    const result = await res2.json();
                    if (result.recipe) {
                        data.meal_plan.entries[idx].recipe = result.recipe;
                        const entryEl = btn.closest(".chat-plan-entry");
                        entryEl.querySelector(".cpe-title").textContent = result.recipe.title;
                        entryEl.dataset.recipeJson = JSON.stringify(result.recipe);
                        const timeEl = entryEl.querySelector(".cpe-time");
                        if (timeEl) timeEl.textContent = result.recipe.total_time || "";
                        if (result.recipe.source_url) {
                            fetchRecipeImage(result.recipe.source_url,
                                (url) => {
                                    result.recipe.image_url = url;
                                    data.meal_plan.entries[idx].recipe.image_url = url;
                                    entryEl.dataset.recipeJson = JSON.stringify(data.meal_plan.entries[idx].recipe);
                                    let thumb = entryEl.querySelector(".cpe-thumb");
                                    if (!thumb) {
                                        thumb = document.createElement("img");
                                        thumb.className = "cpe-thumb";
                                        thumb.onerror = function() { this.remove(); };
                                        entryEl.insertBefore(thumb, entryEl.firstChild);
                                    }
                                    thumb.src = url;
                                },
                                null
                            );
                        }
                    }
                    btn.textContent = "↻";
                    btn.classList.remove("spinning");
                    btn.disabled = false;
                } catch {
                    btn.textContent = "⚠️";
                    btn.classList.remove("spinning");
                    btn.disabled = false;
                }
            });
        });

        // Make chat plan entries draggable to calendar
        bubble.querySelectorAll(".chat-plan-entry[draggable]").forEach((el) => {
            el.addEventListener("dragstart", (e) => {
                const recipeJson = el.dataset.recipeJson;
                e.dataTransfer.setData("application/x-chat-recipe", recipeJson);
                e.dataTransfer.effectAllowed = "copy";
                el.classList.add("dragging");
                document.querySelectorAll("#calendar-grid .cal-meal-slot").forEach(s => s.classList.add("drop-target"));
            });
            el.addEventListener("dragend", () => {
                el.classList.remove("dragging");
                document.querySelectorAll("#calendar-grid .cal-meal-slot").forEach(s => s.classList.remove("drop-target", "drop-over"));
            });
        });

        // Bind "Add to Calendar" button
        if (data.meal_plan && bubble.querySelector(".create-chat-plan")) {
            const createBtn = bubble.querySelector(".create-chat-plan");

            createBtn.addEventListener("click", async () => {
                createBtn.disabled = true;
                createBtn.textContent = t("calendar.adding");
                try {
                    const payload = { ...data.meal_plan };
                    const res2 = await fetch(`${API}/api/generate-meal-plan`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                    });
                    const result = await res2.json();
                    if (result.error) {
                        createBtn.textContent = `⚠️ ${result.error}`;
                    } else {
                        createBtn.textContent = t("chat.mealsAdded", { count: result.entries_created });
                        bubble.querySelectorAll(".chat-plan-entry").forEach((el) => {
                            if (!el.querySelector(".chat-saved-badge")) {
                                const badge = document.createElement("span");
                                badge.className = "chat-saved-badge";
                                badge.textContent = "✅";
                                el.appendChild(badge);
                            }
                        });
                        appendBubble("assistant", `<p>${t("chat.planAdded")}</p>`);
                    }
                } catch (err) {
                    createBtn.textContent = "⚠️ " + t("chat.failed");
                }
            });
        }
    } catch (err) {
        typing.remove();
        appendBubble("assistant", `<p>⚠️ ${t("chat.error")}</p>`);
    }
}

function appendBubble(role, html) {
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${role}`;
    bubble.innerHTML = html;
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return bubble;
}

function openChatRecipeModal(recipe) {
    const r = recipe;
    const hasMethods = r.instructions && r.instructions.length > 0;
    const imgHtml = r.image_url
        ? `<div class="chat-modal-img-wrap"><img src="${r.image_url}" alt="" onerror="this.parentElement.remove()"></div>`
        : (r.source_url ? `<div class="chat-modal-img-wrap"><div class="recipe-img-shimmer" style="height:220px"></div></div>` : "");
    const overlay = document.createElement("div");
    overlay.className = "chat-recipe-modal";
    overlay.innerHTML = `
        <div class="chat-recipe-modal-body">
            <button class="chat-recipe-modal-close">&times;</button>
            ${imgHtml}
            <h3>${escHtml(r.title)}</h3>
            <p class="meta">${r.total_time || ""}${r.servings ? " · " + r.servings : ""}${r.source_url ? ` · <a href="${r.source_url}" target="_blank">${t("recipes.source")}</a>` : ""}</p>
            ${r.categories && r.categories.length ? `<div style="margin-bottom:12px">${r.categories.map(c => `<span class="category-pill" style="font-size:11px;padding:2px 8px;margin-right:4px">${escHtml(c)}</span>`).join("")}</div>` : ""}
            <h4>${t("recipes.ingredients")}</h4>
            <ul>${(r.ingredients || []).map(i => `<li>${escHtml(i)}</li>`).join("")}</ul>
            <h4>${t("recipes.method")}</h4>
            <ol>${(r.instructions || []).map(s => `<li>${escHtml(s)}</li>`).join("")}</ol>
            ${hasMethods ? `<div style="margin-top:16px"><button class="btn btn-start-cooking btn-small chat-start-cooking">🍳 ${t("recipes.startCooking")}</button></div>` : ""}
        </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector(".chat-recipe-modal-close").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    // If image not yet loaded, fetch it now
    if (!r.image_url && r.source_url) {
        fetchRecipeImage(r.source_url,
            (url) => {
                r.image_url = url;
                const wrap = overlay.querySelector(".chat-modal-img-wrap");
                if (wrap) wrap.innerHTML = `<img src="${url}" alt="" onerror="this.parentElement.remove()">`;
            },
            () => {
                const wrap = overlay.querySelector(".chat-modal-img-wrap");
                if (wrap) wrap.remove();
            }
        );
    }
    const chatCookBtn = overlay.querySelector(".chat-start-cooking");
    if (chatCookBtn) {
        chatCookBtn.addEventListener("click", () => {
            overlay.remove();
            showPrecookScreen(r);
        });
    }
}

// ═══════════════════════════════════
// Cooking Mode
// ═══════════════════════════════════

let cookingRecipe = null;
let cookingStep = 0;
let cookingWakeLock = null;
let cookingStartTimeStr = null;

// ── Parse total_time string into minutes ──
function parseTotalTimeMinutes(timeStr) {
    if (!timeStr) return null;
    let totalMins = 0;
    const hrMatch = timeStr.match(/(\d+\.?\d*)\s*(?:hr|hour|h)/i);
    const minMatch = timeStr.match(/(\d+\.?\d*)\s*(?:min|minute|m(?!o))/i);
    const colonMatch = timeStr.match(/(\d+):(\d+)/);
    const pureNum = timeStr.match(/^\s*(\d+)\s*$/);
    if (hrMatch) totalMins += parseFloat(hrMatch[1]) * 60;
    if (minMatch) totalMins += parseFloat(minMatch[1]);
    if (!hrMatch && !minMatch && colonMatch) {
        totalMins = parseInt(colonMatch[1]) * 60 + parseInt(colonMatch[2]);
    }
    if (!hrMatch && !minMatch && !colonMatch && pureNum) {
        totalMins = parseInt(pureNum[1]);
    }
    return totalMins > 0 ? Math.round(totalMins) : null;
}

function formatTimeHHMM(date) {
    return date.toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' });
}

// ── Pre-cook screen ──
let pendingCookRecipe = null;

function showPrecookScreen(recipe) {
    pendingCookRecipe = recipe;
    cookingStartTimeStr = null;

    $("#precook-title").textContent = recipe.title;

    const mins = parseTotalTimeMinutes(recipe.total_time);
    if (mins) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        const durStr = h > 0 ? `${h}h ${m > 0 ? m + 'min' : ''}` : `${m} min`;
        $("#precook-duration").textContent = "⏱ " + t("precook.totalTime", { duration: durStr });
        $("#precook-duration").style.display = "";
    } else {
        $("#precook-duration").textContent = "⏱ " + t("precook.noTime");
        $("#precook-duration").style.display = "";
    }

    const defaultReady = new Date(Date.now() + (mins || 60) * 60000);
    defaultReady.setMinutes(Math.ceil(defaultReady.getMinutes() / 15) * 15, 0, 0);
    const hh = String(defaultReady.getHours()).padStart(2, '0');
    const mm = String(defaultReady.getMinutes()).padStart(2, '0');
    $("#precook-time-input").value = `${hh}:${mm}`;

    updatePrecookResult();

    show($("#precook-screen"));
    $("#precook-time-input").focus();
}

function updatePrecookResult() {
    const timeVal = $("#precook-time-input").value;
    const mins = parseTotalTimeMinutes(pendingCookRecipe?.total_time);
    const resultEl = $("#precook-result");
    const hintEl = $("#precook-no-time-hint");

    if (!timeVal || !mins) {
        hide(resultEl);
        hintEl.textContent = mins ? t("precook.pickTimeHint") : t("precook.noTimeHint");
        show(hintEl);
        cookingStartTimeStr = null;
        return;
    }

    const [h, m] = timeVal.split(':').map(Number);
    const now = new Date();
    const readyBy = new Date();
    readyBy.setHours(h, m, 0, 0);
    if (readyBy <= now) readyBy.setDate(readyBy.getDate() + 1);

    const startAt = new Date(readyBy.getTime() - mins * 60000);
    cookingStartTimeStr = formatTimeHHMM(startAt);

    $("#precook-start-time").textContent = cookingStartTimeStr;
    hide(hintEl);

    if (startAt < now) {
        resultEl.classList.add("precook-result--late");
        const lateByMins = Math.round((now - startAt) / 60000);
        $("#precook-start-time").textContent = t("precook.lateStart", { time: cookingStartTimeStr, mins: lateByMins });
    } else {
        resultEl.classList.remove("precook-result--late");
        const inMins = Math.round((startAt - now) / 60000);
        if (inMins > 0) {
            $("#precook-start-time").textContent = t("precook.inMinutes", { time: cookingStartTimeStr, mins: inMins });
        }
    }
    show(resultEl);
}

$("#precook-time-input").addEventListener("input", updatePrecookResult);

$("#precook-go").addEventListener("click", () => {
    if (!pendingCookRecipe) return;
    hide($("#precook-screen"));
    enterCookingMode(pendingCookRecipe);
    pendingCookRecipe = null;
});

$("#precook-cancel").addEventListener("click", () => {
    hide($("#precook-screen"));
    pendingCookRecipe = null;
    cookingStartTimeStr = null;
});

function enterCookingMode(recipe) {
    if (!recipe || !recipe.instructions || recipe.instructions.length === 0) {
        alert(t("cooking.noSteps"));
        return;
    }

    cookingRecipe = recipe;
    cookingStep = 0;

    $("#cooking-title").textContent = recipe.title;

    const ingList = $("#cooking-ingredients-list");
    ingList.innerHTML = (recipe.ingredients || []).map(i =>
        `<li>${escHtml(i)}</li>`
    ).join("");
    ingList.querySelectorAll("li").forEach(li => {
        li.addEventListener("click", () => li.classList.toggle("checked"));
    });

    hide($("#cooking-ingredients-panel"));
    $("#cooking-toggle-ingredients").classList.remove("active");

    const startBanner = $("#cooking-start-time");
    if (cookingStartTimeStr) {
        $("#cooking-start-time-text").textContent = t("precook.startAtSimple", { time: cookingStartTimeStr });
        const mins = parseTotalTimeMinutes(recipe.total_time);
        const timeVal = $("#precook-time-input").value;
        if (timeVal && mins) {
            const [h, m] = timeVal.split(':').map(Number);
            const readyBy = new Date();
            readyBy.setHours(h, m, 0, 0);
            if (readyBy <= new Date()) readyBy.setDate(readyBy.getDate() + 1);
            const startAt = new Date(readyBy.getTime() - mins * 60000);
            if (startAt < new Date()) {
                startBanner.classList.add("is-late");
                $("#cooking-start-time-text").textContent = t("precook.readyByNow", { time: timeVal });
            } else {
                startBanner.classList.remove("is-late");
                $("#cooking-start-time-text").textContent = t("precook.startAtBanner", { start: cookingStartTimeStr, ready: timeVal });
            }
        }
        show(startBanner);
    } else {
        hide(startBanner);
        startBanner.classList.remove("is-late");
    }

    renderCookingStep();

    show($("#cooking-mode"));
    document.body.style.overflow = "hidden";

    requestWakeLock();

    document.addEventListener("keydown", cookingKeyHandler);

    setupCookingSwipe();
}

function exitCookingMode() {
    hide($("#cooking-mode"));
    document.body.style.overflow = "";
    cookingRecipe = null;
    cookingStep = 0;
    cookingStartTimeStr = null;

    releaseWakeLock();

    document.removeEventListener("keydown", cookingKeyHandler);

    teardownCookingSwipe();
}

function renderCookingStep() {
    if (!cookingRecipe) return;
    const steps = cookingRecipe.instructions;
    const total = steps.length;
    const step = cookingStep;

    const pct = ((step + 1) / total) * 100;
    $("#cooking-progress-bar").style.width = `${pct}%`;

    $("#cooking-step-label").textContent = t("cooking.stepOf", { step: step + 1, total });

    const textEl = $("#cooking-step-text");
    textEl.textContent = steps[step];

    $("#cooking-prev").disabled = step === 0;

    if (step === total - 1) {
        $("#cooking-next").textContent = "✅ " + t("cooking.done");
        $("#cooking-next").classList.add("cooking-finish");
    } else {
        $("#cooking-next").textContent = t("cooking.next");
        $("#cooking-next").classList.remove("cooking-finish");
    }
}

function cookingGoNext() {
    if (!cookingRecipe) return;
    if (cookingStep >= cookingRecipe.instructions.length - 1) {
        exitCookingMode();
        return;
    }
    const textEl = $("#cooking-step-text");
    textEl.classList.add("slide-out-left");
    setTimeout(() => {
        cookingStep++;
        renderCookingStep();
        textEl.classList.remove("slide-out-left");
        textEl.classList.add("slide-in");
        setTimeout(() => textEl.classList.remove("slide-in"), 200);
    }, 150);
}

function cookingGoPrev() {
    if (!cookingRecipe || cookingStep <= 0) return;
    const textEl = $("#cooking-step-text");
    textEl.classList.add("slide-out-right");
    setTimeout(() => {
        cookingStep--;
        renderCookingStep();
        textEl.classList.remove("slide-out-right");
        textEl.classList.add("slide-in");
        setTimeout(() => textEl.classList.remove("slide-in"), 200);
    }, 150);
}

function cookingKeyHandler(e) {
    if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        cookingGoNext();
    } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        cookingGoPrev();
    } else if (e.key === "Escape") {
        exitCookingMode();
    }
}

// Swipe support for touch devices
let cookingTouchStartX = 0;
let cookingTouchStartY = 0;

function cookingTouchStart(e) {
    cookingTouchStartX = e.touches[0].clientX;
    cookingTouchStartY = e.touches[0].clientY;
}

function cookingTouchEnd(e) {
    const dx = e.changedTouches[0].clientX - cookingTouchStartX;
    const dy = e.changedTouches[0].clientY - cookingTouchStartY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
        if (dx < 0) cookingGoNext();
        else cookingGoPrev();
    }
}

function setupCookingSwipe() {
    const el = $("#cooking-mode");
    el.addEventListener("touchstart", cookingTouchStart, { passive: true });
    el.addEventListener("touchend", cookingTouchEnd, { passive: true });
}

function teardownCookingSwipe() {
    const el = $("#cooking-mode");
    el.removeEventListener("touchstart", cookingTouchStart);
    el.removeEventListener("touchend", cookingTouchEnd);
}

// Screen Wake Lock API
async function requestWakeLock() {
    const badge = $("#cooking-wake-lock");
    try {
        if ("wakeLock" in navigator) {
            cookingWakeLock = await navigator.wakeLock.request("screen");
            badge.classList.add("visible");
            cookingWakeLock.addEventListener("release", () => {
                badge.classList.remove("visible");
            });
            document.addEventListener("visibilitychange", reacquireWakeLock);
        }
    } catch (err) {
        console.log("Wake Lock not available:", err);
    }
}

async function reacquireWakeLock() {
    if (document.visibilityState === "visible" && cookingRecipe) {
        try {
            cookingWakeLock = await navigator.wakeLock.request("screen");
            $("#cooking-wake-lock").classList.add("visible");
        } catch (e) { /* ignore */ }
    }
}

function releaseWakeLock() {
    if (cookingWakeLock) {
        cookingWakeLock.release();
        cookingWakeLock = null;
    }
    $("#cooking-wake-lock").classList.remove("visible");
    document.removeEventListener("visibilitychange", reacquireWakeLock);
}

// Cooking mode button handlers
$("#cooking-exit").addEventListener("click", exitCookingMode);
$("#cooking-next").addEventListener("click", cookingGoNext);
$("#cooking-prev").addEventListener("click", cookingGoPrev);
$("#cooking-toggle-ingredients").addEventListener("click", () => {
    const panel = $("#cooking-ingredients-panel");
    const btn = $("#cooking-toggle-ingredients");
    if (panel.classList.contains("hidden")) {
        show(panel);
        btn.classList.add("active");
    } else {
        hide(panel);
        btn.classList.remove("active");
    }
});

// ═══════════════════════════════════
// Recipe Image Scraping
// ═══════════════════════════════════

async function fetchRecipeImage(sourceUrl, onSuccess, onError) {
    if (!sourceUrl) { if (onError) onError(); return; }
    try {
        const res = await fetch(`${API}/api/scrape-recipe-image`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source_url: sourceUrl }),
        });
        const data = await res.json();
        if (data.image_url) {
            onSuccess(data.image_url);
        } else {
            if (onError) onError();
        }
    } catch (err) {
        console.log("Image scrape failed for:", sourceUrl, err);
        if (onError) onError();
    }
}

// ═══════════════════════════════════
// Utility
// ═══════════════════════════════════

function ingredientToOcadoQuery(ingredient) {
    // Strip leading quantity + unit so Ocado gets just the ingredient name
    // e.g. "200g chicken breast" → "chicken breast", "2 tbsp olive oil" → "olive oil"
    const cleaned = ingredient
        .replace(/^\d+[\d\/\.\s]*(kg|g|mg|lb|oz|l|ml|cl|tsp|tbsp|cup|cups|pint|pints|pinch|handful|bunch|slice|slices|can|cans|tin|tins|pack|packs|bag|bags|head|heads|clove|cloves|sprig|sprigs|sheet|sheets|stick|sticks|rasher|rashers)s?\b\.?\s*/i, "")
        .replace(/^\d+[\d\/\.\s]*\s+/, "")
        .trim();
    return cleaned || ingredient.trim();
}

function ocadoSearchUrl(ingredient) {
    return `https://www.ocado.com/search?q=${ingredientToOcadoQuery(ingredient).replace(/\s+/g, "+")}`;
}

function escHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function formatDates(dates) {
    if (!dates || dates.length === 0) return "No dates";
    const opts = { day: "numeric", month: "short" };
    if (dates.length <= 3) {
        return dates.map(d => new Date(d + "T00:00:00").toLocaleDateString(getLocale(), opts)).join(", ");
    }
    const first = new Date(dates[0] + "T00:00:00").toLocaleDateString(getLocale(), opts);
    const last = new Date(dates[dates.length - 1] + "T00:00:00").toLocaleDateString(getLocale(), { ...opts, year: "numeric" });
    return `${first} – ${last} (${dates.length} days)`;
}

// Initial load is handled by initRouting() in the Navigation section
