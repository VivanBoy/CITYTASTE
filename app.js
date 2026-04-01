// CityTaste — Ottawa (CSV OSM) + Landing + Results Search + Thumbnails
// - Validation stricte du bouton Explorer
// - Filtre cuisine corrigé (filtre dur)
// - Tri amélioré (pertinence / note / distance)
// - "Pourquoi recommandé" plus intelligent
// - Distance calculée depuis le centre d’Ottawa OU la position actuelle de l’utilisateur
// IMPORTANT: lancer via Live Server / http.server pour que fetch CSV marche

const CSV_CANDIDATE_PATHS = [
  "data/processed/ottawa_places_enriched_google_photos.csv",
  "data/processed/ottawa_places_enriched_google.csv",
  "data/processed/ottawa_places_cleaned_v2.csv",
  "data/ottawa_places_cleaned_v2.csv",
  "ottawa_places_cleaned_v2.csv",
];

// Centre Ottawa (fallback)
const OTTAWA_CENTER = { lat: 45.4215, lon: -75.6972 };
const DEFAULT_MAX_KM = 8;

let PLACES = [];
let currentResultsAll = [];
let currentPrefs = null;

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

function typeLabel(t) {
  return t === "restaurant" ? "Restaurant" : "Hébergement";
}

function cuisineLabel(c) {
  const map = {
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
    any: "—",
    unknown: "Cuisine non précisée"
  };
  return map[c] || c || "Cuisine non précisée";
}

function budgetLabel(b) {
  return b === "low" ? "$" : b === "mid" ? "$$" : b === "high" ? "$$$" : "—";
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
  return prefs?.distanceMode === "user" ? "ma position actuelle" : "centre d’Ottawa";
}

function getDistanceOriginShort(prefs) {
  return prefs?.distanceMode === "user" ? "votre position" : "le centre d’Ottawa";
}

async function requestUserLocation() {
  if (!navigator.geolocation) {
    locationState.mode = "center";
    if (distanceModeCenter) distanceModeCenter.checked = true;
    if (distanceModeUser) distanceModeUser.checked = false;
    updateLocationStatus("La géolocalisation n’est pas disponible sur ce navigateur. Le centre d’Ottawa est utilisé.");
    return false;
  }

  updateLocationStatus("Demande de localisation en cours…");

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

        updateLocationStatus("Position détectée. La distance sera calculée depuis votre position actuelle.");
        resolve(true);
      },
      (err) => {
        locationState.permission = err.code === 1 ? "denied" : "error";
        locationState.mode = "center";

        if (distanceModeCenter) distanceModeCenter.checked = true;
        if (distanceModeUser) distanceModeUser.checked = false;

        updateLocationStatus(
          err.code === 1
            ? "Autorisation refusée. La distance reste calculée depuis le centre d’Ottawa."
            : "Impossible de récupérer la position. Le centre d’Ottawa est utilisé."
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
  homeView?.classList.remove("hidden");
  builderView?.classList.add("hidden");
  resultsView?.classList.add("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showFilters() {
  homeView?.classList.add("hidden");
  builderView?.classList.remove("hidden");
  resultsView?.classList.add("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showResults() {
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
  throw new Error("Impossible de charger les données. Lance le projet via Live Server ou http.server.");
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
  const t = safeText(place_type).toLowerCase();
  if (t === "restaurant") return "restaurant";
  if (["hotel", "guest_house", "motel", "hostel"].includes(t)) return "hotel";
  return "restaurant";
}

// Cuisine helpers
const CUISINE_EQUIVALENTS = {
  italian: ["italian", "pizza", "pasta"],
  indian: ["indian", "pakistani", "nepalese", "bangladeshi", "punjabi"],
  asian: ["asian", "chinese", "japanese", "vietnamese", "thai", "korean", "sushi", "ramen", "filipino"],
  african: ["african", "ethiopian", "eritrean", "moroccan", "algerian", "tunisian", "senegalese", "somali", "nigerian", "ghanaian"],
  canadian: ["canadian", "american", "burger", "bbq", "grill", "diner", "steakhouse"],
  cafe: ["cafe", "coffee", "coffee shop", "bakery", "brunch", "breakfast", "tea room", "bistro"]
};

const CUISINE_TOKEN_TO_CANON = Object.entries(CUISINE_EQUIVALENTS).reduce((acc, [canon, raws]) => {
  raws.forEach(raw => {
    acc[normalizeText(raw)] = canon;
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
  const t = normalizeText(token);
  if (!t) return "";

  if (["any", "unknown", "unspecified", "none", "na"].includes(t)) {
    return "unknown";
  }

  if (CUISINE_TOKEN_TO_CANON[t]) {
    return CUISINE_TOKEN_TO_CANON[t];
  }

  for (const [rawToken, canon] of Object.entries(CUISINE_TOKEN_TO_CANON)) {
    if (t.includes(rawToken)) return canon;
  }

  return t;
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

  const cuisineTokens = [...new Set(
    rawCandidates
      .flatMap(splitRawCuisineValue)
      .map(normalizeCuisineToken)
      .filter(Boolean)
  )];

  const cuisinePrimary = cuisineTokens[0] || "unknown";

  return {
    cuisine_primary: cuisinePrimary,
    cuisine_tokens: cuisinePrimary === "unknown" ? [] : cuisineTokens,
    cuisine_raw_list: listFromCsv
  };
}

function placeMatchesCuisine(place, desiredCuisine) {
  if (!desiredCuisine || desiredCuisine === "any") return true;
  if (place.type !== "restaurant") return false;
  if (!Array.isArray(place.cuisine_tokens) || !place.cuisine_tokens.length) return false;
  return place.cuisine_tokens.includes(desiredCuisine);
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
    ...(place.cuisine_tokens || [])
  ].join(" "));

  const terms = q.split(" ").filter(Boolean);
  return terms.every(term => hay.includes(term));
}

function matchesArea(place, areaValue) {
  const q = normalizeText(areaValue);
  if (!q) return true;

  const hay = normalizeText(`${place.neighbourhood} ${place.city} ${place.address}`);
  const terms = q.split(" ").filter(Boolean);

  return terms.every(term => hay.includes(term));
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
      cuisine_list: cuisineMeta.cuisine_raw_list,
      cuisine_unknown: cuisineMeta.cuisine_primary === "unknown",

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
      neighbourhood: "",

      _tags: tagsObj,
    });
  }

  return places;
}

// Preferences
function getPrefs() {
  return {
    type: el("type")?.value || "any",
    cuisine: el("cuisine")?.value || "any",
    budget: el("budget")?.value || "any",
    maxKm: Number(el("maxKm")?.value || DEFAULT_MAX_KM),
    veg: !!el("veg")?.checked,
    halal: !!el("halal")?.checked,
    glutenfree: !!el("glutenfree")?.checked,
    area: el("area")?.value || "",
    topN: clamp(Number(el("topN")?.value || 12), 3, 20),
    sortBy: el("sortBy")?.value || "score",
    distanceMode: getSelectedDistanceMode(),
    searchText: ""
  };
}

function prefsToText(p) {
  const parts = [];

  if (p.searchText?.trim()) {
    parts.push(`Recherche: ${p.searchText.trim()}`);
  }

  parts.push(p.type === "any" ? "Type: tous" : `Type: ${typeLabel(p.type)}`);
  parts.push(p.cuisine === "any" ? "Cuisine: —" : `Cuisine: ${cuisineLabel(p.cuisine)}`);
  parts.push(p.budget === "any" ? "Budget: —" : `Budget: ${budgetLabel(p.budget)}`);
  parts.push(`Distance max: ${p.maxKm} km`);
  parts.push(`Depuis: ${getDistanceOriginLabel(p)}`);

  const diet = [];
  if (p.veg) diet.push("Végétarien");
  if (p.halal) diet.push("Halal");
  if (p.glutenfree) diet.push("Sans gluten");

  parts.push(diet.length ? `Contraintes: ${diet.join(", ")}` : "Contraintes: —");

  if (p.area.trim()) parts.push(`Zone: ${p.area.trim()}`);

  return parts.join(" | ");
}

// Placeholder thumbnails (SVG data URI)
function placeholderDataURI(type, title) {
  const label = (type === "hotel") ? "Hébergement" : "Restaurant";
  const icon = (type === "hotel") ? "🛏️" : "🍽️";
  const t = (title || "").slice(0, 32);
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
    <text x="70" y="340" font-size="34" font-family="Arial" fill="#2d3a4f">${escapeHtml(t)}</text>
    <text x="70" y="420" font-size="26" font-family="Arial" fill="#5d6a7e">CityTaste • Ottawa</text>
  </svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
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

  if (prefs.area.trim() && matchesArea(place, prefs.area)) {
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
    reasons.push(`il correspond à votre recherche "${prefs.searchText}"`);
  }

  if (prefs.cuisine !== "any" && placeMatchesCuisine(place, prefs.cuisine)) {
    reasons.push(`la cuisine ${cuisineLabel(prefs.cuisine).toLowerCase()} demandée est bien respectée`);
  }

  if (prefs.area.trim() && matchesArea(place, prefs.area)) {
    reasons.push("la zone demandée correspond");
  }

  if (prefs.sortBy === "distance" && distanceKm != null) {
    reasons.push(`il fait partie des options les plus proches (${distanceKm.toFixed(1)} km depuis ${getDistanceOriginShort(prefs)})`);
  } else if (distanceKm != null) {
    reasons.push(`il se trouve à ${distanceKm.toFixed(1)} km depuis ${getDistanceOriginShort(prefs)}`);
  }

  if (prefs.sortBy === "rating" && ratingVal != null) {
    reasons.push(`sa note ressort bien (${ratingVal.toFixed(1)}/5${ratingCount != null ? `, ${ratingCount} avis` : ""})`);
  } else if (ratingVal != null && ratingVal >= 4.2) {
    reasons.push(`sa bonne note renforce la recommandation (${ratingVal.toFixed(1)}/5)`);
  }

  if (!reasons.length) {
    reasons.push("c’est l’un des meilleurs compromis entre pertinence, distance et qualité des informations disponibles");
  }

  return `Recommandé car ${reasons.join(" et ")}.`;
}

function hasMeaningfulFilters(prefs) {
  return Boolean(
    prefs.searchText?.trim() ||
    prefs.type !== "any" ||
    prefs.cuisine !== "any" ||
    prefs.budget !== "any" ||
    prefs.veg ||
    prefs.halal ||
    prefs.glutenfree ||
    prefs.area.trim() ||
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

      if (prefs.area.trim() && !matchesArea(p, prefs.area)) return false;

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
    return `<span class="rating-na">Note non disponible</span>`;
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
      const hay = `${p.name} ${p.neighbourhood} ${p.city} ${p.address} ${p.cuisine_norm}`.toLowerCase();
      return hay.includes(q);
    });
  }

  countBadge.textContent = `${list.length} résultat${list.length > 1 ? "s" : ""}`;
  activeFilters.textContent = prefsToText(currentPrefs || getPrefs());
  resultsSubtitle.textContent = q
    ? `Filtré par : "${query}"`
    : "Clique sur un lieu pour voir la fiche détaillée.";

  resultsEl.innerHTML = "";

  if (!list.length) {
    resultsEl.innerHTML = `<div class="empty">Aucun résultat pour cette recherche.</div>`;
    return;
  }

  for (const p of list) {
    const distanceKm = Number.isFinite(p.distance_km)
      ? p.distance_km
      : computeDistanceFromPrefs(p, currentPrefs || getPrefs());

    const distanceTxt = distanceKm != null ? `${distanceKm.toFixed(1)} km` : "— km";

    const ratingVal = getDisplayRating(p);
    const ratingCount = getDisplayRatingCount(p);
    const ratingTxt = ratingVal != null ? ratingVal.toFixed(1) : "—";
    const ratingCountTxt = ratingCount != null ? `(${ratingCount} avis)` : "";

    const tags = [];
    tags.push(`<span class="tag tag--green">${escapeHtml(typeLabel(p.type))}</span>`);

    if (p.type === "restaurant" && p.cuisine_norm && p.cuisine_norm !== "unknown") {
      tags.push(`<span class="tag">${escapeHtml(cuisineLabel(p.cuisine_norm))}</span>`);
    }

    if (p.website) tags.push(`<span class="tag">Site web</span>`);
    if (p.phone) tags.push(`<span class="tag">Téléphone</span>`);
    if (p.opening_hours) tags.push(`<span class="tag">Horaires</span>`);

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
            <div class="score">Score: ${p.score}</div>
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
    ? `${ratingVal.toFixed(1)}${ratingCount != null ? ` (${ratingCount} avis)` : ""}`
    : "Note non disponible";

  mBudget.textContent = "—";
  mDistance.textContent = distanceKm != null
    ? `${distanceKm.toFixed(1)} km depuis ${getDistanceOriginShort(prefs)}`
    : "—";
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

  if (p.website) tagList.push("Site web");
  if (p.phone) tagList.push("Téléphone");
  if (p.opening_hours) tagList.push("Horaires");
  if (p.wheelchair) tagList.push("Accessibilité");

  tagList.slice(0, 10).forEach(t => {
    const span = document.createElement("span");
    span.className = "tag";
    span.textContent = t;
    mTags.appendChild(span);
  });

  mAddress.textContent = p.address || "—";
  mArea.textContent = p.neighbourhood || p.city || "—";
  mHours.textContent = p.opening_hours || "—";
  mPhone.textContent = p.phone || "—";

  if (p.website) {
    mWebsite.innerHTML = `<a href="${p.website}" target="_blank" rel="noreferrer">${escapeHtml(p.website)}</a>`;
  } else {
    mWebsite.textContent = "—";
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
    setInlineMessage(quickSearchFeedback, "Entre au moins un mot-clé avant de cliquer sur Explorer.");
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
    setInlineMessage(filtersFeedback, "Ajoute au moins une contrainte avant de demander des recommandations.");
    showFilters();
    return;
  }

  if (prefs.distanceMode === "user" && !hasUserLocation()) {
    setInlineMessage(filtersFeedback, "Active d’abord votre position ou repasse au centre d’Ottawa.");
    showFilters();
    return;
  }

  const list = computeRecommendations(prefs);
  setResults(list, prefs);
  showResults();
}

function resetForm() {
  if (el("type")) el("type").value = "any";
  if (el("cuisine")) el("cuisine").value = "any";
  if (el("budget")) el("budget").value = "any";
  if (el("maxKm")) el("maxKm").value = DEFAULT_MAX_KM;
  if (el("veg")) el("veg").checked = false;
  if (el("halal")) el("halal").checked = false;
  if (el("glutenfree")) el("glutenfree").checked = false;
  if (el("area")) el("area").value = "";
  if (el("topN")) el("topN").value = 12;
  if (el("sortBy")) el("sortBy").value = "score";

  if (distanceModeCenter) distanceModeCenter.checked = true;
  if (distanceModeUser) distanceModeUser.checked = false;

  locationState.mode = "center";
  clearInlineMessages();
  updateLocationStatus("Distance calculée depuis le centre d’Ottawa.");
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

// Events
btnNavHome?.addEventListener("click", showHome);
btnNavFilters?.addEventListener("click", showFilters);

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
  updateLocationStatus("Distance calculée depuis le centre d’Ottawa.");
});

distanceModeUser?.addEventListener("change", async () => {
  if (!distanceModeUser.checked) return;

  locationState.mode = "user";
  clearInlineMessages();

  if (hasUserLocation()) {
    updateLocationStatus("Distance calculée depuis votre position actuelle.");
    return;
  }

  await requestUserLocation();
});

btnUseMyLocation?.addEventListener("click", async () => {
  clearInlineMessages();
  await requestUserLocation();
});

btnUseMyLocation?.addEventListener("click", async () => {
  clearInlineMessages();
  const ok = await requestUserLocation();
  if (ok) rerunCurrentResults();
});

// Init (load data)
(async function init() {
  try {
    if (btnReco) btnReco.disabled = true;
    if (dataStatus) dataStatus.textContent = "Chargement…";
    if (dataNote) {
      dataNote.style.display = "none";
      dataNote.textContent = "";
    }

    const csvText = await loadCSV();
    const rows = parseCSV(csvText);
    PLACES = buildPlacesFromRows(rows);

    const nAll = PLACES.length;
    const nRest = PLACES.filter(p => p.type === "restaurant").length;
    const nHot = PLACES.filter(p => p.type === "hotel").length;

    if (dataStatus) dataStatus.textContent = "OK";
    if (dataCount) dataCount.textContent = String(nAll);

    if (kpiPlaces) kpiPlaces.textContent = String(nAll);
    if (kpiRestaurants) kpiRestaurants.textContent = String(nRest);
    if (kpiHotels) kpiHotels.textContent = String(nHot);

    if (btnReco) btnReco.disabled = false;

    updateLocationStatus("Distance calculée depuis le centre d’Ottawa.");
    showHome();
  } catch (err) {
    if (dataStatus) dataStatus.textContent = "Erreur";
    if (dataCount) dataCount.textContent = "—";
    if (dataNote) {
      dataNote.style.display = "block";
      dataNote.textContent = String(err.message || err);
    }
    if (btnReco) btnReco.disabled = true;
    showHome();
  }
})();