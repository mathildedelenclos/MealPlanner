// ═══════════════════════════════════
// i18n – Internationalization
// ═══════════════════════════════════

let currentLang = "en";

const TRANSLATIONS = {
  en: {
    "app.title": "Meal Planner",

    // Navigation
    "nav.calendar": "Calendar",
    "nav.recipes": "Recipes",
    "nav.favourites": "Favourites",
    "nav.shopping": "Shopping",
    "nav.chat": "AI Chef",
    "nav.settings": "Settings",

    // Calendar
    "calendar.title": "Calendar",
    "calendar.today": "Today",
    "calendar.week": "Week",
    "calendar.month": "Month",
    "calendar.lunch": "lunch",
    "calendar.dinner": "dinner",
    "calendar.srvBadge": "{{n}}srv",
    "calendar.addMealFor": "Add {{meal}} for {{day}}",
    "calendar.addNoteFor": "Add note for {{day}} {{meal}}",
    "calendar.addToCalendar": "Add to Calendar",
    "calendar.addToCalendarShort": "Add to calendar",
    "calendar.adding": "Adding\u2026",
    "calendar.pickRecipe": "Pick a Recipe",
    "calendar.addNote": "Add a Note",
    "calendar.searchRecipes": "Search recipes\u2026",
    "calendar.noRecipes": "No recipes available. Add some recipes first!",
    "calendar.howManyServings": "How many servings?",
    "calendar.notePlaceholder": "e.g. Leftovers, Eat out, Salad\u2026",
    "calendar.pleaseEnterNote": "Please enter a note.",
    "calendar.deletedRecipe": "Deleted recipe",

    // Context menu
    "ctx.servings": "Servings",
    "ctx.edit": "Edit",
    "ctx.copyTo": "Copy to\u2026",
    "ctx.remove": "Remove",

    // Copy modal
    "copy.title": "Copy to\u2026",
    "copy.hint": "Select one or more slots, then press Copy.",
    "copy.button": "Copy",
    "copy.copying": "Copying\u2026",

    // Edit note
    "editNote.title": "Edit Note",
    "editNote.save": "Save",

    // Recipes
    "recipes.title": "My Recipes",
    "recipes.addRecipe": "+ Add Recipe",
    "recipes.manualEntry": "Manual Entry",
    "recipes.importUrl": "Import from URL",
    "recipes.importFile": "Import File",
    "recipes.searchPlaceholder": "Search by name, ingredient, or category\u2026",
    "recipes.searchCategories": "Search within selected categories\u2026",
    "recipes.maxTime": "Max time: ",
    "recipes.timeAny": "Any",
    "recipes.timeNone": "No time set",
    "recipes.sort": "Sort:",
    "recipes.sortNewest": "Newest first",
    "recipes.sortOldest": "Oldest first",
    "recipes.sortAZ": "A \u2192 Z",
    "recipes.sortZA": "Z \u2192 A",
    "recipes.sortFastest": "Fastest first",
    "recipes.sortSlowest": "Slowest first",
    "recipes.import": "Import",
    "recipes.fetching": "Fetching recipe\u2026",
    "recipes.fetchingVideo": "Extracting recipe from video\u2026 This may take a moment.",
    "recipes.importUrlPlaceholder": "Paste a URL \u2014 recipe site, TikTok, or Instagram\u2026",
    "recipes.ingredients": "Ingredients",
    "recipes.method": "Method",
    "recipes.saveToMyRecipes": "Save to My Recipes",
    "recipes.titlePlaceholder": "Recipe title",
    "recipes.categoryPlaceholder": "Add a category\u2026",
    "recipes.servingsPlaceholder": "Servings (e.g. 4 servings)",
    "recipes.timePlaceholder": "Total time (e.g. 30 min)",
    "recipes.ingredientsPlaceholder": "Ingredients (one per line)",
    "recipes.instructionsPlaceholder": "Instructions (one step per line)",
    "recipes.saveRecipe": "Save Recipe",
    "recipes.saveChanges": "Save Changes",
    "recipes.saving": "Saving\u2026",
    "recipes.editRecipe": "Edit Recipe",
    "recipes.edit": "Edit",
    "recipes.deleteRecipe": "Delete Recipe",
    "recipes.removeFromCalendar": "Remove from Calendar",
    "recipes.startCooking": "Start Cooking",
    "recipes.source": "Source \u2197",
    "recipes.servingsScaled": "{{count}} servings (scaled)",
    "recipes.validationError": "Please provide a title and at least one ingredient.",
    "recipes.modifyWithAI": "Modify with AI",
    "recipes.chipHealthier": "Healthier",
    "recipes.chipKidFriendly": "Kid-friendly",
    "recipes.chipQuicker": "Quicker",
    "recipes.modifyPlaceholder": "Or describe a change\u2026",
    "recipes.modifySend": "Go",
    "recipes.modifyLoading": "Thinking\u2026",
    "recipes.modifyError": "Something went wrong. Please try again.",
    "recipes.saveAsNew": "Save as new recipe",
    "recipes.replaceOriginal": "Replace original",
    "recipes.confirmDelete": "Delete this recipe?",
    "recipes.emptyNone": "No recipes yet. Add one manually or import from a URL!",
    "recipes.emptySearch": "No recipes match your search.",
    "recipes.emptyCategory": "No recipes match those categories.",
    "recipes.emptyDefault": "No recipes yet.",
    "recipes.importedSuccess_one": "Imported {{count}} recipe! \u2705",
    "recipes.importedSuccess_other": "Imported {{count}} recipes! \u2705",
    "recipes.importError": "Import error: {{error}}",
    "recipes.importFailed": "Failed to import file.",
    "recipes.recipeSaved": "Recipe saved! \u2705",
    "recipes.saveError": "Failed to save recipe. Please try again.",
    "recipes.fetchError": "Failed to fetch recipe. Please check the URL.",
    "recipes.createCategory": "+ Create \"{{name}}\"",
    "recipes.switchView": "Switch view",

    // Favourites
    "favourites.toggle": "Toggle favourite",
    "favourites.empty": "No favourites yet. Tap the heart on a recipe to add it here!",

    // Bulk actions
    "bulk.selected": "{{count}} selected",
    "bulk.selectAll": "Select All",
    "bulk.deselectAll": "Deselect All",
    "bulk.deleteSelected": "Delete Selected",
    "bulk.confirmDelete_one": "Delete {{count}} recipe? This cannot be undone.",
    "bulk.confirmDelete_other": "Delete {{count}} recipes? This cannot be undone.",

    // Shopping
    "shopping.title": "Shopping List",
    "shopping.copy": "Copy",
    "shopping.clearAll": "Clear All",
    "shopping.addPlaceholder": "Add an item\u2026",
    "shopping.addButton": "+ Add",
    "shopping.empty": "No ingredients this week.<br>Add some meals to your calendar first!",
    "shopping.thisWeek": "This week",
    "shopping.nextWeek": "Next week",
    "shopping.allDone": "All done!",
    "shopping.itemsCopied_one": "{{count}} item copied!",
    "shopping.itemsCopied_other": "{{count}} items copied!",
    "shopping.copyTooltip": "Copy unchecked items to clipboard",
    "shopping.clearTooltip": "Clear all items",
    "shopping.previousWeek": "Previous week",
    "shopping.nextWeekNav": "Next week",

    // Shopping categories
    "category.fruitsVeg": "Fruits & Vegetables",
    "category.meatFish": "Meat & Fish",
    "category.dairyEggs": "Dairy & Eggs",
    "category.bakeryBread": "Bakery & Bread",
    "category.pastaRiceGrains": "Pasta, Rice & Grains",
    "category.tinsJars": "Tins & Jars",
    "category.oilsSauces": "Oils, Sauces & Condiments",
    "category.herbsSpices": "Herbs, Spices & Seasonings",
    "category.other": "Other",

    // AI Chat
    "chat.title": "AI Chef",
    "chat.welcome": "Hey! \uD83D\uDC4B I'm your AI Chef. Ask me to suggest meals, plan your week, or get creative with ingredients you have on hand!",
    "chat.placeholder": "e.g. Suggest 3 healthy dinners for this week\u2026",
    "chat.send": "Send",
    "chat.error": "Something went wrong. Please try again.",
    "chat.proposedMealPlan": "Proposed Meal Plan",
    "chat.addToCalendar": "Add to Calendar",
    "chat.saveRecipe": "Save Recipe",
    "chat.saved": "Saved!",
    "chat.mealsAdded": "\u2705 {{count}} meals added!",
    "chat.planAdded": "Your meals have been added to the calendar and all recipes saved to your collection! Head to <strong>Calendar</strong> to see them. \uD83C\uDF89",
    "chat.failed": "Failed",

    // Settings
    "settings.title": "Settings",
    "settings.weekStart": "Week starts on",
    "settings.monday": "Monday",
    "settings.sunday": "Sunday",
    "settings.saturday": "Saturday",
    "settings.language": "Language",
    "settings.langEnglish": "English",
    "settings.langFrench": "Fran\u00E7ais",

    // Auth
    "auth.signInGoogle": "Sign in with Google",
    "auth.signInFacebook": "Sign in with Facebook",
    "auth.signInPrompt": "Sign in to access your meal planner",
    "auth.logout": "Log out",

    // Cooking mode
    "cooking.exit": "Exit",
    "cooking.ingredients": "Ingredients",
    "cooking.screenOn": "Screen On",
    "cooking.stepOf": "Step {{step}} of {{total}}",
    "cooking.previous": "\u2190 Previous",
    "cooking.next": "Next \u2192",
    "cooking.done": "Done!",
    "cooking.hint": "Use \u2190 \u2192 arrow keys or swipe to navigate",
    "cooking.noSteps": "This recipe has no steps to cook!",

    // Pre-cook
    "precook.readyTime": "What time should it be ready?",
    "precook.totalTime": "Total time: {{duration}}",
    "precook.noTime": "No cook time specified",
    "precook.startAt": "Start cooking at ",
    "precook.skipHint": "Optional \u2014 skip if you don't need a timer",
    "precook.pickTimeHint": "Pick a time above, or skip",
    "precook.noTimeHint": "No cook time on this recipe \u2014 you can still set a target",
    "precook.letsGo": "Let's Cook!",
    "precook.lateStart": "{{time}} ({{mins}} min ago \u2014 start now!)",
    "precook.inMinutes": "{{time}} (in {{mins}} min)",
    "precook.startAtBanner": "Start at {{start}} \u00B7 Ready by {{ready}}",
    "precook.readyByNow": "Ready by {{time}} \u2014 start now!",
    "precook.startAtSimple": "Start at {{time}}",

    // Common
    "common.cancel": "Cancel",

    // Days
    "day.sun": "Sun", "day.mon": "Mon", "day.tue": "Tue", "day.wed": "Wed",
    "day.thu": "Thu", "day.fri": "Fri", "day.sat": "Sat",
  },

  fr: {
    "app.title": "Planificateur de repas",

    // Navigation
    "nav.calendar": "Calendrier",
    "nav.recipes": "Recettes",
    "nav.favourites": "Favoris",
    "nav.shopping": "Courses",
    "nav.chat": "Chef IA",
    "nav.settings": "Param\u00e8tres",

    // Calendar
    "calendar.title": "Calendrier",
    "calendar.today": "Aujourd'hui",
    "calendar.week": "Semaine",
    "calendar.month": "Mois",
    "calendar.lunch": "d\u00e9jeuner",
    "calendar.dinner": "d\u00eener",
    "calendar.srvBadge": "{{n}}prt",
    "calendar.addMealFor": "Ajouter {{meal}} pour {{day}}",
    "calendar.addNoteFor": "Ajouter une note pour {{day}} {{meal}}",
    "calendar.addToCalendar": "Ajouter au calendrier",
    "calendar.addToCalendarShort": "Ajouter au calendrier",
    "calendar.adding": "Ajout en cours\u2026",
    "calendar.pickRecipe": "Choisir une recette",
    "calendar.addNote": "Ajouter une note",
    "calendar.searchRecipes": "Chercher des recettes\u2026",
    "calendar.noRecipes": "Aucune recette disponible. Ajoutez-en d'abord\u00a0!",
    "calendar.howManyServings": "Combien de portions\u00a0?",
    "calendar.notePlaceholder": "ex. Restes, Manger dehors, Salade\u2026",
    "calendar.pleaseEnterNote": "Veuillez saisir une note.",
    "calendar.deletedRecipe": "Recette supprim\u00e9e",

    // Context menu
    "ctx.servings": "Portions",
    "ctx.edit": "Modifier",
    "ctx.copyTo": "Copier vers\u2026",
    "ctx.remove": "Supprimer",

    // Copy modal
    "copy.title": "Copier vers\u2026",
    "copy.hint": "S\u00e9lectionnez un ou plusieurs cr\u00e9neaux, puis appuyez sur Copier.",
    "copy.button": "Copier",
    "copy.copying": "Copie en cours\u2026",

    // Edit note
    "editNote.title": "Modifier la note",
    "editNote.save": "Enregistrer",

    // Recipes
    "recipes.title": "Mes recettes",
    "recipes.addRecipe": "+ Ajouter",
    "recipes.manualEntry": "Saisie manuelle",
    "recipes.importUrl": "Importer depuis une URL",
    "recipes.importFile": "Importer un fichier",
    "recipes.searchPlaceholder": "Chercher par nom, ingr\u00e9dient ou cat\u00e9gorie\u2026",
    "recipes.searchCategories": "Chercher dans les cat\u00e9gories s\u00e9lectionn\u00e9es\u2026",
    "recipes.maxTime": "Temps max\u00a0: ",
    "recipes.timeAny": "Tous",
    "recipes.timeNone": "Pas de temps",
    "recipes.sort": "Trier\u00a0:",
    "recipes.sortNewest": "Plus r\u00e9cents",
    "recipes.sortOldest": "Plus anciens",
    "recipes.sortAZ": "A \u2192 Z",
    "recipes.sortZA": "Z \u2192 A",
    "recipes.sortFastest": "Plus rapides",
    "recipes.sortSlowest": "Plus lents",
    "recipes.import": "Importer",
    "recipes.fetching": "R\u00e9cup\u00e9ration\u2026",
    "recipes.fetchingVideo": "Extraction de la recette depuis la vid\u00e9o\u2026 Cela peut prendre un moment.",
    "recipes.importUrlPlaceholder": "Collez une URL \u2014 site de recettes, TikTok ou Instagram\u2026",
    "recipes.ingredients": "Ingr\u00e9dients",
    "recipes.method": "Pr\u00e9paration",
    "recipes.saveToMyRecipes": "Enregistrer dans mes recettes",
    "recipes.titlePlaceholder": "Titre de la recette",
    "recipes.categoryPlaceholder": "Ajouter une cat\u00e9gorie\u2026",
    "recipes.servingsPlaceholder": "Portions (ex. 4 portions)",
    "recipes.timePlaceholder": "Temps total (ex. 30 min)",
    "recipes.ingredientsPlaceholder": "Ingr\u00e9dients (un par ligne)",
    "recipes.instructionsPlaceholder": "Instructions (une \u00e9tape par ligne)",
    "recipes.saveRecipe": "Enregistrer la recette",
    "recipes.saveChanges": "Enregistrer",
    "recipes.saving": "Enregistrement\u2026",
    "recipes.editRecipe": "Modifier la recette",
    "recipes.edit": "Modifier",
    "recipes.deleteRecipe": "Supprimer la recette",
    "recipes.removeFromCalendar": "Retirer du calendrier",
    "recipes.startCooking": "Cuisiner",
    "recipes.source": "Source \u2197",
    "recipes.servingsScaled": "{{count}} portions (ajust\u00e9)",
    "recipes.validationError": "Veuillez fournir un titre et au moins un ingr\u00e9dient.",
    "recipes.modifyWithAI": "Modifier avec l'IA",
    "recipes.chipHealthier": "Plus sain",
    "recipes.chipKidFriendly": "Pour enfants",
    "recipes.chipQuicker": "Plus rapide",
    "recipes.modifyPlaceholder": "Ou d\u00e9crivez un changement\u2026",
    "recipes.modifySend": "Go",
    "recipes.modifyLoading": "R\u00e9flexion\u2026",
    "recipes.modifyError": "Quelque chose s'est mal pass\u00e9. Veuillez r\u00e9essayer.",
    "recipes.saveAsNew": "Enregistrer comme nouvelle recette",
    "recipes.replaceOriginal": "Remplacer l'originale",
    "recipes.confirmDelete": "Supprimer cette recette\u00a0?",
    "recipes.emptyNone": "Aucune recette. Ajoutez-en manuellement ou importez depuis une URL\u00a0!",
    "recipes.emptySearch": "Aucune recette ne correspond \u00e0 votre recherche.",
    "recipes.emptyCategory": "Aucune recette dans ces cat\u00e9gories.",
    "recipes.emptyDefault": "Aucune recette.",
    "recipes.importedSuccess_one": "{{count}} recette import\u00e9e\u00a0! \u2705",
    "recipes.importedSuccess_other": "{{count}} recettes import\u00e9es\u00a0! \u2705",
    "recipes.importError": "Erreur d'import\u00a0: {{error}}",
    "recipes.importFailed": "\u00c9chec de l'importation.",
    "recipes.recipeSaved": "Recette enregistr\u00e9e\u00a0! \u2705",
    "recipes.saveError": "\u00c9chec de l'enregistrement. Veuillez r\u00e9essayer.",
    "recipes.fetchError": "Impossible de r\u00e9cup\u00e9rer la recette. V\u00e9rifiez l'URL.",
    "recipes.createCategory": "+ Cr\u00e9er \u00ab\u00a0{{name}}\u00a0\u00bb",
    "recipes.switchView": "Changer la vue",

    // Favourites
    "favourites.toggle": "Basculer en favori",
    "favourites.empty": "Pas encore de favoris. Appuyez sur le c\u0153ur d'une recette pour l'ajouter ici\u00a0!",

    // Bulk actions
    "bulk.selected": "{{count}} s\u00e9lectionn\u00e9(s)",
    "bulk.selectAll": "Tout s\u00e9lectionner",
    "bulk.deselectAll": "Tout d\u00e9s\u00e9lectionner",
    "bulk.deleteSelected": "Supprimer la s\u00e9lection",
    "bulk.confirmDelete_one": "Supprimer {{count}} recette\u00a0? Cette action est irr\u00e9versible.",
    "bulk.confirmDelete_other": "Supprimer {{count}} recettes\u00a0? Cette action est irr\u00e9versible.",

    // Shopping
    "shopping.title": "Liste de courses",
    "shopping.copy": "Copier",
    "shopping.clearAll": "Tout effacer",
    "shopping.addPlaceholder": "Ajouter un article\u2026",
    "shopping.addButton": "+ Ajouter",
    "shopping.empty": "Aucun ingr\u00e9dient cette semaine.<br>Ajoutez d'abord des repas \u00e0 votre calendrier\u00a0!",
    "shopping.thisWeek": "Cette semaine",
    "shopping.nextWeek": "Semaine prochaine",
    "shopping.allDone": "Termin\u00e9\u00a0!",
    "shopping.itemsCopied_one": "{{count}} article copi\u00e9\u00a0!",
    "shopping.itemsCopied_other": "{{count}} articles copi\u00e9s\u00a0!",
    "shopping.copyTooltip": "Copier les articles non coch\u00e9s",
    "shopping.clearTooltip": "Effacer tous les articles",
    "shopping.previousWeek": "Semaine pr\u00e9c\u00e9dente",
    "shopping.nextWeekNav": "Semaine suivante",

    // Shopping categories
    "category.fruitsVeg": "Fruits & L\u00e9gumes",
    "category.meatFish": "Viandes & Poissons",
    "category.dairyEggs": "Produits laitiers & \u0152ufs",
    "category.bakeryBread": "Boulangerie & Pain",
    "category.pastaRiceGrains": "P\u00e2tes, Riz & C\u00e9r\u00e9ales",
    "category.tinsJars": "Conserves & Bocaux",
    "category.oilsSauces": "Huiles, Sauces & Condiments",
    "category.herbsSpices": "Herbes, \u00c9pices & Assaisonnements",
    "category.other": "Autre",

    // AI Chat
    "chat.title": "Chef IA",
    "chat.welcome": "Salut\u00a0! \uD83D\uDC4B Je suis votre Chef IA. Demandez-moi de sugg\u00e9rer des repas, planifier votre semaine ou de cr\u00e9er des recettes avec les ingr\u00e9dients que vous avez\u00a0!",
    "chat.placeholder": "ex. Sugg\u00e8re 3 d\u00eeners sains pour cette semaine\u2026",
    "chat.send": "Envoyer",
    "chat.error": "Une erreur est survenue. Veuillez r\u00e9essayer.",
    "chat.proposedMealPlan": "Plan de repas propos\u00e9",
    "chat.addToCalendar": "Ajouter au calendrier",
    "chat.saveRecipe": "Enregistrer",
    "chat.saved": "Enregistr\u00e9\u00a0!",
    "chat.mealsAdded": "\u2705 {{count}} repas ajout\u00e9s\u00a0!",
    "chat.planAdded": "Vos repas ont \u00e9t\u00e9 ajout\u00e9s au calendrier et toutes les recettes enregistr\u00e9es\u00a0! Rendez-vous dans <strong>Calendrier</strong> pour les voir. \uD83C\uDF89",
    "chat.failed": "\u00c9chou\u00e9",

    // Settings
    "settings.title": "Param\u00e8tres",
    "settings.weekStart": "La semaine commence le",
    "settings.monday": "Lundi",
    "settings.sunday": "Dimanche",
    "settings.saturday": "Samedi",
    "settings.language": "Langue",
    "settings.langEnglish": "English",
    "settings.langFrench": "Fran\u00e7ais",

    // Auth
    "auth.signInGoogle": "Se connecter avec Google",
    "auth.signInFacebook": "Se connecter avec Facebook",
    "auth.signInPrompt": "Connectez-vous pour acc\u00e9der \u00e0 votre planificateur de repas",
    "auth.logout": "Se d\u00e9connecter",

    // Cooking mode
    "cooking.exit": "Quitter",
    "cooking.ingredients": "Ingr\u00e9dients",
    "cooking.screenOn": "\u00c9cran actif",
    "cooking.stepOf": "\u00c9tape {{step}} sur {{total}}",
    "cooking.previous": "\u2190 Pr\u00e9c\u00e9dent",
    "cooking.next": "Suivant \u2192",
    "cooking.done": "Termin\u00e9\u00a0!",
    "cooking.hint": "Utilisez les touches \u2190 \u2192 ou balayez pour naviguer",
    "cooking.noSteps": "Cette recette n'a pas d'\u00e9tapes de pr\u00e9paration\u00a0!",

    // Pre-cook
    "precook.readyTime": "\u00c0 quelle heure doit-ce \u00eatre pr\u00eat\u00a0?",
    "precook.totalTime": "Temps total\u00a0: {{duration}}",
    "precook.noTime": "Pas de temps de cuisson sp\u00e9cifi\u00e9",
    "precook.startAt": "Commencer \u00e0 cuisiner \u00e0 ",
    "precook.skipHint": "Facultatif \u2014 passez si vous n'avez pas besoin de minuteur",
    "precook.pickTimeHint": "Choisissez une heure ci-dessus, ou passez",
    "precook.noTimeHint": "Pas de temps de cuisson \u2014 vous pouvez quand m\u00eame d\u00e9finir un objectif",
    "precook.letsGo": "C'est parti\u00a0!",
    "precook.lateStart": "{{time}} (il y a {{mins}} min \u2014 commencez maintenant\u00a0!)",
    "precook.inMinutes": "{{time}} (dans {{mins}} min)",
    "precook.startAtBanner": "Commencer \u00e0 {{start}} \u00b7 Pr\u00eat \u00e0 {{ready}}",
    "precook.readyByNow": "Pr\u00eat \u00e0 {{time}} \u2014 commencez maintenant\u00a0!",
    "precook.startAtSimple": "Commencer \u00e0 {{time}}",

    // Common
    "common.cancel": "Annuler",

    // Days
    "day.sun": "Dim", "day.mon": "Lun", "day.tue": "Mar", "day.wed": "Mer",
    "day.thu": "Jeu", "day.fri": "Ven", "day.sat": "Sam",
  },
};

// ── Translation function ──

function t(key, params) {
  const dict = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
  const fallback = TRANSLATIONS.en;
  let resolved;

  if (params && params.count !== undefined) {
    const suffix = params.count === 1 ? "_one" : "_other";
    resolved = dict[key + suffix] || fallback[key + suffix] || dict[key] || fallback[key] || key;
  } else {
    resolved = dict[key] || fallback[key] || key;
  }

  if (params && typeof resolved === "string") {
    resolved = resolved.replace(/\{\{(\w+)\}\}/g, (_, name) =>
      params[name] !== undefined ? String(params[name]) : `{{${name}}}`
    );
  }
  return resolved;
}

function setLanguage(lang) {
  if (!TRANSLATIONS[lang]) return;
  currentLang = lang;
  document.documentElement.lang = lang;
}

function getLanguage() {
  return currentLang;
}

function getLocale() {
  return currentLang === "fr" ? "fr-FR" : "en-GB";
}

function tMeal(mealType) {
  return t("calendar." + mealType);
}

const CATEGORY_KEY_MAP = {
  "Fruits & Vegetables": "category.fruitsVeg",
  "Meat & Fish": "category.meatFish",
  "Dairy & Eggs": "category.dairyEggs",
  "Bakery & Bread": "category.bakeryBread",
  "Pasta, Rice & Grains": "category.pastaRiceGrains",
  "Tins & Jars": "category.tinsJars",
  "Oils, Sauces & Condiments": "category.oilsSauces",
  "Herbs, Spices & Seasonings": "category.herbsSpices",
  "Other": "category.other",
};

function tCategory(englishName) {
  const key = CATEGORY_KEY_MAP[englishName];
  return key ? t(key) : englishName;
}

function translatePage() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    const translated = t(key);
    if (translated.includes("<")) {
      el.innerHTML = translated;
    } else {
      el.textContent = translated;
    }
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.title = t("app.title");
}
