// CityTaste — Ottawa (CSV OSM) + Landing + Results Search + Thumbnails
// - Validation stricte du bouton Explorer
// - Autocomplete cuisine dynamique (jap -> japanese, etc.)
// - Filtre cuisine précis + catégories larges
// - Tri amélioré (pertinence / note / distance)
// - "Pourquoi recommandé" plus intelligent
// - Distance calculée depuis le centre d’Ottawa OU la position actuelle de l’utilisateur
// - Option FR / EN
// - Chatbot CityTaste intégré
// IMPORTANT: lancer via Live Server / http.server pour que fetch CSV marche
const CSV_CANDIDATE_PATHS = [ "data/processed/ottawa_places_enriched_google_photos.csv",
  "data/processed/ottawa_places_enriched_cuisine_final.csv",
];

const CSV_BASE_PATH = "data/processed/ottawa_places_enriched_google_photos.csv";
const CSV_CUISINE_PATH = "data/processed/ottawa_places_enriched_cuisine_final.csv";

/**
 * Colonnes qu'on veut prendre SEULEMENT du 2e fichier
 * Ajoute / enlève des colonnes ici si besoin
 */
const CUISINE_FIELDS_FROM_SECOND = [
  "cuisine",
  "cuisine_list",
  "cuisine_norm",
  "cuisine_original",
  "cuisine_source_url",
  "cuisine_enrichment_confidence",
  "cuisine_enrichment_method",
  "cuisine_updated"
];

/**
 * Charge un CSV puis le parse avec ta fonction parseCSV existante
 */
async function fetchCSVRows(path) {
  const res = await fetch(path, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`Impossible de charger le fichier : ${path}`);
  }

  const text = await res.text();
  return parseCSV(text); // ta fonction actuelle de parsing
}

/**
 * Nettoie une valeur texte
 */
function cleanValue(value) {
  return (value ?? "").toString().trim();
}

/**
 * Détermine si une valeur est utilisable
 * Ici, "not_applicable" est accepté car dans ton fichier final
 * il peut être volontairement mis pour certains lieux.
 */
function isUsableCuisineValue(value) {
  const v = cleanValue(value).toLowerCase();

  return v !== "" && v !== "unknown" && v !== "null" && v !== "undefined";
}

/**
 * Construit une clé de correspondance entre les deux fichiers
 * On essaie d'être plus fiable avec :
 * - name
 * - place_type
 * - lat
 * - lon
 * - address
 */
function buildPlaceKey(row) {
  const name = cleanValue(row.name).toLowerCase();
  const placeType = cleanValue(row.place_type).toLowerCase();
  const lat = cleanValue(row.lat).toLowerCase();
  const lon = cleanValue(row.lon).toLowerCase();
  const address = cleanValue(row.address || row.addr_full).toLowerCase();

  return [name, placeType, lat, lon, address].join("||");
}

/**
 * Copie seulement les colonnes cuisine du 2e fichier
 * vers la ligne du 1er fichier
 */
function mergeCuisineFields(baseRow, cuisineRow) {
  const merged = { ...baseRow };

  for (const field of CUISINE_FIELDS_FROM_SECOND) {
    const newValue = cuisineRow[field];
    const oldValue = baseRow[field];

    if (isUsableCuisineValue(newValue)) {
      merged[field] = newValue;
    } else if (oldValue !== undefined) {
      merged[field] = oldValue;
    }
  }

  return merged;
}

/**
 * Charge le fichier principal + le fichier cuisine,
 * puis fusionne seulement les champs cuisine
 */
async function loadPlacesWithCuisineMerge() {
  const baseRows = await fetchCSVRows(CSV_BASE_PATH);
  const cuisineRows = await fetchCSVRows(CSV_CUISINE_PATH);

  const cuisineMap = new Map();

  for (const row of cuisineRows) {
    const key = buildPlaceKey(row);

    if (cleanValue(key).replace(/\|/g, "") !== "") {
      cuisineMap.set(key, row);
    }
  }

  const mergedRows = baseRows.map((baseRow) => {
    const key = buildPlaceKey(baseRow);
    const cuisineRow = cuisineMap.get(key);

    if (!cuisineRow) {
      return baseRow;
    }

    return mergeCuisineFields(baseRow, cuisineRow);
  });

  return mergedRows;
}

// Centre Ottawa (fallback)
const OTTAWA_CENTER = { lat: 45.4215, lon: -75.6972 };
const DEFAULT_MAX_KM = 8;
const LANG_STORAGE_KEY = "citytaste_lang";

let PLACES = [];
let currentResultsAll = [];
let currentPrefs = null;
let cuisineOptions = [];
let activeCuisineIndex = -1;
let currentLang = localStorage.getItem(LANG_STORAGE_KEY) || "fr";

const locationState = {
  mode: "center",
  userCoords: null,
  permission: "unknown"
};

// DOM
const el = (id) => document.getElementById(id);
const clamp = (x, min, max) => Math.max(min, Math.min(max, x));

const homeView = el("homeView");
const builderView = el("builderView");
const resultsView = el("resultsView");

const btnNavHome = el("btnNavHome");
const btnNavFilters = el("btnNavFilters");
const btnLangFr = el("btnLangFr");
const btnLangEn = el("btnLangEn");

const quickSearch = el("quickSearch");
const btnExplore = el("btnExplore");
const btnAdvanced = el("btnAdvanced");
const quickSearchFeedback = el("quickSearchFeedback");

const resultsEl = el("results");
const resultsSubtitle = el("resultsSubtitle");
const countBadge = el("countBadge");
const activeFilters = el("activeFilters");

const resultsSearch = el("resultsSearch");
const btnClearResultsSearch = el("btnClearResultsSearch");
const btnBackToFilters = el("btnBackToFilters");
const btnBackToHome = el("btnBackToHome");

const btnReco = el("btnReco");
const btnReset = el("btnReset");
const filtersFeedback = el("filtersFeedback");

const dataStatus = el("dataStatus");
const dataCount = el("dataCount");
const dataNote = el("dataNote");

const kpiPlaces = el("kpiPlaces");
const kpiRestaurants = el("kpiRestaurants");
const kpiHotels = el("kpiHotels");

// Distance mode
const distanceModeCenter = el("distanceModeCenter");
const distanceModeUser = el("distanceModeUser");
const btnUseMyLocation = el("btnUseMyLocation");
const locationStatus = el("locationStatus");

// Cuisine autocomplete (nouveau HTML) + fallback select (ancien HTML)
const cuisineHidden = el("cuisine");
const cuisineInput = el("cuisineInput");
const cuisineSuggestions = el("cuisineSuggestions");

// Area autocomplete
const areaHidden = el("area");
const areaInput = el("areaInput");
const areaSuggestions = el("areaSuggestions");

// Modal
const modal = el("detailsModal");
const overlay = el("modalOverlay");
const btnCloseModal = el("btnCloseModal");

const mTitle = el("mTitle");
const mSub = el("mSub");
const mPhoto = el("mPhoto");
const mRating = el("mRating");
const mBudget = el("mBudget");
const mDistance = el("mDistance");
const mScore = el("mScore");
const mTags = el("mTags");
const mWhy = el("mWhy");
const mAddress = el("mAddress");
const mArea = el("mArea");
const mHours = el("mHours");
const mPhone = el("mPhone");
const mWebsite = el("mWebsite");
const mMaps = el("mMaps");

const translations = {
  fr: {
    navHome: "Accueil",
    navFilters: "Filtres",
    heroTitle: "Trouve ton prochain endroit à Ottawa",
    heroText: "Recherche par nom, quartier ou adresse. Ensuite, affine avec les filtres si besoin.",
    quickSearchPlaceholder: "Ex: Vanier, ByWard, Hilton, sushi, pizza...",
    explore: "Explorer",
    advancedFilters: "Filtres avancés",

    dataStatusLabel: "Statut",
    dataCountLabel: "Lieux disponibles",
    dataSourceLabel: "Source",

    preferences: "Préférences",
    placeType: "Type de lieu",
    typeAny: "Restaurant + Hébergement",
    typeRestaurant: "Restaurants seulement",
    typeHotel: "Hébergements seulement",

    cuisineCategory: "Cuisine / Catégorie",
    cuisinePlaceholder: "Ex: jap, thai, pizza, ethi...",
    cuisineHint: "Tape quelques lettres, puis clique sur la suggestion.",
    noCuisineSuggestion: "Aucune suggestion",

    budget: "Budget",
    budgetAny: "Bientôt disponible",
    budgetLow: "$ (économique)",
    budgetMid: "$$ (moyen)",
    budgetHigh: "$$$ (élevé)",
    budgetComingSoon: "Bientôt disponible",
    budgetHintText: "Ce filtre sera ajouté dans une prochaine version.",

    maxDistance: "Distance max (km)",
    distanceSource: "Source de distance",
    ottawaCenter: "Centre d’Ottawa",
    myLocation: "Ma position actuelle",
    activateLocation: "Activer ma position",

    dietary: "Contraintes alimentaires",
    dietaryComingSoon: "Bientôt disponible",
    dietaryHintText: "Ces filtres seront ajoutés lorsqu’un jeu de données fiable sera disponible.",
    veg: "Végétarien",
    halal: "Halal",
    glutenfree: "Sans gluten",

    area: "Zone / Quartier (optionnel)",
    areaPlaceholder: "Ex: Downtown, Centre-ville, St-Laurent, Vanier...",
    areaHint: "Tape quelques lettres, puis clique sur une suggestion.",
    noAreaSuggestion: "Aucune zone trouvée",

    topN: "Top-N",
    sortBy: "Trier par",
    sortScore: "Pertinence",
    sortRating: "Note",
    sortDistance: "Distance",

    recommend: "Recommander",
    reset: "Réinitialiser",

    sideText: "Clique sur un lieu dans les résultats pour afficher la fiche détaillée. Meilleurs restaurants & hébergements à Ottawa.",
    places: "Lieux",
    restaurants: "Restaurants",
    hotels: "Hébergements",

    results: "Résultats",
    backFilters: "Filtres",
    backHome: "Accueil",
    resultsSearchPlaceholder: "Rechercher dans ces résultats (nom, quartier, adresse)...",
    clear: "Effacer",

    modalTags: "Tags",
    modalWhy: "Pourquoi cette recommandation ?",
    modalInfo: "Informations",
    address: "Adresse",
    neighbourhood: "Quartier",
    hours: "Horaires",
    phone: "Téléphone",
    website: "Website",
    openMaps: "Ouvrir sur Google Maps",

    modalRatingLabel: "Note",
    modalBudgetLabel: "Budget",
    modalDistanceLabel: "Distance",
    modalScoreLabel: "Score",

    statusLoading: "Chargement…",
    statusOk: "OK",
    statusError: "Erreur",

    quickSearchEmpty: "Entre au moins un mot-clé avant de cliquer sur Explorer.",
    filtersEmpty: "Ajoute au moins un filtre avant de demander des recommandations.",
    locationNeeded: "Active d’abord votre position ou repasse au centre d’Ottawa.",
    noResults: "Aucun résultat pour cette recherche.",
    noteUnavailable: "Note non disponible",
    clickPlace: "Clique sur un lieu pour voir la fiche détaillée.",
    filteredBy: 'Filtré par : "{query}"',

    locationCenterMsg: "Distance calculée depuis le centre d’Ottawa.",
    locationUserMsg: "Distance calculée depuis votre position actuelle.",
    locationDetected: "Position détectée. La distance sera calculée depuis votre position actuelle.",
    locationDenied: "Autorisation refusée. La distance reste calculée depuis le centre d’Ottawa.",
    locationUnavailable: "La géolocalisation n’est pas disponible sur ce navigateur. Le centre d’Ottawa est utilisé.",
    locationError: "Impossible de récupérer la position. Le centre d’Ottawa est utilisé.",
    locationAsking: "Demande de localisation en cours…",

    resultsCountOne: "résultat",
    resultsCountMany: "résultats",

    searchPrefix: "Recherche",
    typePrefix: "Type",
    cuisinePrefix: "Cuisine",
    budgetPrefix: "Budget",
    distanceMaxPrefix: "Distance max",
    fromPrefix: "Depuis",
    constraintsPrefix: "Contraintes",
    areaPrefix: "Zone",

    anyDash: "—",
    allTypes: "tous",
    constraintsNone: "Bientôt disponible",

    tagWebsite: "Site web",
    tagPhone: "Téléphone",
    tagHours: "Horaires",
    tagAccessibility: "Accessibilité",
    scoreLabel: "Score",

    whyBecause: "Recommandé car",
    whySearchMatch: 'il correspond à votre recherche "{query}"',
    whyCuisineMatch: "la cuisine {cuisine} demandée est bien respectée",
    whyAreaMatch: "la zone demandée correspond",
    whyDistanceTop: "il fait partie des options les plus proches ({km} km depuis {origin})",
    whyDistance: "il se trouve à {km} km depuis {origin}",
    whyRatingTop: "sa note ressort bien ({rating}/5{count})",
    whyRatingGood: "sa bonne note renforce la recommandation ({rating}/5)",
    whyFallback: "c’est l’un des meilleurs compromis entre pertinence, distance et qualité des informations disponibles",
    cuisineExplorerTitle: "Explorer par cuisine",
    cuisineExplorerSubtitle: "Découvre rapidement les cuisines les plus présentes dans le dataset.",
    cuisineExplorerSeeAll: "Voir toutes",
    cuisineDirectoryTitle: "Toutes les cuisines",
    cuisineDirectorySubtitle: "Choisis une cuisine pour voir tous les lieux correspondants dans le dataset.",
    cuisineDirectorySearchPlaceholder: "Rechercher une cuisine...",
    cuisineDirectoryClose: "Fermer",
    cuisineDirectoryOpen: "Ouvrir cette cuisine",
    cuisineDirectoryEmpty: "Aucune cuisine trouvée",
    cuisineDirectoryCount: "{count} lieux"
  },

  en: {
    navHome: "Home",
    navFilters: "Filters",
    heroTitle: "Find your next place in Ottawa",
    heroText: "Search by name, neighbourhood, or address. Then refine with filters if needed.",
    quickSearchPlaceholder: "Ex: Vanier, ByWard, Hilton, sushi, pizza...",
    explore: "Explore",
    advancedFilters: "Advanced filters",

    dataStatusLabel: "Status",
    dataCountLabel: "Available places",
    dataSourceLabel: "Source",

    preferences: "Preferences",
    placeType: "Place type",
    typeAny: "Restaurant + Accommodation",
    typeRestaurant: "Restaurants only",
    typeHotel: "Accommodations only",

    cuisineCategory: "Cuisine / Category",
    cuisinePlaceholder: "Ex: jap, thai, pizza, ethi...",
    cuisineHint: "Type a few letters, then click a suggestion.",
    noCuisineSuggestion: "No suggestions",

    budget: "Budget",
    budgetAny: "Coming soon",
    budgetLow: "$ (budget)",
    budgetMid: "$$ (mid-range)",
    budgetHigh: "$$$ (high)",
    budgetComingSoon: "Coming soon",
    budgetHintText: "This filter will be added in a future version.",

    maxDistance: "Max distance (km)",
    distanceSource: "Distance source",
    ottawaCenter: "Ottawa center",
    myLocation: "My current location",
    activateLocation: "Enable my location",

    dietary: "Dietary constraints",
    dietaryComingSoon: "Coming soon",
    dietaryHintText: "These filters will be added when a reliable dataset becomes available.",
    veg: "Vegetarian",
    halal: "Halal",
    glutenfree: "Gluten-free",

    area: "Area / Neighbourhood (optional)",
    areaPlaceholder: "Ex: Downtown, Centretown, St-Laurent, Vanier...",
    areaHint: "Type a few letters, then click a suggestion.",
    noAreaSuggestion: "No area found",

    topN: "Top-N",
    sortBy: "Sort by",
    sortScore: "Relevance",
    sortRating: "Rating",
    sortDistance: "Distance",

    recommend: "Recommend",
    reset: "Reset",

    sideText: "Click a place in the results to open its detailed profile. Best restaurants & accommodations in Ottawa.",
    places: "Places",
    restaurants: "Restaurants",
    hotels: "Accommodations",

    results: "Results",
    backFilters: "Filters",
    backHome: "Home",
    resultsSearchPlaceholder: "Search within these results (name, neighbourhood, address)...",
    clear: "Clear",

    modalTags: "Tags",
    modalWhy: "Why this recommendation?",
    modalInfo: "Information",
    address: "Address",
    neighbourhood: "Neighbourhood",
    hours: "Hours",
    phone: "Phone",
    website: "Website",
    openMaps: "Open in Google Maps",

    modalRatingLabel: "Rating",
    modalBudgetLabel: "Budget",
    modalDistanceLabel: "Distance",
    modalScoreLabel: "Score",

    statusLoading: "Loading…",
    statusOk: "OK",
    statusError: "Error",

    quickSearchEmpty: "Enter at least one keyword before clicking Explore.",
    filtersEmpty: "Add at least one filter before requesting recommendations.",
    locationNeeded: "Enable your location first or switch back to Ottawa center.",
    noResults: "No results found for this search.",
    noteUnavailable: "Rating not available",
    clickPlace: "Click a place to view the detailed profile.",
    filteredBy: 'Filtered by: "{query}"',

    locationCenterMsg: "Distance is calculated from Ottawa center.",
    locationUserMsg: "Distance is calculated from your current location.",
    locationDetected: "Location detected. Distance will be calculated from your current position.",
    locationDenied: "Permission denied. Distance remains calculated from Ottawa center.",
    locationUnavailable: "Geolocation is not available in this browser. Ottawa center is used.",
    locationError: "Unable to retrieve location. Ottawa center is used.",
    locationAsking: "Requesting location…",

    resultsCountOne: "result",
    resultsCountMany: "results",

    searchPrefix: "Search",
    typePrefix: "Type",
    cuisinePrefix: "Cuisine",
    budgetPrefix: "Budget",
    distanceMaxPrefix: "Max distance",
    fromPrefix: "From",
    constraintsPrefix: "Constraints",
    areaPrefix: "Area",

    anyDash: "—",
    allTypes: "all",
    constraintsNone: "Coming soon",

    tagWebsite: "Website",
    tagPhone: "Phone",
    tagHours: "Hours",
    tagAccessibility: "Accessibility",
    scoreLabel: "Score",

    whyBecause: "Recommended because",
    whySearchMatch: 'it matches your search "{query}"',
    whyCuisineMatch: "the requested {cuisine} cuisine is respected",
    whyAreaMatch: "the requested area matches",
    whyDistanceTop: "it is among the closest options ({km} km from {origin})",
    whyDistance: "it is {km} km from {origin}",
    whyRatingTop: "its rating stands out ({rating}/5{count})",
    whyRatingGood: "its strong rating reinforces the recommendation ({rating}/5)",
    whyFallback: "it offers one of the best balances between relevance, distance, and available information quality",
    cuisineExplorerTitle: "Explore by cuisine",
    cuisineExplorerSubtitle: "Quickly discover the most common cuisines in the dataset.",
    cuisineExplorerSeeAll: "See all",
    cuisineDirectoryTitle: "All cuisines",
    cuisineDirectorySubtitle: "Choose a cuisine to view all matching places in the dataset.",
    cuisineDirectorySearchPlaceholder: "Search a cuisine...",
    cuisineDirectoryClose: "Close",
    cuisineDirectoryOpen: "Open this cuisine",
    cuisineDirectoryEmpty: "No cuisine found",
    cuisineDirectoryCount: "{count} places"
  }
};

// Utils
function safeText(x) {
  const v = String(x ?? "").trim();
  if (!v) return "";
  const low = v.toLowerCase();
  if (low === "nan" || low === "none" || low === "null" || low === "undefined") return "";
  return v;
}

function toNumber(x) {
  const v = safeText(x).replace(",", ".");
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeText(v) {
  return safeText(v)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_/]/g, " ")
    .replace(/[^\w\s&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(v) {
  return safeText(v)
    .split(" ")
    .map(part => part ? part.charAt(0).toUpperCase() + part.slice(1) : "")
    .join(" ");
}

function t(key, vars = {}) {
  let text = translations[currentLang]?.[key] ?? key;
  Object.entries(vars).forEach(([k, v]) => {
    text = text.replaceAll(`{${k}}`, v);
  });
  return text;
}

function setInlineMessage(node, message = "") {
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("hidden", !message);
}

function clearInlineMessages() {
  setInlineMessage(quickSearchFeedback, "");
  setInlineMessage(filtersFeedback, "");
}

function updateLocationStatus(message) {
  if (!locationStatus) return;
  locationStatus.textContent = message;
}

function typeLabel(tValue) {
  if (tValue === "restaurant") return currentLang === "en" ? "Restaurant" : "Restaurant";
  return currentLang === "en" ? "Accommodation" : "Hébergement";
}

function cuisineLabel(c) {
  const key = normalizeText(c);

  const mapFr = {
    italian: "Italien",
    indian: "Indien",
    asian: "Asiatique",
    african: "Africain",
    canadian: "Canadien",
    cafe: "Café / Brunch",
    chinese: "Chinois",
    japanese: "Japonais",
    vietnamese: "Vietnamien",
    thai: "Thaï",
    korean: "Coréen",
    mexican: "Mexicain",
    french: "Français",
    pizza: "Pizza",
    ethiopian: "Éthiopien",
    eritrean: "Érythréen",
    moroccan: "Marocain",
    tunisian: "Tunisien",
    algerian: "Algérien",
    lebanese: "Libanais",
    "middle eastern": "Moyen-Orient",
    shawarma: "Shawarma",
    american: "Américain",
    burger: "Burgers",
    barbecue: "Barbecue",
    brunch: "Brunch",
    breakfast: "Déjeuner",
    "coffee shop": "Café",
    bakery: "Boulangerie",
    caribbean: "Caraïbéen",
    any: t("anyDash"),
    unknown: currentLang === "en" ? "Cuisine not specified" : "Cuisine non précisée"
  };

  const mapEn = {
    italian: "Italian",
    indian: "Indian",
    asian: "Asian",
    african: "African",
    canadian: "Canadian",
    cafe: "Cafe / Brunch",
    chinese: "Chinese",
    japanese: "Japanese",
    vietnamese: "Vietnamese",
    thai: "Thai",
    korean: "Korean",
    mexican: "Mexican",
    french: "French",
    pizza: "Pizza",
    ethiopian: "Ethiopian",
    eritrean: "Eritrean",
    moroccan: "Moroccan",
    tunisian: "Tunisian",
    algerian: "Algerian",
    lebanese: "Lebanese",
    "middle eastern": "Middle Eastern",
    shawarma: "Shawarma",
    american: "American",
    burger: "Burgers",
    barbecue: "Barbecue",
    brunch: "Brunch",
    breakfast: "Breakfast",
    "coffee shop": "Cafe",
    bakery: "Bakery",
    caribbean: "Caribbean",
    any: t("anyDash"),
    unknown: "Cuisine not specified"
  };

  const map = currentLang === "en" ? mapEn : mapFr;
  return map[key] || titleCase(key) || (currentLang === "en" ? "Cuisine not specified" : "Cuisine non précisée");
}

function budgetLabel(b) {
  return b === "low" ? "$" : b === "mid" ? "$$" : b === "high" ? "$$$" : t("budgetComingSoon");
}

function setControlText(labelEl, text) {
  if (!labelEl) return;
  const firstElement = labelEl.firstElementChild;
  if (!firstElement) {
    labelEl.textContent = text;
    return;
  }

  const preservedNode = firstElement;
  labelEl.innerHTML = "";
  labelEl.appendChild(preservedNode);
  labelEl.append(` ${text}`);
}

function updateLanguageButtons() {
  btnLangFr?.classList.toggle("is-active", currentLang === "fr");
  btnLangEn?.classList.toggle("is-active", currentLang === "en");
}

function setLanguage(lang) {
  currentLang = lang === "en" ? "en" : "fr";
  localStorage.setItem(LANG_STORAGE_KEY, currentLang);
  updateLanguageUI();
}

// Distance
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

function hasUserLocation() {
  return !!(
    locationState.userCoords &&
    Number.isFinite(locationState.userCoords.lat) &&
    Number.isFinite(locationState.userCoords.lon)
  );
}

function getSelectedDistanceMode() {
  return distanceModeUser?.checked ? "user" : "center";
}

function getDistanceOriginLabel(prefs) {
  return prefs?.distanceMode === "user" ? t("myLocation") : t("ottawaCenter");
}

function getDistanceOriginShort(prefs) {
  return prefs?.distanceMode === "user"
    ? (currentLang === "en" ? "your location" : "votre position")
    : (currentLang === "en" ? "Ottawa center" : "le centre d’Ottawa");
}

async function requestUserLocation() {
  if (!navigator.geolocation) {
    locationState.mode = "center";
    if (distanceModeCenter) distanceModeCenter.checked = true;
    if (distanceModeUser) distanceModeUser.checked = false;
    updateLocationStatus(t("locationUnavailable"));
    return false;
  }

  updateLocationStatus(t("locationAsking"));

  return await new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locationState.userCoords = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude
        };
        locationState.permission = "granted";
        locationState.mode = "user";

        if (distanceModeUser) distanceModeUser.checked = true;

        updateLocationStatus(t("locationDetected"));
        resolve(true);
      },
      (err) => {
        locationState.permission = err.code === 1 ? "denied" : "error";
        locationState.mode = "center";

        if (distanceModeCenter) distanceModeCenter.checked = true;
        if (distanceModeUser) distanceModeUser.checked = false;

        updateLocationStatus(
          err.code === 1 ? t("locationDenied") : t("locationError")
        );
        resolve(false);
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000
      }
    );
  });
}

function computeDistanceFromPrefs(place, prefs) {
  if (place.lat == null || place.lon == null) return null;

  const ref =
    prefs?.distanceMode === "user" && hasUserLocation()
      ? locationState.userCoords
      : OTTAWA_CENTER;

  const km = haversineKm(ref.lat, ref.lon, place.lat, place.lon);
  return Math.round(km * 10) / 10;
}

// Views
function showHome() {
  closeCuisineDirectory();
  closeCuisineSuggestions?.();
  closeAreaSuggestions?.();
  homeView?.classList.remove("hidden");
  builderView?.classList.add("hidden");
  resultsView?.classList.add("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showFilters() {
  closeCuisineDirectory();
  homeView?.classList.add("hidden");
  builderView?.classList.remove("hidden");
  resultsView?.classList.add("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showResults() {
  closeCuisineDirectory();
  homeView?.classList.add("hidden");
  builderView?.classList.add("hidden");
  resultsView?.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// CSV load / parse
async function tryFetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

async function loadCSV() {
  for (const path of CSV_CANDIDATE_PATHS) {
    try {
      return await tryFetchText(path);
    } catch (e) {}
  }
  throw new Error(currentLang === "en"
    ? "Unable to load data. Start the project with Live Server or http.server."
    : "Impossible de charger les données. Lance le projet via Live Server ou http.server."
  );
}

function splitCSVLine(line, delim) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delim) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (!lines.length) return [];

  const headerLine = lines[0];
  const commaCount = (headerLine.match(/,/g) || []).length;
  const semiCount = (headerLine.match(/;/g) || []).length;
  const delim = semiCount > commaCount ? ";" : ",";

  const headers = splitCSVLine(headerLine, delim).map(h => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i], delim);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cols[idx] ?? "";
    });
    rows.push(obj);
  }

  return rows;
}

function safeJson(s) {
  const v = safeText(s);
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function parseCuisineList(s) {
  const v = safeText(s);
  if (!v || v === "[]") return [];

  try {
    const jsonish = v.replaceAll("'", '"');
    const arr = JSON.parse(jsonish);
    return Array.isArray(arr) ? arr.map(x => String(x)) : [];
  } catch {
    return v.replace(/[\[\]']/g, "").split(",").map(x => x.trim()).filter(Boolean);
  }
}

function normalizeType(place_type) {
  const tValue = safeText(place_type).toLowerCase();
  if (tValue === "restaurant") return "restaurant";
  if (["hotel", "guest_house", "motel", "hostel"].includes(tValue)) return "hotel";
  return "restaurant";
}

// Cuisine helpers
const CUISINE_GROUPS = {
  italian: ["italian", "pizza", "pasta"],
  indian: ["indian", "pakistani", "nepalese", "bangladeshi", "punjabi"],
  asian: ["asian", "chinese", "japanese", "vietnamese", "thai", "korean", "sushi", "ramen", "filipino"],
  african: ["african", "ethiopian", "eritrean", "moroccan", "algerian", "tunisian", "senegalese", "somali", "nigerian", "ghanaian"],
  canadian: ["canadian", "american", "burger", "bbq", "barbecue", "grill", "diner", "steakhouse"],
  cafe: ["cafe", "coffee", "coffee shop", "bakery", "brunch", "breakfast", "tea room", "bistro"],
  "middle eastern": ["middle eastern", "lebanese", "shawarma", "syrian", "turkish", "persian"],
  mexican: ["mexican", "taco", "burrito"],
  caribbean: ["caribbean", "jamaican", "haitian"]
};

const CUISINE_ALIASES = {
  jap: "japanese",
  japon: "japanese",
  japo: "japanese",
  tha: "thai",
  viet: "vietnamese",
  ethi: "ethiopian",
  ethio: "ethiopian",
  afr: "african",
  indi: "indian",
  bbq: "barbecue",
  barbq: "barbecue",
  piz: "pizza",
  pizz: "pizza",
  cafe: "cafe",
  "café": "cafe",
  brunch: "brunch",
  shaw: "shawarma",
  asiatique: "asian",
  africain: "african",
  italien: "italian",
  indien: "indian",
  canadien: "canadian",
  japonais: "japanese",
  vietnamien: "vietnamese",
  thai: "thai"
};

const GENERIC_CUISINE_TOKENS = new Set([
  "food",
  "foods",
  "restaurant",
  "restaurants",
  "cuisine",
  "kitchen",
  "grill",
  "takeout",
  "delivery"
]);

const CUISINE_TOKEN_TO_GROUPS = Object.entries(CUISINE_GROUPS).reduce((acc, [group, raws]) => {
  raws.forEach(raw => {
    const key = normalizeText(raw);
    if (!acc[key]) acc[key] = [];
    if (!acc[key].includes(group)) acc[key].push(group);
  });
  return acc;
}, {});

function splitRawCuisineValue(raw) {
  const v = safeText(raw);
  if (!v) return [];

  return v
    .replace(/[\[\]"]/g, "")
    .split(/[;,/|]/g)
    .map(x => x.trim())
    .filter(Boolean);
}

function normalizeCuisineToken(token) {
  let tValue = normalizeText(token);
  if (!tValue) return "";

  if (CUISINE_ALIASES[tValue]) {
    tValue = CUISINE_ALIASES[tValue];
  }

  if (["any", "unknown", "unspecified", "none", "na", "n a"].includes(tValue)) {
    return "unknown";
  }

  if (GENERIC_CUISINE_TOKENS.has(tValue)) return "";
  if (tValue.length <= 1) return "";

  return tValue;
}

function inferCuisineData(row, tagsObj) {
  const listFromCsv = parseCuisineList(row.cuisine_list);

  const rawCandidates = [
    safeText(row.cuisine_norm),
    safeText(row.cuisine),
    ...listFromCsv,
    safeText(tagsObj?.cuisine),
    safeText(tagsObj?.["cuisine:type"])
  ];

  const specificTokens = [...new Set(
    rawCandidates
      .flatMap(splitRawCuisineValue)
      .map(normalizeCuisineToken)
      .filter(Boolean)
      .filter(token => token !== "unknown")
  )];

  const groupTokens = [...new Set(
    specificTokens.flatMap(token => CUISINE_TOKEN_TO_GROUPS[token] || [])
  )];

  const primary = specificTokens[0] || groupTokens[0] || "unknown";

  return {
    cuisine_primary: primary,
    cuisine_tokens: specificTokens,
    cuisine_groups: groupTokens,
    cuisine_raw_list: listFromCsv
  };
}

function placeMatchesCuisine(place, desiredCuisine) {
  const desired = normalizeText(desiredCuisine);
  if (!desired || desired === "any") return true;
  if (place.type !== "restaurant") return false;

  const specific = Array.isArray(place.cuisine_tokens) ? place.cuisine_tokens : [];
  const groups = Array.isArray(place.cuisine_groups) ? place.cuisine_groups : [];
  const allTokens = [...specific, ...groups];

  return allTokens.some(token =>
    token === desired ||
    token.includes(desired) ||
    desired.includes(token)
  );
}

// Area helpers
let areaOptions = [];
let activeAreaIndex = -1;

const AREA_GROUPS = {
  downtown: {
    fr: "Centre-ville",
    en: "Downtown",
    aliases: ["downtown", "centre ville", "centre-ville", "city centre", "city center"],
    streets: [],
    radiusKm: 2.2
  },
  byward: {
    fr: "ByWard Market",
    en: "ByWard Market",
    aliases: ["byward", "by ward", "byward market", "market"],
    streets: ["byward market square", "dalhousie street", "george street", "clarence street", "york street", "rideau street"]
  },
  centretown: {
    fr: "Centretown",
    en: "Centretown",
    aliases: ["centretown"],
    streets: []
  },
  stlaurent: {
    fr: "St-Laurent",
    en: "St-Laurent",
    aliases: ["st laurent", "st-laurent", "saint laurent", "saint-laurent"],
    streets: ["st laurent boulevard", "st-laurent boulevard"]
  },
  vanier: {
    fr: "Vanier",
    en: "Vanier",
    aliases: ["vanier"],
    streets: ["montreal road", "mcarthur avenue", "beechwood avenue"]
  },
  sandyhill: {
    fr: "Sandy Hill",
    en: "Sandy Hill",
    aliases: ["sandy hill"],
    streets: []
  },
  glebe: {
    fr: "The Glebe",
    en: "The Glebe",
    aliases: ["glebe", "the glebe"],
    streets: []
  },
  littleitaly: {
    fr: "Petite Italie",
    en: "Little Italy",
    aliases: ["little italy", "petite italie"],
    streets: ["preston street"]
  },
  hintonburg: {
    fr: "Hintonburg",
    en: "Hintonburg",
    aliases: ["hintonburg"],
    streets: []
  },
  westboro: {
    fr: "Westboro",
    en: "Westboro",
    aliases: ["westboro"],
    streets: []
  },
  orleans: {
    fr: "Orléans",
    en: "Orleans",
    aliases: ["orleans", "orléans", "d orleans", "d'orleans"],
    streets: ["st joseph boulevard", "tenth line road"]
  },
  kanata: {
    fr: "Kanata",
    en: "Kanata",
    aliases: ["kanata"],
    streets: ["kanata avenue", "terry fox drive", "march road"]
  },
  nepean: {
    fr: "Nepean",
    en: "Nepean",
    aliases: ["nepean"],
    streets: ["merivale road", "robertson road", "woodroffe avenue", "nepean street"]
  },
  barrhaven: {
    fr: "Barrhaven",
    en: "Barrhaven",
    aliases: ["barrhaven"],
    streets: ["strandherd drive", "greenbank road"]
  }
};

const AREA_ALIASES = Object.entries(AREA_GROUPS).reduce((acc, [key, meta]) => {
  meta.aliases.forEach(alias => {
    acc[normalizeText(alias)] = key;
  });
  acc[normalizeText(meta.fr)] = key;
  acc[normalizeText(meta.en)] = key;
  return acc;
}, {});

function canonicalAreaKey(value) {
  const q = normalizeText(value);
  return AREA_ALIASES[q] || q;
}

function areaLabel(value) {
  const key = canonicalAreaKey(value);
  const meta = AREA_GROUPS[key];
  if (!meta) return titleCase(value);
  return currentLang === "en" ? meta.en : meta.fr;
}

function inferAreaData(row, tagsObj) {
  const hay = normalizeText([
    safeText(row.name),
    safeText(row.address),
    safeText(row.address_clean),
    safeText(row.website),
    safeText(row.text),
    safeText(row.addr_street),
    safeText(row.addr_city),
    safeText(tagsObj?.name),
    safeText(tagsObj?.official_name),
    safeText(tagsObj?.["addr:street"])
  ].join(" "));

  const found = [];

  for (const [key, meta] of Object.entries(AREA_GROUPS)) {
    const aliasMatch = meta.aliases.some(alias => hay.includes(normalizeText(alias)));
    const streetMatch = (meta.streets || []).some(street => hay.includes(normalizeText(street)));

    if (aliasMatch || streetMatch) {
      found.push(key);
    }
  }

  const kmCenter = toNumber(row.dist_to_center_km);
  if (kmCenter != null && kmCenter <= (AREA_GROUPS.downtown.radiusKm || 2.2)) {
    if (!found.includes("downtown")) found.unshift("downtown");
  }

  return [...new Set(found)];
}

function placeMatchesArea(place, desiredArea) {
  const desired = canonicalAreaKey(desiredArea);
  if (!desired) return true;

  const tokens = Array.isArray(place.area_tokens) ? place.area_tokens : [];
  if (tokens.includes(desired)) return true;

  const hay = normalizeText([
    place.name,
    place.address,
    place.city,
    place.neighbourhood,
    place.website,
    ...(place.area_tokens || [])
  ].join(" "));

  if (hay.includes(desired)) return true;

  const aliases = AREA_GROUPS[desired]?.aliases || [];
  return aliases.some(alias => hay.includes(normalizeText(alias)));
}

function matchesArea(place, areaValue) {
  return placeMatchesArea(place, areaValue);
}

function extractAreaOptions(places) {
  const counts = new Map();

  places.forEach(place => {
    (place.area_tokens || []).forEach(area => {
      counts.set(area, (counts.get(area) || 0) + 1);
    });
  });

  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || areaLabel(a.value).localeCompare(areaLabel(b.value), "fr"));
}

function getSelectedAreaValue() {
  return canonicalAreaKey(areaHidden?.value || "");
}

function setSelectedAreaValue(value, alsoSetInput = true) {
  const normalized = canonicalAreaKey(value);

  if (areaHidden) areaHidden.value = normalized;

  if (areaInput && alsoSetInput) {
    areaInput.value = normalized ? areaLabel(normalized) : "";
  }
}

function hideAreaSuggestions() {
  if (!areaSuggestions) return;
  areaSuggestions.classList.add("hidden");
  areaSuggestions.innerHTML = "";
  activeAreaIndex = -1;
}

function getAreaScore(option, query) {
  const q = normalizeText(query);
  const key = option.value;
  const label = normalizeText(areaLabel(key));
  const aliases = AREA_GROUPS[key]?.aliases || [];

  if (!q) return 0;
  if (key === canonicalAreaKey(q)) return 100;
  if (label.startsWith(q)) return 95;
  if (label.includes(q)) return 80;
  if (aliases.some(alias => normalizeText(alias).startsWith(q))) return 90;
  if (aliases.some(alias => normalizeText(alias).includes(q))) return 70;

  return 0;
}

function renderAreaSuggestions(query) {
  if (!areaSuggestions) return;

  const q = normalizeText(query);

  if (!q) {
    hideAreaSuggestions();
    setSelectedAreaValue("", false);
    return;
  }

  const results = areaOptions
    .map(option => ({
      ...option,
      score: getAreaScore(option, q)
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || b.count - a.count)
    .slice(0, 8);

  if (!results.length) {
    areaSuggestions.innerHTML = `<div class="autocomplete__empty">${escapeHtml(t("noAreaSuggestion"))}</div>`;
    areaSuggestions.classList.remove("hidden");
    activeAreaIndex = -1;
    setSelectedAreaValue(q, false);
    return;
  }

  areaSuggestions.innerHTML = results.map((item, index) => `
    <div class="autocomplete__item" data-value="${escapeHtml(item.value)}" data-index="${index}">
      ${escapeHtml(areaLabel(item.value))} <span style="opacity:.65">(${item.count})</span>
    </div>
  `).join("");

  areaSuggestions.classList.remove("hidden");
  activeAreaIndex = -1;
  setSelectedAreaValue(q, false);
}

function highlightAreaItem(index) {
  if (!areaSuggestions) return;

  const items = [...areaSuggestions.querySelectorAll(".autocomplete__item")];
  items.forEach(item => item.classList.remove("is-active"));

  if (index >= 0 && index < items.length) {
    items[index].classList.add("is-active");
  }
}

function selectArea(value) {
  setSelectedAreaValue(value, true);
  hideAreaSuggestions();
}

function initAreaAutocomplete() {
  areaOptions = extractAreaOptions(PLACES);

  if (!areaInput || !areaSuggestions || !areaHidden) return;

  areaInput.addEventListener("input", (e) => {
    renderAreaSuggestions(e.target.value);
  });

  areaInput.addEventListener("focus", () => {
    if (areaInput.value.trim()) {
      renderAreaSuggestions(areaInput.value);
    }
  });

  areaInput.addEventListener("keydown", (e) => {
    const items = [...areaSuggestions.querySelectorAll(".autocomplete__item")];

    if (!items.length) {
      if (e.key === "Enter") {
        setSelectedAreaValue(areaInput.value, false);
        hideAreaSuggestions();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeAreaIndex = Math.min(activeAreaIndex + 1, items.length - 1);
      highlightAreaItem(activeAreaIndex);
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      activeAreaIndex = Math.max(activeAreaIndex - 1, 0);
      highlightAreaItem(activeAreaIndex);
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (activeAreaIndex >= 0 && items[activeAreaIndex]) {
        selectArea(items[activeAreaIndex].dataset.value || "");
      } else {
        setSelectedAreaValue(areaInput.value, false);
        hideAreaSuggestions();
      }
    }

    if (e.key === "Escape") {
      hideAreaSuggestions();
    }
  });

  areaSuggestions.addEventListener("click", (e) => {
    const item = e.target.closest(".autocomplete__item");
    if (!item) return;
    selectArea(item.dataset.value || "");
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#areaAutocomplete")) {
      hideAreaSuggestions();
    }
  });
}

function placeMatchesSearchText(place, query) {
  const q = normalizeText(query);
  if (!q) return true;

  const hay = normalizeText([
    place.name,
    place.neighbourhood,
    place.city,
    place.address,
    place.type,
    place.cuisine_norm,
    ...(place.cuisine_tokens || []),
    ...(place.cuisine_groups || []),
    ...(place.area_tokens || [])
  ].join(" "));

  const terms = q.split(" ").filter(Boolean);
  return terms.every(term => hay.includes(term));
}

function extractCuisineOptions(places) {
  const set = new Set();

  places
    .filter(place => place.type === "restaurant")
    .forEach(place => {
      (place.cuisine_tokens || []).forEach(token => {
        if (token && token !== "unknown") set.add(token);
      });
    });

  return [...set].sort((a, b) => a.localeCompare(b, "fr"));
}

function getCuisineScore(option, query) {
  if (!query) return 0;

  const normalizedOption = normalizeText(option);
  const aliasTarget = CUISINE_ALIASES[query];

  if (normalizedOption === query) return 100;
  if (aliasTarget && normalizedOption === aliasTarget) return 95;
  if (normalizedOption.startsWith(query)) return 90;
  if (normalizedOption.includes(query)) return 70;

  return 0;
}

function hideCuisineSuggestions() {
  if (!cuisineSuggestions) return;
  cuisineSuggestions.classList.add("hidden");
  cuisineSuggestions.innerHTML = "";
  activeCuisineIndex = -1;
}

const closeCuisineSuggestions = hideCuisineSuggestions;
const closeAreaSuggestions = hideAreaSuggestions;

function getSelectedCuisineValue() {
  if (cuisineInput && cuisineHidden && cuisineHidden.type === "hidden") {
    return normalizeText(cuisineHidden.value) || "any";
  }
  return normalizeText(cuisineHidden?.value) || "any";
}

function setSelectedCuisineValue(value, alsoSetInput = true) {
  const normalized = normalizeText(value) || "any";

  if (cuisineHidden) {
    cuisineHidden.value = normalized;
  }

  if (cuisineInput && alsoSetInput) {
    cuisineInput.value = normalized === "any" ? "" : cuisineLabel(normalized);
  }
}

function selectCuisine(value) {
  setSelectedCuisineValue(value, true);
  hideCuisineSuggestions();
}

function renderCuisineSuggestions(query) {
  if (!cuisineSuggestions) return;

  const q = normalizeText(query);

  if (!q) {
    hideCuisineSuggestions();
    setSelectedCuisineValue("any", false);
    return;
  }

  const results = cuisineOptions
    .map(option => ({
      value: option,
      score: getCuisineScore(option, q)
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.value.localeCompare(b.value, "fr"))
    .slice(0, 8);

  if (!results.length) {
    cuisineSuggestions.innerHTML = `<div class="autocomplete__empty">${escapeHtml(t("noCuisineSuggestion"))}</div>`;
    cuisineSuggestions.classList.remove("hidden");
    activeCuisineIndex = -1;
    setSelectedCuisineValue(q, false);
    return;
  }

  cuisineSuggestions.innerHTML = results
    .map((item, index) => `
      <div class="autocomplete__item" data-value="${escapeHtml(item.value)}" data-index="${index}">
        ${escapeHtml(cuisineLabel(item.value))}
      </div>
    `)
    .join("");

  cuisineSuggestions.classList.remove("hidden");
  activeCuisineIndex = -1;
  setSelectedCuisineValue(q, false);
}

function highlightCuisineItem(index) {
  if (!cuisineSuggestions) return;
  const items = [...cuisineSuggestions.querySelectorAll(".autocomplete__item")];
  items.forEach(elm => elm.classList.remove("is-active"));

  if (index >= 0 && index < items.length) {
    items[index].classList.add("is-active");
  }
}

function initCuisineAutocomplete() {
  cuisineOptions = extractCuisineOptions(PLACES);

  if (!cuisineInput || !cuisineSuggestions || !cuisineHidden || cuisineHidden.tagName === "SELECT") {
    return;
  }

  cuisineInput.addEventListener("input", (e) => {
    renderCuisineSuggestions(e.target.value);
  });

  cuisineInput.addEventListener("focus", () => {
    if (cuisineInput.value.trim()) {
      renderCuisineSuggestions(cuisineInput.value);
    }
  });

  cuisineInput.addEventListener("keydown", (e) => {
    const items = [...cuisineSuggestions.querySelectorAll(".autocomplete__item")];

    if (!items.length) {
      if (e.key === "Enter") {
        setSelectedCuisineValue(cuisineInput.value, false);
        hideCuisineSuggestions();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeCuisineIndex = Math.min(activeCuisineIndex + 1, items.length - 1);
      highlightCuisineItem(activeCuisineIndex);
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      activeCuisineIndex = Math.max(activeCuisineIndex - 1, 0);
      highlightCuisineItem(activeCuisineIndex);
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (activeCuisineIndex >= 0 && items[activeCuisineIndex]) {
        selectCuisine(items[activeCuisineIndex].dataset.value);
      } else {
        setSelectedCuisineValue(cuisineInput.value, false);
        hideCuisineSuggestions();
      }
    }

    if (e.key === "Escape") {
      hideCuisineSuggestions();
    }
  });

  cuisineSuggestions.addEventListener("click", (e) => {
    const item = e.target.closest(".autocomplete__item");
    if (!item) return;
    selectCuisine(item.dataset.value || "any");
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#cuisineAutocomplete")) {
      hideCuisineSuggestions();
    }
  });
}

function getCuisineDisabledText() {
  return currentLang === "en"
    ? "Not applicable to accommodations"
    : "Non applicable aux hébergements";
}

function getCuisineDisabledHint() {
  return currentLang === "en"
    ? "This filter applies to restaurants only."
    : "Ce filtre s’applique aux restaurants seulement.";
}

function syncCuisineFieldState() {
  const typeValue = el("type")?.value || "any";
  const isHotelOnly = typeValue === "hotel";

  const cuisineField = cuisineInput?.closest(".field");
  const cuisineHint = document.querySelector("#cuisineAutocomplete + .hint");

  if (isHotelOnly) {
    setSelectedCuisineValue("any", false);
    hideCuisineSuggestions();

    if (cuisineInput) {
      cuisineInput.value = getCuisineDisabledText();
      cuisineInput.disabled = true;
    }

    if (cuisineHidden) {
      cuisineHidden.value = "any";
    }

    if (cuisineField) cuisineField.classList.add("is-disabled");
    if (cuisineHint) cuisineHint.textContent = getCuisineDisabledHint();
  } else {
    if (cuisineInput) {
      const wasDisabledText =
        cuisineInput.value === "Non applicable aux hébergements" ||
        cuisineInput.value === "Not applicable to accommodations";

      cuisineInput.disabled = false;

      if (wasDisabledText) {
        cuisineInput.value = "";
      }
    }

    if (cuisineField) cuisineField.classList.remove("is-disabled");
    if (cuisineHint) cuisineHint.textContent = t("cuisineHint");
  }
}

/* =========================
   CUISINE EXPLORER / DIRECTORY
========================= */

const CUISINE_HOME_LIMIT = 8;
const CUISINE_DIRECTORY_TOPN = 500;
let cuisineDirectoryCatalog = [];

const CUISINE_EMOJI_MAP = {
  italian: "🍝",
  pizza: "🍕",
  indian: "🍛",
  asian: "🥢",
  chinese: "🥡",
  japanese: "🍣",
  sushi: "🍣",
  vietnamese: "🍜",
  thai: "🍜",
  korean: "🍲",
  african: "🌍",
  ethiopian: "🌍",
  eritrean: "🌍",
  moroccan: "🌍",
  tunisian: "🌍",
  algerian: "🌍",
  canadian: "🍁",
  american: "🍔",
  burger: "🍔",
  barbecue: "🔥",
  cafe: "☕",
  coffee: "☕",
  bakery: "🥐",
  brunch: "🥞",
  breakfast: "🥞",
  dessert: "🍰",
  desserts: "🍰",
  vegetarian: "🥗",
  vegan: "🌱",
  healthy: "🥗",
  halal: "🕌",
  chicken: "🍗",
  wings: "🍗",
  shawarma: "🥙",
  "middle eastern": "🥙",
  lebanese: "🥙",
  sandwiches: "🥪",
  sandwich: "🥪",
  mexican: "🌮",
  caribbean: "🌴",
  poutine: "🍟",
  seafood: "🦞",
  french: "🥖",
  mediterranean: "🫒",
  juice: "🧃",
  smoothies: "🧃",
  fusion: "✨",
  diner: "🍽️"
};

const CUISINE_PALETTES = [
  { bg: "#FFF4E8", soft: "#FFE2C2", strong: "#FF8A1F" },
  { bg: "#EEF7FF", soft: "#D8EBFF", strong: "#3B82F6" },
  { bg: "#F6EEFF", soft: "#E8D9FF", strong: "#8B5CF6" },
  { bg: "#ECFDF3", soft: "#D1FADF", strong: "#12B76A" },
  { bg: "#FFF1F3", soft: "#FFD6DD", strong: "#F04478" },
  { bg: "#FFF8DB", soft: "#FCE588", strong: "#D4A72C" },
  { bg: "#F3F4F6", soft: "#E5E7EB", strong: "#475467" },
  { bg: "#EEF2FF", soft: "#C7D2FE", strong: "#4F46E5" }
];

function getCuisineEmoji(value) {
  const normalized = normalizeText(value);
  if (CUISINE_EMOJI_MAP[normalized]) return CUISINE_EMOJI_MAP[normalized];

  const parts = normalized.split(" ");
  for (const part of parts) {
    if (CUISINE_EMOJI_MAP[part]) return CUISINE_EMOJI_MAP[part];
  }

  return "🍽️";
}

function getCuisinePalette(value) {
  const normalized = normalizeText(value);
  let hash = 0;

  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
    hash |= 0;
  }

  const index = Math.abs(hash) % CUISINE_PALETTES.length;
  return CUISINE_PALETTES[index];
}

function collectCuisineDirectoryCatalog() {
  const counts = new Map();

  PLACES
    .filter(place => place.type === "restaurant")
    .forEach(place => {
      const tokens = [
        ...(Array.isArray(place.cuisine_groups) ? place.cuisine_groups : []),
        ...(Array.isArray(place.cuisine_tokens) ? place.cuisine_tokens : [])
      ]
        .map(token => normalizeText(token))
        .filter(token => token && token !== "unknown");

      const uniqueTokens = new Set(tokens);

      uniqueTokens.forEach(token => {
        counts.set(token, (counts.get(token) || 0) + 1);
      });
    });

  return [...counts.entries()]
    .map(([value, count]) => {
      const palette = getCuisinePalette(value);
      return {
        value,
        count,
        label: cuisineLabel(value),
        emoji: getCuisineEmoji(value),
        palette
      };
    })
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.label.localeCompare(b.label, currentLang === "en" ? "en" : "fr");
    });
}

function ensureCuisineExplorerMount() {
  const host = document.querySelector(".side__content");
  if (!host) return null;

  let mount = el("cuisineExplorerSection");
  if (!mount) {
    mount = document.createElement("section");
    mount.id = "cuisineExplorerSection";
    mount.className = "cuisine-explorer";

    const kpis = host.querySelector(".side__kpis");
    if (kpis) {
      kpis.insertAdjacentElement("afterend", mount);
    } else {
      host.appendChild(mount);
    }
  }

  return mount;
}

function ensureCuisineDirectoryView() {
  let view = el("cuisineDirectoryView");

  if (!view) {
    const html = `
      <div id="cuisineDirectoryView" class="cuisine-directory" aria-hidden="true">
        <div class="cuisine-directory__shell">
          <div class="cuisine-directory__top">
            <div>
              <h2 id="cuisineDirectoryTitle" class="cuisine-directory__title"></h2>
              <p id="cuisineDirectorySubtitle" class="cuisine-directory__subtitle"></p>
            </div>

            <div class="cuisine-directory__actions">
              <input
                id="cuisineDirectorySearch"
                class="cuisine-directory__search"
                type="text"
                value=""
              />
              <button id="btnCloseCuisineDirectory" type="button" class="cuisine-directory__close"></button>
            </div>
          </div>

          <div id="cuisineDirectoryGrid" class="cuisine-directory__grid"></div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", html);

    el("btnCloseCuisineDirectory")?.addEventListener("click", closeCuisineDirectory);

    el("cuisineDirectorySearch")?.addEventListener("input", (e) => {
      renderCuisineDirectoryGrid(e.target.value || "");
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && el("cuisineDirectoryView")?.classList.contains("is-open")) {
        closeCuisineDirectory();
      }
    });
  }

  return el("cuisineDirectoryView");
}

function openCuisineDirectory() {
  const view = ensureCuisineDirectoryView();
  if (!view) return;

  renderCuisineDirectoryGrid("");
  view.classList.add("is-open");
  view.setAttribute("aria-hidden", "false");
  document.body.classList.add("cuisine-directory-open");

  const search = el("cuisineDirectorySearch");
  if (search) {
    search.value = "";
    search.focus();
  }
}

function closeCuisineDirectory() {
  const view = el("cuisineDirectoryView");
  if (!view) return;

  view.classList.remove("is-open");
  view.setAttribute("aria-hidden", "true");
  document.body.classList.remove("cuisine-directory-open");
}

function buildCuisineExplorerPrefs(cuisineValue) {
  return {
    type: "restaurant",
    cuisine: normalizeText(cuisineValue),
    budget: "any",
    maxKm: 100,
    veg: false,
    halal: false,
    glutenfree: false,
    area: "",
    topN: CUISINE_DIRECTORY_TOPN,
    sortBy: "rating",
    distanceMode: getSelectedDistanceMode(),
    searchText: ""
  };
}

function applyCuisineDirectoryFilter(cuisineValue) {
  const normalized = normalizeText(cuisineValue);
  if (!normalized || normalized === "unknown") return;

  if (el("type")) el("type").value = "restaurant";
  if (el("budget")) el("budget").value = "any";
  if (el("maxKm")) el("maxKm").value = 100;
  setSelectedAreaValue("", true);
  if (el("sortBy")) el("sortBy").value = "rating";
  if (el("topN")) el("topN").value = 20;
  if (el("veg")) el("veg").checked = false;
  if (el("halal")) el("halal").checked = false;
  if (el("glutenfree")) el("glutenfree").checked = false;

  setSelectedCuisineValue(normalized, true);
  hideCuisineSuggestions();
  hideAreaSuggestions();

  const prefs = buildCuisineExplorerPrefs(normalized);

  const list = PLACES
    .filter(place => place.type === "restaurant" && placeMatchesCuisine(place, normalized))
    .map(place => ({
      ...place,
      distance_km: computeDistanceFromPrefs(place, prefs),
      score: scorePlace(place, prefs),
      why: explain(place, prefs)
    }));

  sortPlaces(list, prefs);
  setResults(list, prefs);
  closeCuisineDirectory();
  showResults();
}

function renderCuisineExplorerCards() {
  const mount = ensureCuisineExplorerMount();
  if (!mount) return;

  cuisineDirectoryCatalog = collectCuisineDirectoryCatalog();
  const topItems = cuisineDirectoryCatalog.slice(0, CUISINE_HOME_LIMIT);

  mount.innerHTML = `
    <div class="cuisine-explorer__head">
      <div>
        <h3 class="cuisine-explorer__title">${escapeHtml(t("cuisineExplorerTitle"))}</h3>
        <p class="cuisine-explorer__subtitle">${escapeHtml(t("cuisineExplorerSubtitle"))}</p>
      </div>

      <button id="btnOpenCuisineDirectory" type="button" class="cuisine-explorer__allBtn">
        ${escapeHtml(t("cuisineExplorerSeeAll"))}
      </button>
    </div>

    <div class="cuisine-explorer__grid">
      ${
        topItems.length
          ? topItems.map(item => `
              <button
                type="button"
                class="cuisine-explorer__card"
                data-cuisine="${escapeHtml(item.value)}"
                title="${escapeHtml(t("cuisineDirectoryOpen"))}"
                style="
                  --cx-bg:${item.palette.bg};
                  --cx-soft:${item.palette.soft};
                  --cx-strong:${item.palette.strong};
                "
              >
                <div class="cuisine-explorer__emoji">${escapeHtml(item.emoji)}</div>
                <div class="cuisine-explorer__label">${escapeHtml(item.label)}</div>
                <div class="cuisine-explorer__count">${escapeHtml(t("cuisineDirectoryCount", { count: String(item.count) }))}</div>
              </button>
            `).join("")
          : `<div class="cuisine-explorer__empty">${escapeHtml(t("cuisineDirectoryEmpty"))}</div>`
      }
    </div>
  `;

  mount.querySelector("#btnOpenCuisineDirectory")?.addEventListener("click", openCuisineDirectory);

  mount.querySelectorAll("[data-cuisine]").forEach(btn => {
    btn.addEventListener("click", () => {
      applyCuisineDirectoryFilter(btn.dataset.cuisine || "");
    });
  });
}

function renderCuisineDirectoryGrid(searchQuery = "") {
  ensureCuisineDirectoryView();

  if (!cuisineDirectoryCatalog.length) {
    cuisineDirectoryCatalog = collectCuisineDirectoryCatalog();
  }

  const titleEl = el("cuisineDirectoryTitle");
  const subtitleEl = el("cuisineDirectorySubtitle");
  const closeBtn = el("btnCloseCuisineDirectory");
  const searchInput = el("cuisineDirectorySearch");
  const grid = el("cuisineDirectoryGrid");

  if (titleEl) titleEl.textContent = t("cuisineDirectoryTitle");
  if (subtitleEl) subtitleEl.textContent = t("cuisineDirectorySubtitle");
  if (closeBtn) closeBtn.textContent = t("cuisineDirectoryClose");
  if (searchInput) searchInput.placeholder = t("cuisineDirectorySearchPlaceholder");
  if (!grid) return;

  const q = normalizeText(searchQuery);

  const items = cuisineDirectoryCatalog.filter(item => {
    if (!q) return true;
    return normalizeText(item.label).includes(q) || normalizeText(item.value).includes(q);
  });

  grid.innerHTML = items.length
    ? items.map(item => `
        <button
          type="button"
          class="cuisine-directory__card"
          data-cuisine="${escapeHtml(item.value)}"
          title="${escapeHtml(t("cuisineDirectoryOpen"))}"
          style="
            --cx-bg:${item.palette.bg};
            --cx-soft:${item.palette.soft};
            --cx-strong:${item.palette.strong};
          "
        >
          <div class="cuisine-directory__cardTop">
            <div class="cuisine-directory__emoji">${escapeHtml(item.emoji)}</div>
            <div class="cuisine-directory__text">
              <div class="cuisine-directory__name">${escapeHtml(item.label)}</div>
              <div class="cuisine-directory__meta">${escapeHtml(t("cuisineDirectoryCount", { count: String(item.count) }))}</div>
            </div>
          </div>
        </button>
      `).join("")
    : `<div class="cuisine-directory__empty">${escapeHtml(t("cuisineDirectoryEmpty"))}</div>`;

  grid.querySelectorAll("[data-cuisine]").forEach(btn => {
    btn.addEventListener("click", () => {
      applyCuisineDirectoryFilter(btn.dataset.cuisine || "");
    });
  });
}

// Construit les lieux depuis les lignes CSV
function buildPlacesFromRows(rows) {
  const places = [];

  for (const r of rows) {
    const name = safeText(r.name);
    if (!name) continue;

    const osmType = safeText(r.osm_type);
    const osmId = safeText(r.osm_id);
    const id = (osmType && osmId) ? `${osmType}:${osmId}` : String(places.length + 1);

    const lat = toNumber(r.lat);
    const lon = toNumber(r.lon);

    let address = safeText(r.address);
    if (!address) {
      const hn = safeText(r.addr_housenumber);
      const st = safeText(r.addr_street);
      address = [hn, st].filter(Boolean).join(" ").trim();
    }

    const phone = safeText(r.phone);
    const website = safeText(r.website);
    const opening_hours = safeText(r.opening_hours);

    const type = normalizeType(r.place_type);

    const tagsObj = safeJson(r.tags_json);
    const cuisineMeta = inferCuisineData(r, tagsObj);
    const areaMeta = inferAreaData(r, tagsObj);

    const imageTag = tagsObj ? safeText(tagsObj.image) : "";
    const wikidata = tagsObj ? (safeText(tagsObj.wikidata) || safeText(tagsObj["brand:wikidata"])) : "";

    const googlePhotoUrl = safeText(r.google_photo_url);
    const googlePhotoAttribution = safeText(r.google_photo_attribution);

    const infoScore = toNumber(r.info_score) ?? 0;

    const kmCenter =
      lat != null && lon != null
        ? Math.round(haversineKm(OTTAWA_CENTER.lat, OTTAWA_CENTER.lon, lat, lon) * 10) / 10
        : null;

    const googleRating = toNumber(r.google_rating);
    const googleUserRatingCount = toNumber(r.google_user_rating_count);
    const ratingSource = safeText(r.rating_source);

    places.push({
      id,
      name,
      type,

      cuisine_norm: cuisineMeta.cuisine_primary,
      cuisine_tokens: cuisineMeta.cuisine_tokens,
      cuisine_groups: cuisineMeta.cuisine_groups,
      cuisine_list: cuisineMeta.cuisine_raw_list,
      cuisine_unknown: cuisineMeta.cuisine_primary === "unknown",

      area_tokens: areaMeta,
      area_norm: areaMeta[0] || "",

      lat,
      lon,
      km_center: kmCenter,
      km: kmCenter,

      address,
      city: safeText(r.addr_city) || "Ottawa",
      postcode: safeText(r.addr_postcode),
      phone,
      website,
      opening_hours,
      wheelchair: safeText(r.wheelchair),
      brand: safeText(r.brand),

      info_score: infoScore,
      ranking_score_base: infoScore,

      google_rating: googleRating,
      google_user_rating_count: googleUserRatingCount,
      rating_source: ratingSource || (googleRating != null ? "google" : ""),

      photo_url: googlePhotoUrl || imageTag || "",
      photo_attribution: googlePhotoAttribution || "",
      wikidata: wikidata || "",
      neighbourhood: areaMeta[0] ? areaLabel(areaMeta[0]) : "",

      _tags: tagsObj,
    });
  }

  return places;
}

// Preferences
function getPrefs() {
  return {
    type: el("type")?.value || "any",
    cuisine: getSelectedCuisineValue(),
    budget: "any",
    maxKm: Number(el("maxKm")?.value || DEFAULT_MAX_KM),
    veg: false,
    halal: false,
    glutenfree: false,
    area: getSelectedAreaValue(),
    topN: clamp(Number(el("topN")?.value || 12), 3, 20),
    sortBy: el("sortBy")?.value || "score",
    distanceMode: getSelectedDistanceMode(),
    searchText: ""
  };
}

function prefsToText(p) {
  const parts = [];

  if (p.searchText?.trim()) {
    parts.push(`${t("searchPrefix")}: ${p.searchText.trim()}`);
  }

  parts.push(
    p.type === "any"
      ? `${t("typePrefix")}: ${t("allTypes")}`
      : `${t("typePrefix")}: ${typeLabel(p.type)}`
  );

  parts.push(
    p.cuisine === "any"
      ? `${t("cuisinePrefix")}: ${t("anyDash")}`
      : `${t("cuisinePrefix")}: ${cuisineLabel(p.cuisine)}`
  );

  if (p.area?.trim()) {
    parts.push(`${t("areaPrefix")}: ${areaLabel(p.area)}`);
  }

  parts.push(`${t("budgetPrefix")}: ${t("budgetComingSoon")}`);
  parts.push(`${t("constraintsPrefix")}: ${t("dietaryComingSoon")}`);
  parts.push(`${t("distanceMaxPrefix")}: ${p.maxKm} km`);
  parts.push(`${t("fromPrefix")}: ${getDistanceOriginLabel(p)}`);

  return parts.join(" | ");
}

// Placeholder thumbnails (SVG data URI)
function placeholderDataURI(type, title) {
  const label = typeLabel(type);
  const icon = (type === "hotel") ? "🛏️" : "🍽️";
  const tTitle = (title || "").slice(0, 32);
  const bg1 = (type === "hotel") ? "#E6F6EE" : "#EAF3FF";
  const bg2 = (type === "hotel") ? "#C9EEDB" : "#D6E7FF";

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${bg1}"/>
        <stop offset="1" stop-color="${bg2}"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="700" fill="url(#g)"/>
    <text x="70" y="150" font-size="84" font-family="Arial" fill="#0b1220">${icon}</text>
    <text x="70" y="260" font-size="44" font-family="Arial" fill="#0b1220" font-weight="700">${escapeHtml(label)}</text>
    <text x="70" y="340" font-size="34" font-family="Arial" fill="#2d3a4f">${escapeHtml(tTitle)}</text>
    <text x="70" y="420" font-size="26" font-family="Arial" fill="#5d6a7e">CityTaste • Ottawa</text>
  </svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

// Enrichment cache (quartier + photo)
const ENRICH_CACHE_KEY = "citytaste_enrich_cache_v2";
let enrichCache = {};
try {
  enrichCache = JSON.parse(localStorage.getItem(ENRICH_CACHE_KEY) || "{}");
} catch {
  enrichCache = {};
}

function saveEnrichCache() {
  localStorage.setItem(ENRICH_CACHE_KEY, JSON.stringify(enrichCache));
}

function getThumb(place) {
  const cached = enrichCache[place.id];
  const url = safeText(place.photo_url) || safeText(cached?.photo_url);
  return url || placeholderDataURI(place.type, place.name);
}

// Affichage de la vraie note
function getDisplayRating(place) {
  if (place.google_rating != null && !isNaN(place.google_rating)) {
    return place.google_rating;
  }
  return null;
}

function getDisplayRatingCount(place) {
  if (place.google_user_rating_count != null && !isNaN(place.google_user_rating_count)) {
    return place.google_user_rating_count;
  }
  return null;
}

// Scoring + explanation
function scorePlace(place, prefs) {
  const distanceKm = computeDistanceFromPrefs(place, prefs);
  let score = 0;

  if (prefs.type === "any") {
    score += 6;
  } else if (place.type === prefs.type) {
    score += 18;
  } else {
    return -9999;
  }

  if (prefs.cuisine !== "any") {
    if (placeMatchesCuisine(place, prefs.cuisine)) {
      score += 24;
    } else if (place.type === "restaurant") {
      score -= 40;
    }
  }

  if (prefs.searchText?.trim() && placeMatchesSearchText(place, prefs.searchText)) {
    score += 18;
  }

  if (prefs.area?.trim() && matchesArea(place, prefs.area)) {
    score += 14;
  }

  if (distanceKm != null) {
    const maxKm = Math.max(1, prefs.maxKm || DEFAULT_MAX_KM);
    const proximity = 1 - clamp(distanceKm / maxKm, 0, 1);
    score += Math.round(proximity * 22);
  } else {
    score -= 8;
  }

  const realRating = getDisplayRating(place);
  if (realRating != null) {
    score += realRating * 3;
  }

  const ratingCount = getDisplayRatingCount(place);
  if (ratingCount != null) {
    score += Math.min(6, Math.log10(ratingCount + 1) * 2);
  }

  score += place.info_score * 4;

  return Math.round(score);
}

function explain(place, prefs) {
  const reasons = [];
  const distanceKm = computeDistanceFromPrefs(place, prefs);
  const ratingVal = getDisplayRating(place);
  const ratingCount = getDisplayRatingCount(place);

  if (prefs.searchText?.trim() && placeMatchesSearchText(place, prefs.searchText)) {
    reasons.push(t("whySearchMatch", { query: prefs.searchText }));
  }

  if (prefs.cuisine !== "any" && placeMatchesCuisine(place, prefs.cuisine)) {
    reasons.push(t("whyCuisineMatch", { cuisine: cuisineLabel(prefs.cuisine).toLowerCase() }));
  }

  if (prefs.area?.trim() && matchesArea(place, prefs.area)) {
    reasons.push(t("whyAreaMatch"));
  }

  if (prefs.sortBy === "distance" && distanceKm != null) {
    reasons.push(t("whyDistanceTop", {
      km: distanceKm.toFixed(1),
      origin: getDistanceOriginShort(prefs)
    }));
  } else if (distanceKm != null) {
    reasons.push(t("whyDistance", {
      km: distanceKm.toFixed(1),
      origin: getDistanceOriginShort(prefs)
    }));
  }

  if (prefs.sortBy === "rating" && ratingVal != null) {
    reasons.push(t("whyRatingTop", {
      rating: ratingVal.toFixed(1),
      count: ratingCount != null
        ? `${currentLang === "en" ? `, ${ratingCount} reviews` : `, ${ratingCount} avis`}`
        : ""
    }));
  } else if (ratingVal != null && ratingVal >= 4.2) {
    reasons.push(t("whyRatingGood", {
      rating: ratingVal.toFixed(1)
    }));
  }

  if (!reasons.length) {
    reasons.push(t("whyFallback"));
  }

  return `${t("whyBecause")} ${reasons.join(currentLang === "en" ? " and " : " et ")}.`;
}

function hasMeaningfulFilters(prefs) {
  return Boolean(
    prefs.searchText?.trim() ||
    prefs.type !== "any" ||
    prefs.cuisine !== "any" ||
    prefs.area?.trim() ||
    Number(prefs.maxKm) !== DEFAULT_MAX_KM ||
    prefs.distanceMode === "user"
  );
}

function sortPlaces(list, prefs) {
  list.sort((a, b) => {
    const ad = Number.isFinite(a.distance_km) ? a.distance_km : 1e9;
    const bd = Number.isFinite(b.distance_km) ? b.distance_km : 1e9;
    const ar = getDisplayRating(a) ?? -1;
    const br = getDisplayRating(b) ?? -1;

    if (prefs.sortBy === "distance") {
      return ad - bd || br - ar || b.score - a.score;
    }

    if (prefs.sortBy === "rating") {
      return br - ar || ad - bd || b.score - a.score;
    }

    return b.score - a.score || br - ar || ad - bd;
  });

  return list;
}

// Reco pipeline
function computeRecommendations(prefs) {
  const candidates = PLACES
    .map(p => {
      const distance_km = computeDistanceFromPrefs(p, prefs);
      return {
        ...p,
        distance_km
      };
    })
    .filter(p => {
      if (prefs.type !== "any" && p.type !== prefs.type) return false;

      if (prefs.cuisine !== "any") {
        if (p.type !== "restaurant") return false;
        if (!placeMatchesCuisine(p, prefs.cuisine)) return false;
      }

      if (prefs.area?.trim() && !matchesArea(p, prefs.area)) return false;

      if (p.distance_km == null) return false;
      if (p.distance_km > prefs.maxKm) return false;

      return true;
    })
    .map(p => ({
      ...p,
      score: scorePlace(p, prefs),
      why: explain(p, prefs)
    }));

  sortPlaces(candidates, prefs);
  return candidates.slice(0, prefs.topN);
}

// Stars render
function renderStars(rating) {
  if (rating == null || isNaN(rating)) {
    return `<span class="rating-na">${escapeHtml(t("noteUnavailable"))}</span>`;
  }

  const fullStars = Math.floor(rating);
  const hasHalf = (rating - fullStars) >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);

  let html = "";

  for (let i = 0; i < fullStars; i++) {
    html += `<span class="star star--full">★</span>`;
  }

  if (hasHalf) {
    html += `<span class="star star--half">★</span>`;
  }

  for (let i = 0; i < emptyStars; i++) {
    html += `<span class="star star--empty">☆</span>`;
  }

  return html;
}

// Results render + search
function setResults(list, prefs) {
  currentResultsAll = list;
  currentPrefs = prefs;

  if (resultsSearch) resultsSearch.value = "";
  renderResultsFiltered("");
}

function renderResultsFiltered(query) {
  const q = (query || "").trim().toLowerCase();
  let list = currentResultsAll;

  if (q) {
    list = currentResultsAll.filter(p => {
      const hay = `${p.name} ${p.neighbourhood} ${p.city} ${p.address} ${p.cuisine_norm} ${(p.cuisine_tokens || []).join(" ")} ${(p.area_tokens || []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }

  countBadge.textContent = `${list.length} ${list.length > 1 ? t("resultsCountMany") : t("resultsCountOne")}`;
  activeFilters.textContent = prefsToText(currentPrefs || getPrefs());
  resultsSubtitle.textContent = q
    ? t("filteredBy", { query })
    : t("clickPlace");

  resultsEl.innerHTML = "";

  if (!list.length) {
    resultsEl.innerHTML = `<div class="empty">${escapeHtml(t("noResults"))}</div>`;
    return;
  }

  for (const p of list) {
    const distanceKm = Number.isFinite(p.distance_km)
      ? p.distance_km
      : computeDistanceFromPrefs(p, currentPrefs || getPrefs());

    const distanceTxt = distanceKm != null ? `${distanceKm.toFixed(1)} km` : `— km`;

    const ratingVal = getDisplayRating(p);
    const ratingCount = getDisplayRatingCount(p);
    const ratingTxt = ratingVal != null ? ratingVal.toFixed(1) : "—";
    const ratingCountTxt = ratingCount != null
      ? (currentLang === "en" ? `(${ratingCount} reviews)` : `(${ratingCount} avis)`)
      : "";

    const tags = [];
    tags.push(`<span class="tag tag--green">${escapeHtml(typeLabel(p.type))}</span>`);

    if (p.type === "restaurant" && p.cuisine_norm && p.cuisine_norm !== "unknown") {
      tags.push(`<span class="tag">${escapeHtml(cuisineLabel(p.cuisine_norm))}</span>`);
    }

    if (p.area_norm) {
      tags.push(`<span class="tag">${escapeHtml(areaLabel(p.area_norm))}</span>`);
    }

    if (p.website) tags.push(`<span class="tag">${escapeHtml(t("tagWebsite"))}</span>`);
    if (p.phone) tags.push(`<span class="tag">${escapeHtml(t("tagPhone"))}</span>`);
    if (p.opening_hours) tags.push(`<span class="tag">${escapeHtml(t("tagHours"))}</span>`);

    const thumb = getThumb(p);

    const html = `
      <article class="card placeCard" data-id="${escapeHtml(p.id)}">
        <img class="thumb" src="${thumb}" alt="${escapeHtml(p.name)}" loading="lazy" />
        <div class="placeRight">
          <div class="placeTop">
            <div>
              <h3 class="placeTitle">${escapeHtml(p.name)}</h3>
              <div class="subline">
                <span>${escapeHtml(typeLabel(p.type))} • ${escapeHtml(p.neighbourhood || p.city || "Ottawa")} • ${distanceTxt}</span>
                <span class="rating">
                  ${renderStars(ratingVal)}
                  ${ratingVal != null ? `<span>${ratingTxt}</span>` : ""}
                  ${ratingVal != null ? `<span class="rating-count">${ratingCountTxt}</span>` : ""}
                </span>
              </div>
            </div>
            <div class="score">${escapeHtml(t("scoreLabel"))}: ${p.score}</div>
          </div>

          <div class="tags">${tags.slice(0, 6).join("")}</div>
          <div class="why">${escapeHtml(p.why)}</div>
        </div>
      </article>
    `;

    resultsEl.insertAdjacentHTML("beforeend", html);
  }

  resultsEl.querySelectorAll(".placeCard").forEach(card => {
    card.addEventListener("click", async () => {
      const id = card.dataset.id;
      await openDetails(id, currentPrefs || getPrefs());
    });
  });
}

async function reverseGeocode(lat, lon) {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=18&addressdetails=1&accept-language=fr`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Reverse geocode failed");
  return await res.json();
}

async function wikidataToImageUrl(qid) {
  const q = (qid || "").trim();
  if (!/^Q\d+$/i.test(q)) return "";

  const entityUrl = `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(q)}.json`;
  const eRes = await fetch(entityUrl);
  if (!eRes.ok) return "";
  const eJson = await eRes.json();

  const ent = eJson.entities?.[q.toUpperCase()];
  const p18 = ent?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  if (!p18) return "";

  const title = `File:${p18}`;
  const commonsUrl =
    `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url&iiurlwidth=1100&format=json&origin=*`;
  const cRes = await fetch(commonsUrl);
  if (!cRes.ok) return "";
  const cJson = await cRes.json();

  const pages = cJson.query?.pages || {};
  const page = pages[Object.keys(pages)[0]];
  const info = page?.imageinfo?.[0];
  return info?.thumburl || info?.url || "";
}

async function ensureEnrichment(place) {
  const key = place.id;
  const cached = enrichCache[key];

  if (cached) {
    place.neighbourhood = cached.neighbourhood || place.neighbourhood;
    place.photo_url = cached.photo_url || place.photo_url;
    return;
  }

  const newData = {};

  // Quartier via reverse geocode (si manquant)
  if (!place.neighbourhood && place.lat != null && place.lon != null) {
    try {
      const geo = await reverseGeocode(place.lat, place.lon);
      const a = geo.address || {};
      newData.neighbourhood =
        a.neighbourhood || a.suburb || a.city_district || a.county || "";
    } catch {}
  }

  // Photo via Wikidata si dispo
  if (!place.photo_url && place.wikidata) {
    try {
      const url = await wikidataToImageUrl(place.wikidata);
      if (url) newData.photo_url = url;
    } catch {}
  }

  place.neighbourhood = newData.neighbourhood || place.neighbourhood;
  place.photo_url = newData.photo_url || place.photo_url;

  enrichCache[key] = newData;
  saveEnrichCache();
}

// Modal
async function openDetails(placeId, prefs) {
  const p = PLACES.find(x => x.id === placeId);
  if (!p) return;

  await ensureEnrichment(p);

  const score = scorePlace(p, prefs);
  const why = explain(p, prefs);
  const ratingVal = getDisplayRating(p);
  const ratingCount = getDisplayRatingCount(p);
  const distanceKm = computeDistanceFromPrefs(p, prefs);

  mTitle.textContent = p.name;
  mSub.textContent = `${typeLabel(p.type)} • ${p.neighbourhood || p.city || "Ottawa"}`;

  mRating.textContent = ratingVal != null
    ? `${ratingVal.toFixed(1)}${ratingCount != null ? (currentLang === "en" ? ` (${ratingCount} reviews)` : ` (${ratingCount} avis)`) : ""}`
    : t("noteUnavailable");

  mBudget.textContent = t("budgetComingSoon");
  mDistance.textContent = distanceKm != null
    ? `${distanceKm.toFixed(1)} km ${currentLang === "en" ? `from ${getDistanceOriginShort(prefs)}` : `depuis ${getDistanceOriginShort(prefs)}`}`
    : t("anyDash");
  mScore.textContent = String(score);

  mWhy.textContent = why;

  mPhoto.src = getThumb(p);
  mPhoto.alt = p.name;

  // Tags
  mTags.innerHTML = "";
  const tagList = [];
  tagList.push(typeLabel(p.type));

  if (p.type === "restaurant" && p.cuisine_norm && p.cuisine_norm !== "unknown") {
    tagList.push(cuisineLabel(p.cuisine_norm));
  }

  if (p.area_norm) tagList.push(areaLabel(p.area_norm));
  if (p.website) tagList.push(t("tagWebsite"));
  if (p.phone) tagList.push(t("tagPhone"));
  if (p.opening_hours) tagList.push(t("tagHours"));
  if (p.wheelchair) tagList.push(t("tagAccessibility"));

  tagList.slice(0, 10).forEach(tag => {
    const span = document.createElement("span");
    span.className = "tag";
    span.textContent = tag;
    mTags.appendChild(span);
  });

  mAddress.textContent = p.address || t("anyDash");
  mArea.textContent = p.neighbourhood || p.city || t("anyDash");
  mHours.textContent = p.opening_hours || t("anyDash");
  mPhone.textContent = p.phone || t("anyDash");

  if (p.website) {
    mWebsite.innerHTML = `<a href="${p.website}" target="_blank" rel="noreferrer">${escapeHtml(p.website)}</a>`;
  } else {
    mWebsite.textContent = t("anyDash");
  }

  if (p.lat != null && p.lon != null) {
    mMaps.href = `https://www.google.com/maps?q=${p.lat},${p.lon}`;
  } else {
    const q = encodeURIComponent(`${p.name}, ${p.address || "Ottawa"}`);
    mMaps.href = `https://www.google.com/maps/search/?api=1&query=${q}`;
  }

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

overlay?.addEventListener("click", closeModal);
btnCloseModal?.addEventListener("click", closeModal);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modal && !modal.classList.contains("hidden")) {
    closeModal();
  }
});

// Actions (home / filters / results)
function quickExplore(query) {
  clearInlineMessages();

  const q = (query || "").trim();
  if (!q) {
    setInlineMessage(quickSearchFeedback, t("quickSearchEmpty"));
    quickSearch?.focus();
    return;
  }

  const prefs = {
    ...getPrefs(),
    searchText: q
  };

  const list = PLACES
    .map(p => ({
      ...p,
      distance_km: computeDistanceFromPrefs(p, prefs)
    }))
    .filter(p => placeMatchesSearchText(p, q))
    .map(p => ({
      ...p,
      score: scorePlace(p, prefs),
      why: explain(p, prefs)
    }));

  sortPlaces(list, prefs);

  setResults(list.slice(0, prefs.topN), prefs);
  showResults();
}

function recommend() {
  clearInlineMessages();

  const prefs = getPrefs();

  if (!hasMeaningfulFilters(prefs)) {
    setInlineMessage(filtersFeedback, t("filtersEmpty"));
    showFilters();
    return;
  }

  if (prefs.distanceMode === "user" && !hasUserLocation()) {
    setInlineMessage(filtersFeedback, t("locationNeeded"));
    showFilters();
    return;
  }

  const list = computeRecommendations(prefs);
  setResults(list, prefs);
  showResults();
}

function resetForm() {
  if (el("type")) el("type").value = "any";
  setSelectedCuisineValue("any", true);
  setSelectedAreaValue("", true);
  if (el("maxKm")) el("maxKm").value = DEFAULT_MAX_KM;
  if (el("topN")) el("topN").value = 12;
  if (el("sortBy")) el("sortBy").value = "score";

  if (cuisineInput) cuisineInput.value = "";
  if (areaInput) areaInput.value = "";
  hideCuisineSuggestions();
  hideAreaSuggestions();

  if (distanceModeCenter) distanceModeCenter.checked = true;
  if (distanceModeUser) distanceModeUser.checked = false;

  locationState.mode = "center";
  clearInlineMessages();
  updateLocationStatus(t("locationCenterMsg"));
  syncCuisineFieldState();
}

function rerunCurrentResults() {
  if (!currentPrefs) return;

  const nextPrefs = {
    ...currentPrefs,
    distanceMode: getSelectedDistanceMode()
  };

  if (currentPrefs.searchText) {
    quickExplore(currentPrefs.searchText);
    return;
  }

  if (!hasMeaningfulFilters(nextPrefs)) return;

  const list = computeRecommendations(nextPrefs);
  setResults(list, nextPrefs);
}

function updateLanguageUI() {
  document.documentElement.lang = currentLang;
  updateLanguageButtons();

  if (btnNavHome) btnNavHome.textContent = t("navHome");
  if (btnNavFilters) btnNavFilters.textContent = t("navFilters");

  const homeTitle = document.querySelector(".homeContent h1");
  const homeIntro = document.querySelector(".homeContent p");
  if (homeTitle) homeTitle.textContent = t("heroTitle");
  if (homeIntro) homeIntro.textContent = t("heroText");

  if (quickSearch) quickSearch.placeholder = t("quickSearchPlaceholder");
  if (btnExplore) btnExplore.textContent = t("explore");
  if (btnAdvanced) btnAdvanced.textContent = t("advancedFilters");

  const statLabels = document.querySelectorAll(".homeStats .stat__label");
  if (statLabels[0]) statLabels[0].textContent = t("dataStatusLabel");
  if (statLabels[1]) statLabels[1].textContent = t("dataCountLabel");
  if (statLabels[2]) statLabels[2].textContent = t("dataSourceLabel");

  const filtersTitle = document.querySelector("#builderView .filters h2");
  if (filtersTitle) filtersTitle.textContent = t("preferences");

  const typeLabelEl = document.querySelector('label[for="type"]');
  const cuisineLabelEl = document.querySelector('label[for="cuisineInput"]');
  const budgetLabelEl = document.querySelector('label[for="budget"]');
  const maxKmLabelEl = document.querySelector('label[for="maxKm"]');
  const areaLabelEl = document.querySelector('label[for="areaInput"]');
  const topNLabelEl = document.querySelector('label[for="topN"]');
  const sortByLabelEl = document.querySelector('label[for="sortBy"]');

  if (typeLabelEl) typeLabelEl.textContent = t("placeType");
  if (cuisineLabelEl) cuisineLabelEl.textContent = t("cuisineCategory");
  if (budgetLabelEl) {
    const badge = document.getElementById("budgetSoonBadge");
    budgetLabelEl.childNodes[0].textContent = `${t("budget")} `;
    if (badge) badge.textContent = t("budgetComingSoon");
  }
  if (maxKmLabelEl) maxKmLabelEl.textContent = t("maxDistance");
  if (areaLabelEl) areaLabelEl.textContent = t("area");
  if (topNLabelEl) topNLabelEl.textContent = t("topN");
  if (sortByLabelEl) sortByLabelEl.textContent = t("sortBy");

  const typeSelect = el("type");
  if (typeSelect) {
    if (typeSelect.options[0]) typeSelect.options[0].text = t("typeAny");
    if (typeSelect.options[1]) typeSelect.options[1].text = t("typeRestaurant");
    if (typeSelect.options[2]) typeSelect.options[2].text = t("typeHotel");
  }

  const budgetSelect = el("budget");
  if (budgetSelect) {
    if (budgetSelect.options[0]) budgetSelect.options[0].text = t("budgetAny");
  }

  const sortSelect = el("sortBy");
  if (sortSelect) {
    if (sortSelect.options[0]) sortSelect.options[0].text = t("sortScore");
    if (sortSelect.options[1]) sortSelect.options[1].text = t("sortRating");
    if (sortSelect.options[2]) sortSelect.options[2].text = t("sortDistance");
  }

  if (cuisineInput) cuisineInput.placeholder = t("cuisinePlaceholder");
  const cuisineHint = document.querySelector("#cuisineAutocomplete + .hint");
  if (cuisineHint) cuisineHint.textContent = t("cuisineHint");

  const distanceField = distanceModeCenter?.closest(".field");
  const distanceFieldLabel = distanceField
    ? Array.from(distanceField.children).find(child => child.tagName === "LABEL")
    : null;
  if (distanceFieldLabel) distanceFieldLabel.textContent = t("distanceSource");

  if (distanceModeCenter?.parentElement) setControlText(distanceModeCenter.parentElement, t("ottawaCenter"));
  if (distanceModeUser?.parentElement) setControlText(distanceModeUser.parentElement, t("myLocation"));
  if (btnUseMyLocation) btnUseMyLocation.textContent = t("activateLocation");

  const dietaryField = el("veg")?.closest(".field");
  const dietaryFieldLabel = dietaryField
    ? Array.from(dietaryField.children).find(child => child.tagName === "LABEL")
    : null;
  if (dietaryFieldLabel) {
    const badge = document.getElementById("dietSoonBadge");
    dietaryFieldLabel.childNodes[0].textContent = `${t("dietary")} `;
    if (badge) badge.textContent = t("dietaryComingSoon");
  }

  if (el("veg")?.parentElement) setControlText(el("veg").parentElement, t("veg"));
  if (el("halal")?.parentElement) setControlText(el("halal").parentElement, t("halal"));
  if (el("glutenfree")?.parentElement) setControlText(el("glutenfree").parentElement, t("glutenfree"));

  const budgetHint = document.getElementById("budgetHint");
  if (budgetHint) budgetHint.textContent = t("budgetHintText");
  const dietHint = document.getElementById("dietHint");
  if (dietHint) dietHint.textContent = t("dietaryHintText");

  if (areaInput) areaInput.placeholder = t("areaPlaceholder");
  const areaHint = areaLabelEl?.parentElement?.querySelector(".hint");
  if (areaHint) areaHint.textContent = t("areaHint");

  if (btnReco) btnReco.textContent = t("recommend");
  if (btnReset) btnReset.textContent = t("reset");

  const sideText = document.querySelector(".side__content .muted");
  if (sideText) sideText.textContent = t("sideText");

  const miniLabels = document.querySelectorAll(".side__kpis .mini__label");
  if (miniLabels[0]) miniLabels[0].textContent = t("places");
  if (miniLabels[1]) miniLabels[1].textContent = t("restaurants");
  if (miniLabels[2]) miniLabels[2].textContent = t("hotels");

  const resultsTitle = document.querySelector("#resultsView h2");
  if (resultsTitle) resultsTitle.textContent = t("results");

  if (btnBackToFilters) btnBackToFilters.textContent = t("backFilters");
  if (btnBackToHome) btnBackToHome.textContent = t("backHome");
  if (resultsSearch) resultsSearch.placeholder = t("resultsSearchPlaceholder");
  if (btnClearResultsSearch) btnClearResultsSearch.textContent = t("clear");

  const modalKpiLabels = document.querySelectorAll(".modal .kpi__label");
  if (modalKpiLabels[0]) modalKpiLabels[0].textContent = t("modalRatingLabel");
  if (modalKpiLabels[1]) modalKpiLabels[1].textContent = t("modalBudgetLabel");
  if (modalKpiLabels[2]) modalKpiLabels[2].textContent = t("modalDistanceLabel");
  if (modalKpiLabels[3]) modalKpiLabels[3].textContent = t("modalScoreLabel");

  const sectionTitles = document.querySelectorAll(".modal .sectionTitle");
  if (sectionTitles[0]) sectionTitles[0].textContent = t("modalTags");
  if (sectionTitles[1]) sectionTitles[1].textContent = t("modalWhy");
  if (sectionTitles[2]) sectionTitles[2].textContent = t("modalInfo");

  const infoRowTitles = document.querySelectorAll(".infoRow span:first-child");
  if (infoRowTitles[0]) infoRowTitles[0].textContent = t("address");
  if (infoRowTitles[1]) infoRowTitles[1].textContent = t("neighbourhood");
  if (infoRowTitles[2]) infoRowTitles[2].textContent = t("hours");
  if (infoRowTitles[3]) infoRowTitles[3].textContent = t("phone");
  if (infoRowTitles[4]) infoRowTitles[4].textContent = t("website");

  if (mMaps) mMaps.textContent = t("openMaps");

  const currentCuisine = getSelectedCuisineValue();
  if (cuisineInput && currentCuisine !== "any" && cuisineHidden) {
    setSelectedCuisineValue(currentCuisine, true);
  }

  const currentArea = getSelectedAreaValue();
  if (areaInput && currentArea) {
    setSelectedAreaValue(currentArea, true);
  }

  if (quickSearchFeedback?.textContent) {
    if (
      quickSearchFeedback.textContent.includes("mot-clé") ||
      quickSearchFeedback.textContent.includes("keyword")
    ) {
      setInlineMessage(quickSearchFeedback, t("quickSearchEmpty"));
    }
  }

  if (filtersFeedback?.textContent) {
    if (
      filtersFeedback.textContent.includes("filtre") ||
      filtersFeedback.textContent.includes("filter")
    ) {
      setInlineMessage(filtersFeedback, t("filtersEmpty"));
    } else if (
      filtersFeedback.textContent.includes("position") ||
      filtersFeedback.textContent.includes("location")
    ) {
      setInlineMessage(filtersFeedback, t("locationNeeded"));
    }
  }

  if (locationStatus) {
    const msg = locationStatus.textContent;
    if (
      msg.includes("centre d’Ottawa") ||
      msg.includes("Ottawa center")
    ) {
      if (distanceModeUser?.checked && hasUserLocation()) {
        updateLocationStatus(t("locationUserMsg"));
      } else {
        updateLocationStatus(t("locationCenterMsg"));
      }
    }
  }

  if (dataStatus) {
    if (dataStatus.textContent === "Chargement…" || dataStatus.textContent === "Loading…") {
      dataStatus.textContent = t("statusLoading");
    } else if (dataStatus.textContent === "OK") {
      dataStatus.textContent = t("statusOk");
    } else if (dataStatus.textContent === "Erreur" || dataStatus.textContent === "Error") {
      dataStatus.textContent = t("statusError");
    }
  }

  updateChatbotLanguageUI();

  if (currentPrefs) {
    activeFilters.textContent = prefsToText(currentPrefs);
    renderResultsFiltered(resultsSearch?.value || "");
  }

  renderCuisineExplorerCards();

  if (el("cuisineDirectoryView")?.classList.contains("is-open")) {
    renderCuisineDirectoryGrid(el("cuisineDirectorySearch")?.value || "");
  }
  syncCuisineFieldState();
}

// Events
btnNavHome?.addEventListener("click", showHome);
btnNavFilters?.addEventListener("click", showFilters);

btnLangFr?.addEventListener("click", () => setLanguage("fr"));
btnLangEn?.addEventListener("click", () => setLanguage("en"));

el("type")?.addEventListener("change", () => {
  syncCuisineFieldState();
});

btnAdvanced?.addEventListener("click", showFilters);
btnExplore?.addEventListener("click", () => quickExplore(quickSearch?.value || ""));
quickSearch?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") quickExplore(quickSearch.value || "");
});

document.querySelectorAll(".chipBtn").forEach(b => {
  b.addEventListener("click", () => {
    const q = b.dataset.q || "";
    if (quickSearch) quickSearch.value = q;
    quickExplore(q);
  });
});

btnReco?.addEventListener("click", recommend);
btnReset?.addEventListener("click", resetForm);

btnBackToFilters?.addEventListener("click", showFilters);
btnBackToHome?.addEventListener("click", showHome);

resultsSearch?.addEventListener("input", () => renderResultsFiltered(resultsSearch.value || ""));
btnClearResultsSearch?.addEventListener("click", () => {
  if (resultsSearch) resultsSearch.value = "";
  renderResultsFiltered("");
});

distanceModeCenter?.addEventListener("change", () => {
  if (!distanceModeCenter.checked) return;
  locationState.mode = "center";
  clearInlineMessages();
  updateLocationStatus(t("locationCenterMsg"));
  rerunCurrentResults();
});

distanceModeUser?.addEventListener("change", async () => {
  if (!distanceModeUser.checked) return;

  locationState.mode = "user";
  clearInlineMessages();

  if (hasUserLocation()) {
    updateLocationStatus(t("locationUserMsg"));
    rerunCurrentResults();
    return;
  }

  const ok = await requestUserLocation();
  if (ok) rerunCurrentResults();
});

btnUseMyLocation?.addEventListener("click", async () => {
  clearInlineMessages();
  const ok = await requestUserLocation();
  if (ok) rerunCurrentResults();
});

/* =========================
   CITYTASTE CHATBOT
========================= */

const CHATBOT_API_URL = "/api/chat";

const chatbotToggle = el("chatbotToggle");
const chatbotPanel = el("chatbotPanel");
const chatbotClose = el("chatbotClose");
const chatbotMessages = el("chatbotMessages");
const chatbotInput = el("chatbotInput");
const chatbotSend = el("chatbotSend");
const chatbotTitle = el("chatbotTitle");
const chatbotSubtitle = el("chatbotSubtitle");
const chatbotWelcomeMessage = el("chatbotWelcomeMessage");
const chatbotSuggestions = el("chatbotSuggestions");

const chatbotI18n = {
  fr: {
    title: "Assistant CityTaste",
    subtitle: "Pose une question sur le site ou les résultats",
    welcome:
      "Bonjour 👋 Je peux t’aider à utiliser CityTaste, comprendre les filtres et mieux lire les résultats.",
    placeholder: "Écris ta question...",
    send: "Envoyer",
    openLabel: "Ouvrir l’assistant CityTaste",
    closeLabel: "Fermer l’assistant",
    thinking: "CityTaste écrit…",
    error:
      "Je n’arrive pas à joindre l’assistant pour le moment. Vérifie que le service de l’assistant est disponible.",
    empty:
      "Écris une question avant d’envoyer le message.",
    suggestions: [
      "Comment utiliser les filtres ?",
      "Comment activer ma position ?",
      "Comment les résultats sont classés ?"
    ]
  },
  en: {
    title: "CityTaste Assistant",
    subtitle: "Ask a question about the site or the results",
    welcome:
      "Hello 👋 I can help you use CityTaste, understand the filters, and better read the results.",
    placeholder: "Write your question...",
    send: "Send",
    openLabel: "Open the CityTaste assistant",
    closeLabel: "Close the assistant",
    thinking: "CityTaste is typing…",
    error:
      "I can’t reach the assistant right now. Make sure the assistant service is available.",
    empty:
      "Write a question before sending the message.",
    suggestions: [
      "How do I use filters?",
      "How do I enable my location?",
      "How are the results ranked?"
    ]
  }
};

function getChatbotText() {
  return chatbotI18n[currentLang] || chatbotI18n.fr;
}

function openChatbot() {
  if (!chatbotPanel) return;
  chatbotPanel.classList.remove("hidden");
  chatbotInput?.focus();
}

function closeChatbot() {
  chatbotPanel?.classList.add("hidden");
}

function autoResizeChatbotInput() {
  if (!chatbotInput) return;
  chatbotInput.style.height = "auto";
  chatbotInput.style.height = `${Math.min(chatbotInput.scrollHeight, 120)}px`;
}

function appendChatbotMessage(text, sender = "bot", extraClass = "") {
  if (!chatbotMessages) return null;

  const msg = document.createElement("div");
  msg.className = `chatbot-message ${sender} ${extraClass}`.trim();
  msg.textContent = text;
  chatbotMessages.appendChild(msg);
  chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
  return msg;
}

function getVisibleResultNames() {
  if (!Array.isArray(currentResultsAll) || !currentResultsAll.length) return [];
  return currentResultsAll.slice(0, 5).map(p => p.name).filter(Boolean);
}

function getCurrentViewName() {
  if (resultsView && !resultsView.classList.contains("hidden")) return "results";
  if (builderView && !builderView.classList.contains("hidden")) return "filters";
  return "home";
}

function buildChatbotContext() {
  return {
    ui_language: currentLang,
    current_view: getCurrentViewName(),
    prefs: currentPrefs || getPrefs(),
    visible_results: getVisibleResultNames(),
    location: {
      mode: locationState.mode,
      has_user_coords: hasUserLocation()
    }
  };
}

async function sendChatbotMessage(prefilledText = null) {
  const ui = getChatbotText();
  const text = String(prefilledText ?? chatbotInput?.value ?? "").trim();

  if (!text) {
    appendChatbotMessage(ui.empty, "bot");
    return;
  }

  appendChatbotMessage(text, "user");

  if (chatbotInput) {
    chatbotInput.value = "";
    autoResizeChatbotInput();
  }

  if (chatbotSend) chatbotSend.disabled = true;

  const typingNode = appendChatbotMessage(ui.thinking, "bot", "typing");

  try {
    const response = await fetch(CHATBOT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: text,
        context: buildChatbotContext()
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (typingNode) typingNode.remove();

    const answer =
      data?.answer ||
      data?.message ||
      (currentLang === "en"
        ? "Sorry, I could not generate a response."
        : "Désolé, je n’ai pas pu générer une réponse.");

    appendChatbotMessage(answer, "bot");
  } catch (err) {
    console.error("Chatbot error:", err);

    if (typingNode) typingNode.remove();
    appendChatbotMessage(ui.error, "bot");
  } finally {
    if (chatbotSend) chatbotSend.disabled = false;
  }
}

function renderChatbotSuggestions() {
  if (!chatbotSuggestions) return;

  const ui = getChatbotText();
  chatbotSuggestions.innerHTML = ui.suggestions
    .map(
      (label) => `<button class="chatbot-chip" type="button">${escapeHtml(label)}</button>`
    )
    .join("");

  chatbotSuggestions.querySelectorAll(".chatbot-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      sendChatbotMessage(btn.textContent || "");
    });
  });
}

function updateChatbotLanguageUI() {
  const ui = getChatbotText();

  if (chatbotTitle) chatbotTitle.textContent = ui.title;
  if (chatbotSubtitle) chatbotSubtitle.textContent = ui.subtitle;
  if (chatbotWelcomeMessage) chatbotWelcomeMessage.textContent = ui.welcome;
  if (chatbotInput) chatbotInput.placeholder = ui.placeholder;
  if (chatbotSend) chatbotSend.textContent = ui.send;

  if (chatbotToggle) {
    chatbotToggle.setAttribute("aria-label", ui.openLabel);
    chatbotToggle.setAttribute("title", ui.title);
  }

  if (chatbotClose) {
    chatbotClose.setAttribute("aria-label", ui.closeLabel);
    chatbotClose.setAttribute("title", ui.closeLabel);
  }

  renderChatbotSuggestions();
}

chatbotToggle?.addEventListener("click", openChatbot);
chatbotClose?.addEventListener("click", closeChatbot);

chatbotSend?.addEventListener("click", () => {
  sendChatbotMessage();
});

chatbotInput?.addEventListener("input", autoResizeChatbotInput);

chatbotInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendChatbotMessage();
  }
});

// Init (load data)
(async function init() {
  try {
    if (btnReco) btnReco.disabled = true;
    if (dataStatus) dataStatus.textContent = t("statusLoading");
    if (dataNote) {
      dataNote.style.display = "none";
      dataNote.textContent = "";
    }

    const csvText = await loadCSV();
    const rows = parseCSV(csvText);
    PLACES = buildPlacesFromRows(rows);
    initCuisineAutocomplete();
    initAreaAutocomplete();

    const nAll = PLACES.length;
    const nRest = PLACES.filter(p => p.type === "restaurant").length;
    const nHot = PLACES.filter(p => p.type === "hotel").length;

    if (dataStatus) dataStatus.textContent = t("statusOk");
    if (dataCount) dataCount.textContent = String(nAll);

    if (kpiPlaces) kpiPlaces.textContent = String(nAll);
    if (kpiRestaurants) kpiRestaurants.textContent = String(nRest);
    if (kpiHotels) kpiHotels.textContent = String(nHot);

    if (btnReco) btnReco.disabled = false;

    updateLocationStatus(t("locationCenterMsg"));
    updateLanguageUI();
    syncCuisineFieldState();
    showHome();
  } catch (err) {
    if (dataStatus) dataStatus.textContent = t("statusError");
    if (dataCount) dataCount.textContent = "—";
    if (dataNote) {
      dataNote.style.display = "block";
      dataNote.textContent = String(err.message || err);
    }
    if (btnReco) btnReco.disabled = true;
    updateLanguageUI();
    showHome();
  }
})();