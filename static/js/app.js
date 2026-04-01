// ═══════════════════════════════════
// Meal Planner – Client-Side App
// ═══════════════════════════════════

const API = "";

// ─── State ───
let calendarMonth = new Date();  // currently displayed month
let chatHistory = [];

// ─── DOM Helpers ───
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const show = (el) => el.classList.remove("hidden");
const hide = (el) => el.classList.add("hidden");

// ═══════════════════════════════════
// Navigation
// ═══════════════════════════════════

$$(".nav-link").forEach((link) => {
    link.addEventListener("click", (e) => {
        e.preventDefault();
        const view = link.dataset.view;
        $$(".nav-link").forEach((l) => l.classList.remove("active"));
        link.classList.add("active");
        $$(".view").forEach((v) => v.classList.remove("active"));
        $(`#view-${view}`).classList.add("active");

        // Load data when switching views
        if (view === "meal-plans") loadCalendar();
        if (view === "recipes") loadRecipes();
    });
});

// ═══════════════════════════════════
// Recipes
// ═══════════════════════════════════

let currentCategoryFilter = "all";
let currentSearchQuery = "";
let recipeViewMode = "grid"; // "grid" or "list"
let maxTimeFilter = null; // null = any, else max minutes

$("#btn-toggle-view").addEventListener("click", () => {
    recipeViewMode = recipeViewMode === "grid" ? "list" : "grid";
    $(".toggle-grid").classList.toggle("hidden", recipeViewMode === "list");
    $(".toggle-list").classList.toggle("hidden", recipeViewMode === "grid");
    loadRecipes();
});

// Time slider filter
$("#time-slider").addEventListener("input", (() => {
    let timer;
    return (e) => {
        const val = parseInt(e.target.value);
        if (val >= 180) {
            $("#time-slider-label").textContent = "Any";
            maxTimeFilter = null;
        } else if (val === 0) {
            $("#time-slider-label").textContent = "No time set";
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
            loadRecipes();
        }, 250);
    };
})());

async function loadRecipes() {
    const [recipesRes, catsRes] = await Promise.all([
        fetch(`${API}/api/recipes`),
        fetch(`${API}/api/categories`),
    ]);
    const recipes = await recipesRes.json();
    const categories = await catsRes.json();
    const container = $("#recipes-list");
    const filterBar = $("#category-filter");

    // Build category filter bar
    if (categories.length > 0) {
        filterBar.classList.remove("hidden");
        filterBar.innerHTML =
            `<button class="category-pill${currentCategoryFilter === "all" ? " active" : ""}" data-cat="all">All</button>` +
            categories.map((c) =>
                `<button class="category-pill${currentCategoryFilter === c ? " active" : ""}" data-cat="${escHtml(c)}">${escHtml(c)}</button>`
            ).join("");
        filterBar.querySelectorAll(".category-pill").forEach((btn) => {
            btn.addEventListener("click", () => {
                currentCategoryFilter = btn.dataset.cat;
                loadRecipes();
            });
        });
    } else {
        filterBar.classList.add("hidden");
    }

    // Filter by category
    let filtered = currentCategoryFilter === "all"
        ? recipes
        : recipes.filter((r) => (r.categories || []).includes(currentCategoryFilter));

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

    if (filtered.length === 0) {
        const msg = recipes.length === 0
            ? "No recipes yet. Add one manually or import from a URL!"
            : currentSearchQuery
                ? "No recipes match your search."
                : "No recipes in this category.";
        container.innerHTML = `<div class="empty-state"><span class="emoji">📖</span>${msg}</div>`;
        return;
    }

    const isList = recipeViewMode === "list";
    container.className = isList ? "recipes-list" : "recipes-grid";

    container.innerHTML = filtered
        .map(
            (r) => isList ? `
        <div class="recipe-row" data-id="${r.id}">
            ${r.image_url
                ? `<img class="recipe-row-img" src="${r.image_url}" alt="">`
                : `<div class="recipe-row-img placeholder">🍳</div>`}
            <div class="recipe-row-body">
                <h3>${escHtml(r.title)}</h3>
                <span class="meta">${r.servings || ""}${(r.categories || []).length ? (r.servings ? " · " : "") + r.categories.map(c => escHtml(c)).join(", ") : ""}</span>
            </div>
            ${r.total_time ? `<span class="recipe-row-time">⏱ ${escHtml(r.total_time)}</span>` : ""}
        </div>` : `
        <div class="recipe-card" data-id="${r.id}">
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
        card.addEventListener("click", () => openRecipeModal(card.dataset.id));
    });
}

async function openRecipeModal(id, entryId) {
    const res = await fetch(`${API}/api/recipes/${id}`);
    const r = await res.json();
    const body = $("#modal-recipe-body");

    const actionBtn = entryId
        ? `<button class="btn btn-danger btn-small" id="btn-remove-entry-modal" data-entry-id="${entryId}">Remove from Calendar</button>`
        : `<button class="btn btn-danger btn-small" onclick="deleteRecipe(${r.id})">Delete Recipe</button>`;

    const hasMethods = r.instructions && r.instructions.length > 0;
    const cookBtn = hasMethods
        ? `<button class="btn btn-start-cooking btn-small" id="btn-start-cooking">🍳 Start Cooking</button>`
        : '';

    body.innerHTML = `
        ${r.image_url ? `<img class="modal-recipe-image" src="${r.image_url}" alt="">` : ""}
        <h2 class="modal-recipe-title">${escHtml(r.title)}</h2>
        <p class="modal-recipe-meta">${r.total_time || ""} ${r.servings ? "· " + r.servings : ""} ${r.source_url ? `· <a href="${r.source_url}" target="_blank">Source ↗</a>` : ""}</p>
        ${(r.categories || []).length > 0
            ? `<div class="modal-recipe-cats">${r.categories.map((c) => `<span class="cat-pill">${escHtml(c)}</span>`).join("")}</div>`
            : ""}
        <h4>Ingredients</h4>
        <ul class="ingredient-list">${r.ingredients.map((i) => `<li>${escHtml(i)}</li>`).join("")}</ul>
        <h4>Method</h4>
        <ol class="instruction-list">${r.instructions.map((s) => `<li>${escHtml(s)}</li>`).join("")}</ol>
        <div class="modal-actions">
            ${cookBtn}
            ${actionBtn}
        </div>`;

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

    show($("#recipe-modal"));
}

$("#btn-close-modal").addEventListener("click", () => hide($("#recipe-modal")));
$(".modal-overlay").addEventListener("click", () => hide($("#recipe-modal")));

async function deleteRecipe(id) {
    if (!confirm("Delete this recipe?")) return;
    await fetch(`${API}/api/recipes/${id}`, { method: "DELETE" });
    hide($("#recipe-modal"));
    loadRecipes();
}

// New recipe form
let selectedCategories = [];
let allCategoriesList = [];

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
        items += `<div class="tag-dropdown-item tag-dropdown-new" data-value="${escHtml(catInput.value.trim())}">+ Create "${escHtml(catInput.value.trim())}"</div>`;
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

// Import from file (.paprikarecipes)
$("#btn-import-file").addEventListener("click", () => {
    $("#paprika-file-input").click();
});
$("#paprika-file-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
        const res = await fetch(`${API}/api/import-paprika`, { method: "POST", body: formData });
        const data = await res.json();
        if (data.error) {
            alert(`Import error: ${data.error}`);
        } else {
            alert(`Imported ${data.count} recipe${data.count !== 1 ? "s" : ""}! ✅`);
            loadRecipes();
        }
    } catch (err) {
        alert("Failed to import file.");
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
        alert("Please provide a title and at least one ingredient.");
        return;
    }

    await fetch(`${API}/api/recipes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, ingredients, instructions, servings, total_time: totalTime, categories }),
    });

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
        $("#scrape-error").textContent = "Failed to fetch recipe. Please check the URL.";
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
    await fetch(`${API}/api/recipes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scrapedData),
    });
    alert("Recipe saved! ✅");
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

// Helpers to get dates for the visible calendar grid
function getCalendarGridDates(year, month) {
    // month is 0-indexed
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    // Start from Monday (ISO week)
    let startDay = first.getDay(); // 0=Sun
    startDay = startDay === 0 ? 6 : startDay - 1; // convert so Mon=0
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
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth(); // 0-indexed
    const apiMonth = month + 1; // 1-indexed for API

    // Update month label
    const monthName = calendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
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
    let html = `<div class="cal-weekday-header">`;
    ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].forEach(d => {
        html += `<div class="cal-wh">${d}</div>`;
    });
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
            html += `<span class="cal-meal-label">${meal}</span>`;
            mealEntries.forEach((e) => {
                if (e.note) {
                    html += `<div class="cal-entry cal-entry-note" draggable="true"
                                  data-entry-id="${e.id}" data-entry-type="note">
                        <span class="cal-entry-text">📝 ${escHtml(e.note)}</span>
                        <span class="cal-entry-actions">
                            <button class="cal-entry-copy" data-entry-id="${e.id}" title="Copy to…">📋</button>
                            <button class="cal-entry-remove" data-entry-id="${e.id}">&times;</button>
                        </span>
                    </div>`;
                } else {
                    html += `<div class="cal-entry" draggable="true"
                                  data-entry-id="${e.id}" data-entry-type="recipe"
                                  data-recipe-id="${e.recipe_id}">
                        <a href="#" class="cal-entry-link" data-recipe-id="${e.recipe_id}" data-entry-id="${e.id}">${escHtml(e.recipe_title)}</a>
                        <span class="cal-entry-srv">${e.servings}srv</span>
                        <span class="cal-entry-actions">
                            <button class="cal-entry-copy" data-entry-id="${e.id}" title="Copy to…">📋</button>
                            <button class="cal-entry-remove" data-entry-id="${e.id}">&times;</button>
                        </span>
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

    // Bind add buttons
    grid.querySelectorAll(".cal-add-btn").forEach((btn) => {
        btn.addEventListener("click", () => openAddMealModal(btn.dataset.day, btn.dataset.meal));
    });

    // Bind remove buttons
    grid.querySelectorAll(".cal-entry-remove").forEach((btn) => {
        btn.addEventListener("click", async (ev) => {
            ev.stopPropagation();
            await fetch(`${API}/api/calendar/entries/${btn.dataset.entryId}`, { method: "DELETE" });
            loadCalendar();
        });
    });

    // Bind copy buttons
    grid.querySelectorAll(".cal-entry-copy").forEach((btn) => {
        btn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            openCopyModal(parseInt(btn.dataset.entryId));
        });
    });

    // Bind recipe links
    grid.querySelectorAll(".cal-entry-link").forEach((link) => {
        link.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const recipeId = link.dataset.recipeId;
            const entryId = link.dataset.entryId;
            if (recipeId) openRecipeModal(recipeId, entryId);
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

    // Render shopping week picker
    renderShoppingWeeks();
}

// Calendar navigation
$("#cal-prev").addEventListener("click", () => {
    calendarMonth.setMonth(calendarMonth.getMonth() - 1);
    loadCalendar();
});
$("#cal-next").addEventListener("click", () => {
    calendarMonth.setMonth(calendarMonth.getMonth() + 1);
    loadCalendar();
});
$("#cal-today").addEventListener("click", () => {
    calendarMonth = new Date();
    loadCalendar();
});

// ── Copy-to picker modal ──
function openCopyModal(entryId) {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const gridDates = getCalendarGridDates(year, month);
    // Only show dates in current month
    const monthDates = gridDates.filter(d => d.getMonth() === month);
    const uniqueDates = [...new Set(monthDates.map(d => isoDate(d)))];

    const modal = document.createElement("div");
    modal.className = "add-meal-modal";
    modal.innerHTML = `
        <div class="modal-inner">
            <h3>Copy to…</h3>
            <p class="copy-hint">Select one or more slots, then press Copy.</p>
            <div class="copy-grid">
                ${uniqueDates.map((date) => {
                    const d = new Date(date + "T00:00:00");
                    const label = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
                    return `
                    <div class="copy-day">
                        <strong>${label}</strong>
                        ${MEALS.map((meal) => `
                            <button class="btn btn-secondary copy-target" data-day="${date}" data-meal="${meal}">
                                ${meal}
                            </button>`).join("")}
                    </div>`;
                }).join("")}
            </div>
            <div class="form-actions" style="margin-top:16px">
                <button class="btn btn-primary copy-confirm" disabled>Copy</button>
                <button class="btn btn-ghost cancel-add">Cancel</button>
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
        confirmBtn.textContent = "Copying…";
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
    const dayLabel = new Date(day + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });

    const modal = document.createElement("div");
    modal.className = "add-meal-modal";
    modal.innerHTML = `
        <div class="modal-inner">
            <h3>Add ${meal} for ${dayLabel}</h3>
            <div class="meal-choice-btns">
                <button class="btn btn-primary choice-recipe">📖 Pick a Recipe</button>
                <button class="btn btn-secondary choice-note">📝 Add a Note</button>
            </div>
            <div class="form-actions" style="margin-top:16px">
                <button class="btn btn-ghost cancel-add">Cancel</button>
            </div>
        </div>`;

    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
    modal.querySelector(".cancel-add").addEventListener("click", () => modal.remove());

    // ── Pick a recipe flow ──
    modal.querySelector(".choice-recipe").addEventListener("click", () => {
        if (recipes.length === 0) {
            alert("No recipes available. Add some recipes first!");
            return;
        }
        modal.querySelector(".modal-inner").innerHTML = `
            <h3>Add ${meal} for ${dayLabel}</h3>
            <input type="text" class="input recipe-search" placeholder="Search recipes…" autofocus>
            <div class="recipe-pick-list">
                ${recipes.map((r) => `<div class="recipe-pick" data-recipe-id="${r.id}">${escHtml(r.title)}</div>`).join("")}
            </div>
            <div class="form-actions" style="margin-top:16px">
                <button class="btn btn-ghost cancel-add">Cancel</button>
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
                    <p class="servings-prompt">How many servings?</p>
                    <div class="servings-picker">
                        <button class="btn btn-secondary servings-dec">&minus;</button>
                        <span class="servings-value">${defaultServings}</span>
                        <button class="btn btn-secondary servings-inc">+</button>
                    </div>
                    <div class="form-actions" style="margin-top:16px">
                        <button class="btn btn-primary confirm-add">Add to calendar</button>
                        <button class="btn btn-ghost cancel-add">Cancel</button>
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
            <h3>Add note for ${dayLabel} ${meal}</h3>
            <textarea class="input note-input" rows="3" placeholder="e.g. Leftovers, Eat out, Salad…" autofocus></textarea>
            <div class="form-actions" style="margin-top:16px">
                <button class="btn btn-primary confirm-note">Add to calendar</button>
                <button class="btn btn-ghost cancel-add">Cancel</button>
            </div>`;

        modal.querySelector(".cancel-add").addEventListener("click", () => modal.remove());
        modal.querySelector(".confirm-note").addEventListener("click", async () => {
            const note = modal.querySelector(".note-input").value.trim();
            if (!note) { alert("Please enter a note."); return; }
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

// ── Shopping list ──
function renderShoppingWeeks() {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const gridDates = getCalendarGridDates(year, month);
    const monthDates = gridDates.filter(d => d.getMonth() === month);

    // Group by ISO week (Mon-Sun)
    const weeks = [];
    let currentWeek = [];
    monthDates.forEach((d, i) => {
        currentWeek.push(d);
        const dayOfWeek = d.getDay() === 0 ? 6 : d.getDay() - 1; // Mon=0
        if (dayOfWeek === 6 || i === monthDates.length - 1) {
            weeks.push([...currentWeek]);
            currentWeek = [];
        }
    });

    const container = $("#shopping-weeks");
    container.innerHTML = weeks.map((w, i) => {
        const start = w[0];
        const end = w[w.length - 1];
        const startLabel = start.toLocaleDateString(undefined, { day: "numeric", month: "short" });
        const endLabel = end.toLocaleDateString(undefined, { day: "numeric", month: "short" });
        return `<label class="shopping-week-check">
            <input type="checkbox" data-start="${isoDate(start)}" data-end="${isoDate(end)}" checked>
            <span>Week ${i+1}: ${startLabel} – ${endLabel}</span>
        </label>`;
    }).join("");
}

$("#btn-shopping-list").addEventListener("click", () => {
    const picker = $("#shopping-picker");
    const list = $("#shopping-list");
    if (picker.classList.contains("hidden")) {
        show(picker);
        hide(list);
    } else {
        hide(picker);
    }
});

$("#btn-generate-shopping").addEventListener("click", async () => {
    const checks = $$("#shopping-weeks input[type=checkbox]:checked");
    if (checks.length === 0) {
        alert("Please select at least one week.");
        return;
    }
    // Find min start and max end
    let minStart = null, maxEnd = null;
    checks.forEach((cb) => {
        const s = cb.dataset.start;
        const e = cb.dataset.end;
        if (!minStart || s < minStart) minStart = s;
        if (!maxEnd || e > maxEnd) maxEnd = e;
    });

    const res = await fetch(`${API}/api/shopping-list?start=${minStart}&end=${maxEnd}`);
    const items = await res.json();
    const list = $("#shopping-items");
    if (items.length === 0) {
        list.innerHTML = "<li>No ingredients – add some meals to your calendar first!</li>";
    } else {
        list.innerHTML = items.map((i) =>
            `<li><label class="shopping-item"><input type="checkbox"><span>${escHtml(i)}</span></label></li>`
        ).join("");
    }
    hide($("#shopping-picker"));
    show($("#shopping-list"));
});

// Add custom item to shopping list
function addShoppingItem(text) {
    if (!text.trim()) return;
    const li = document.createElement("li");
    li.innerHTML = `<label class="shopping-item"><input type="checkbox"><span>${escHtml(text.trim())}</span></label>`;
    $("#shopping-items").appendChild(li);
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
    const items = [];
    $("#shopping-items").querySelectorAll(".shopping-item").forEach((label) => {
        const cb = label.querySelector("input[type=checkbox]");
        if (!cb.checked) items.push(label.querySelector("span").textContent);
    });
    if (items.length === 0) {
        $("#btn-copy-shopping").textContent = "✅ All done!";
        setTimeout(() => $("#btn-copy-shopping").textContent = "📋 Copy to Clipboard", 2000);
        return;
    }
    try {
        await navigator.clipboard.writeText(items.join("\n"));
        $("#btn-copy-shopping").textContent = `✅ ${items.length} items copied!`;
    } catch {
        const ta = document.createElement("textarea");
        ta.value = items.join("\n");
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        $("#btn-copy-shopping").textContent = `✅ ${items.length} items copied!`;
    }
    setTimeout(() => $("#btn-copy-shopping").textContent = "📋 Copy to Clipboard", 2500);
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
            html += `<h4>📅 Proposed Meal Plan</h4>`;
            html += `<div class="chat-plan-grid">`;
            const planDays = [...new Set(mp.entries.map(e => e.day))].sort();
            planDays.forEach((day) => {
                const dayEntries = mp.entries.filter((e) => e.day === day);
                if (dayEntries.length === 0) return;
                const d = new Date(day + "T00:00:00");
                const dayName = d.toLocaleDateString(undefined, { weekday: "short" });
                const dateNum = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
                html += `<div class="chat-plan-day">`;
                html += `<div class="chat-day-heading"><span class="chat-day-name">${dayName}</span><span class="chat-day-date">${dateNum}</span></div>`;
                dayEntries.forEach((e) => {
                    const globalIdx = mp.entries.indexOf(e);
                    const r = e.recipe || {};
                    const timeStr = r.total_time ? `<span class="cpe-time">${escHtml(r.total_time)}</span>` : "";
                    html += `<div class="chat-plan-entry" draggable="true" data-mp-entry-idx="${globalIdx}"
                                  data-recipe-json="${escHtml(JSON.stringify(r))}"
                                  data-day="${e.day}" data-meal="${e.meal}">`;
                    html += `<span class="cpe-meal cpe-meal--${e.meal}">${e.meal}</span>`;
                    html += `<a href="#" class="cpe-title" data-entry-idx="${globalIdx}">${escHtml(r.title || "?")}</a>`;
                    html += timeStr;
                    html += `<button class="cpe-regen" title="Regenerate" data-entry-idx="${globalIdx}">↻</button>`;
                    html += `</div>`;
                });
                html += `</div>`;
            });
            html += `</div>`;
            html += `<div class="chat-plan-actions">`;
            html += `<button class="btn btn-primary create-chat-plan">📅 Add to Calendar</button>`;
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
                        <p class="meta">${r.total_time || ""} ${r.servings ? "· " + r.servings : ""}${r.source_url ? ` · <a href="${r.source_url}" target="_blank">Source ↗</a>` : ""}</p>
                        <details><summary>Ingredients</summary>
                            <ul>${(r.ingredients || []).map((i) => `<li>${escHtml(i)}</li>`).join("")}</ul>
                        </details>
                        <details><summary>Instructions</summary>
                            <ol>${(r.instructions || []).map((s) => `<li>${escHtml(s)}</li>`).join("")}</ol>
                        </details>
                        <button class="btn btn-primary btn-small save-chat-recipe" data-chat-idx="${idx}">💾 Save Recipe</button>
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
                btn.textContent = "✅ Saved!";
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
                createBtn.textContent = "Adding…";
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
                        createBtn.textContent = `✅ ${result.entries_created} meals added!`;
                        bubble.querySelectorAll(".chat-plan-entry").forEach((el) => {
                            if (!el.querySelector(".chat-saved-badge")) {
                                const badge = document.createElement("span");
                                badge.className = "chat-saved-badge";
                                badge.textContent = "✅";
                                el.appendChild(badge);
                            }
                        });
                        appendBubble("assistant", `<p>Your meals have been added to the calendar and all recipes saved to your collection! Head to <strong>Calendar</strong> to see them. 🎉</p>`);
                    }
                } catch (err) {
                    createBtn.textContent = "⚠️ Failed";
                }
            });
        }
    } catch (err) {
        typing.remove();
        appendBubble("assistant", `<p>⚠️ Something went wrong. Please try again.</p>`);
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
            <p class="meta">${r.total_time || ""}${r.servings ? " · " + r.servings : ""}${r.source_url ? ` · <a href="${r.source_url}" target="_blank">Source ↗</a>` : ""}</p>
            ${r.categories && r.categories.length ? `<div style="margin-bottom:12px">${r.categories.map(c => `<span class="category-pill" style="font-size:11px;padding:2px 8px;margin-right:4px">${escHtml(c)}</span>`).join("")}</div>` : ""}
            <h4>Ingredients</h4>
            <ul>${(r.ingredients || []).map(i => `<li>${escHtml(i)}</li>`).join("")}</ul>
            <h4>Method</h4>
            <ol>${(r.instructions || []).map(s => `<li>${escHtml(s)}</li>`).join("")}</ol>
            ${hasMethods ? `<div style="margin-top:16px"><button class="btn btn-start-cooking btn-small chat-start-cooking">🍳 Start Cooking</button></div>` : ""}
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
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
        $("#precook-duration").textContent = `⏱ Total time: ${durStr}`;
        $("#precook-duration").style.display = "";
    } else {
        $("#precook-duration").textContent = "⏱ No cook time specified";
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
        hintEl.textContent = mins ? "Pick a time above, or skip" : "No cook time on this recipe — you can still set a target";
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
        $("#precook-start-time").textContent = `${cookingStartTimeStr} (${lateByMins} min ago — start now!)`;
    } else {
        resultEl.classList.remove("precook-result--late");
        const inMins = Math.round((startAt - now) / 60000);
        if (inMins > 0) {
            $("#precook-start-time").textContent = `${cookingStartTimeStr} (in ${inMins} min)`;
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
        alert("This recipe has no steps to cook!");
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
        $("#cooking-start-time-text").textContent = `Start at ${cookingStartTimeStr}`;
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
                $("#cooking-start-time-text").textContent = `Ready by ${timeVal} — start now!`;
            } else {
                startBanner.classList.remove("is-late");
                $("#cooking-start-time-text").textContent = `Start at ${cookingStartTimeStr} · Ready by ${timeVal}`;
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

    $("#cooking-step-label").textContent = `Step ${step + 1} of ${total}`;

    const textEl = $("#cooking-step-text");
    textEl.textContent = steps[step];

    $("#cooking-prev").disabled = step === 0;

    if (step === total - 1) {
        $("#cooking-next").textContent = "✅ Done!";
        $("#cooking-next").classList.add("cooking-finish");
    } else {
        $("#cooking-next").textContent = "Next →";
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
        return dates.map(d => new Date(d + "T00:00:00").toLocaleDateString(undefined, opts)).join(", ");
    }
    const first = new Date(dates[0] + "T00:00:00").toLocaleDateString(undefined, opts);
    const last = new Date(dates[dates.length - 1] + "T00:00:00").toLocaleDateString(undefined, { ...opts, year: "numeric" });
    return `${first} – ${last} (${dates.length} days)`;
}

// Initial load
loadCalendar();
