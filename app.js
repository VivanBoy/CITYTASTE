// CityTaste — Ottawa (CSV OSM) + Landing + Results Search + Thumbnails
// - Thumbnails: vraie photo si dispo (OSM image / Wikidata), sinon placeholder SVG (pas besoin d'images placeholder)
// - Landing au démarrage
// - Barre de recherche dans la page résultats
// - Reverse geocoding (quartier) au clic si manquant, + cache localStorage
// IMPORTANT: lancer via Live Server / http.server pour que fetch CSV marche

const CSV_CANDIDATE_PATHS = [
  "data/processed/ottawa_places_cleaned_v2.csv",
  "data/ottawa_places_cleaned_v2.csv",
  "ottawa_places_cleaned_v2.csv",
];

// centre Ottawa (fallback)
const OTTAWA_CENTER = { lat: 45.4215, lon: -75.6972 };

let PLACES = [];
let currentResultsAll = [];   // derniers résultats complets (avant search)
let currentPrefs = null;

//  DOM
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

const dataStatus = el("dataStatus");
const dataCount = el("dataCount");
const dataNote = el("dataNote");

const kpiPlaces = el("kpiPlaces");
const kpiRestaurants = el("kpiRestaurants");
const kpiHotels = el("kpiHotels");

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

//  Utils
function safeText(x){
  const v = String(x ?? "").trim();
  if (!v) return "";
  const low = v.toLowerCase();
  if (low === "nan" || low === "none" || low === "null") return "";
  return v;
}
function toNumber(x){
  const v = safeText(x).replace(",", ".");
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function typeLabel(t){ return t === "restaurant" ? "Restaurant" : "Hébergement"; }
function cuisineLabel(c){
  const map = {
    italian:"Italien", indian:"Indien", asian:"Asiatique", african:"Africain",
    canadian:"Canadien", cafe:"Café/Brunch", any:"—"
  };
  return map[c] || c;
}
function budgetLabel(b){
  return b === "low" ? "$" : b === "mid" ? "$$" : b === "high" ? "$$$" : "—";
}

// Distance
function haversineKm(lat1, lon1, lat2, lon2){
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

//  Views
function showHome(){
  homeView?.classList.remove("hidden");
  builderView?.classList.add("hidden");
  resultsView?.classList.add("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function showFilters(){
  homeView?.classList.add("hidden");
  builderView?.classList.remove("hidden");
  resultsView?.classList.add("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function showResults(){
  homeView?.classList.add("hidden");
  builderView?.classList.add("hidden");
  resultsView?.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

//  CSV load / parse
async function tryFetchText(url){
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}
async function loadCSV(){
  for (const path of CSV_CANDIDATE_PATHS){
    try{
      return await tryFetchText(path);
    }catch(e){}
  }
  throw new Error(`Impossible de charger les données. Lance le projet via Live Server ou http.server.`);
}

function splitCSVLine(line, delim){
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++){
    const ch = line[i];

    if (ch === '"'){
      if (inQuotes && line[i+1] === '"'){ cur += '"'; i++; }
      else inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && ch === delim){
      out.push(cur); cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (!lines.length) return [];

  const headerLine = lines[0];
  const commaCount = (headerLine.match(/,/g) || []).length;
  const semiCount  = (headerLine.match(/;/g) || []).length;
  const delim = semiCount > commaCount ? ";" : ",";

  const headers = splitCSVLine(headerLine, delim).map(h => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++){
    const cols = splitCSVLine(lines[i], delim);
    const obj = {};
    headers.forEach((h, idx) => obj[h] = cols[idx] ?? "");
    rows.push(obj);
  }
  return rows;
}

function safeJson(s){
  const v = safeText(s);
  if (!v) return null;
  try{ return JSON.parse(v); }catch{ return null; }
}

function parseCuisineList(s){
  const v = safeText(s);
  if (!v || v === "[]") return [];
  try{
    const jsonish = v.replaceAll("'", '"');
    const arr = JSON.parse(jsonish);
    return Array.isArray(arr) ? arr.map(x => String(x)) : [];
  }catch{
    return v.replace(/[\[\]']/g,"").split(",").map(x => x.trim()).filter(Boolean);
  }
}

function normalizeType(place_type){
  const t = safeText(place_type).toLowerCase();
  if (t === "restaurant") return "restaurant";
  if (["hotel","guest_house","motel","hostel"].includes(t)) return "hotel";
  return "restaurant";
}

// Note CityTaste (0..3) -> 2.0..5.0
function cityTasteStars(info_score){
  const s = Number.isFinite(info_score) ? clamp(info_score, 0, 3) : 0;
  const rating = 2.0 + (s / 3) * 3.0;
  return Math.round(rating * 10) / 10;
}

function buildPlacesFromRows(rows){
  const places = [];

  for (const r of rows){
    const name = safeText(r.name);
    if (!name) continue;

    const osmType = safeText(r.osm_type);
    const osmId = safeText(r.osm_id);
    const id = (osmType && osmId) ? `${osmType}:${osmId}` : String(places.length + 1);

    const lat = toNumber(r.lat);
    const lon = toNumber(r.lon);

    let address = safeText(r.address);
    if (!address){
      const hn = safeText(r.addr_housenumber);
      const st = safeText(r.addr_street);
      address = [hn, st].filter(Boolean).join(" ").trim();
    }

    const phone = safeText(r.phone);
    const website = safeText(r.website);
    const opening_hours = safeText(r.opening_hours);

    const type = normalizeType(r.place_type);
    const cuisine_norm = safeText(r.cuisine_norm).toLowerCase() || "any";
    const cuisine_list = parseCuisineList(r.cuisine_list);

    const tagsObj = safeJson(r.tags_json);
    const imageTag = tagsObj ? safeText(tagsObj.image) : "";
    const wikidata = tagsObj ? (safeText(tagsObj.wikidata) || safeText(tagsObj["brand:wikidata"])) : "";

    const infoScore = toNumber(r.info_score) ?? 0;

    let km = null;
    if (lat != null && lon != null){
      km = haversineKm(OTTAWA_CENTER.lat, OTTAWA_CENTER.lon, lat, lon);
      km = Math.round(km * 10) / 10;
    }

    places.push({
      id,
      name,
      type,
      cuisine_norm,
      cuisine_list,
      lat, lon, km,
      address,
      city: safeText(r.addr_city) || "Ottawa",
      postcode: safeText(r.addr_postcode),
      phone,
      website,
      opening_hours,
      wheelchair: safeText(r.wheelchair),
      brand: safeText(r.brand),

      info_score: infoScore,
      rating_citytaste: cityTasteStars(infoScore),

      photo_url: imageTag || "",  // si OSM a déjà une image URL
      wikidata: wikidata || "",   // si dispo, on tente Wikidata au clic
      neighbourhood: "",          // rempli au clic via reverse geocode + cache

      _tags: tagsObj,
    });
  }

  return places;
}

//  Preferences
function getPrefs(){
  return {
    type: el("type")?.value || "any",
    cuisine: el("cuisine")?.value || "any",
    budget: el("budget")?.value || "any",
    maxKm: Number(el("maxKm")?.value || 8),
    veg: !!el("veg")?.checked,
    halal: !!el("halal")?.checked,
    glutenfree: !!el("glutenfree")?.checked,
    area: el("area")?.value || "",
    topN: clamp(Number(el("topN")?.value || 12), 3, 20),
    sortBy: el("sortBy")?.value || "score"
  };
}

function prefsToText(p){
  const parts = [];
  parts.push(p.type === "any" ? "Type: tous" : `Type: ${p.type}`);
  parts.push(p.cuisine === "any" ? "Cuisine: —" : `Cuisine: ${cuisineLabel(p.cuisine)}`);
  parts.push(p.budget === "any" ? "Budget: —" : `Budget: ${budgetLabel(p.budget)}`);
  parts.push(`≤ ${p.maxKm} km`);
  const diet = [];
  if (p.veg) diet.push("Végétarien");
  if (p.halal) diet.push("Halal");
  if (p.glutenfree) diet.push("Sans gluten");
  parts.push(diet.length ? `Contraintes: ${diet.join(", ")}` : "Contraintes: —");
  if (p.area.trim()) parts.push(`Zone: ${p.area.trim()}`);
  return parts.join(" | ");
}

//  Placeholder thumbnails (SVG data URI)
function placeholderDataURI(type, title){
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

function getThumb(place){
  const cached = enrichCache[place.id];
  const url = safeText(place.photo_url) || safeText(cached?.photo_url);
  return url || placeholderDataURI(place.type, place.name);
}

//  Scoring + explanation (simple & cohérent)
function getDisplayRating(place){
  return place.rating_citytaste; // (si plus tard tu ajoutes un rating réel, tu peux le prioriser ici)
}

function scorePlace(place, prefs){
  let score = 0;

  // type
  if (prefs.type === "any") score += 10;
  else score += (place.type === prefs.type ? 18 : -60);

  // cuisine: uniquement restaurants
  if (prefs.cuisine !== "any" && place.type === "restaurant"){
    score += (place.cuisine_norm === prefs.cuisine ? 18 : -10);
  } else {
    score += 6;
  }

  // distance
  if (place.km == null) score -= 6;
  else {
    const maxKm = Math.max(1, prefs.maxKm);
    score += 18 * (1 - clamp(place.km / maxKm, 0, 1));
  }

  // complétude infos
  score += place.info_score * 4;

  // note CityTaste
  score += getDisplayRating(place) * 2.2;

  // zone keyword
  if (prefs.area.trim()){
    const key = prefs.area.trim().toLowerCase();
    const hay = `${place.neighbourhood} ${place.city} ${place.address}`.toLowerCase();
    if (hay.includes(key)) score += 10;
  }

  return Math.round(score);
}

function explain(place, prefs){
  const reasons = [];

  if (place.type === "restaurant" && prefs.cuisine !== "any" && place.cuisine_norm === prefs.cuisine){
    reasons.push("Cuisine correspondante");
  }

  if (place.km != null){
    if (place.km <= prefs.maxKm) reasons.push(`Proche (${place.km.toFixed(1)} km)`);
    else reasons.push(`Distance: ${place.km.toFixed(1)} km`);
  }

  const infoBits = [];
  if (place.website) infoBits.push("site");
  if (place.phone) infoBits.push("téléphone");
  if (place.opening_hours) infoBits.push("horaires");
  if (infoBits.length) reasons.push(`Infos: ${infoBits.join(", ")}`);

  if (prefs.area.trim()){
    const key = prefs.area.trim().toLowerCase();
    const hay = `${place.neighbourhood} ${place.city} ${place.address}`.toLowerCase();
    if (hay.includes(key)) reasons.push("Zone correspondante");
  }

  if (!reasons.length) reasons.push("Bon compromis global");
  return "Pourquoi ? " + reasons.join(" • ");
}

//  Reco pipeline
function computeRecommendations(prefs){
  let candidates = PLACES.filter(p => {
    if (prefs.type !== "any" && p.type !== prefs.type) return false;

    // si cuisine choisie et type=any => exclude hotels
    if (prefs.type === "any" && prefs.cuisine !== "any" && p.type === "hotel") return false;

    if (p.km != null && p.km > prefs.maxKm * 2.5) return false;
    return true;
  });

  const scored = candidates.map(p => ({
    ...p,
    score: scorePlace(p, prefs),
    why: explain(p, prefs)
  }));

  scored.sort((a,b) => {
    if (prefs.sortBy === "distance"){
      const ad = a.km ?? 1e9;
      const bd = b.km ?? 1e9;
      return ad - bd;
    }
    if (prefs.sortBy === "rating"){
      return (getDisplayRating(b) ?? -1) - (getDisplayRating(a) ?? -1);
    }
    return b.score - a.score;
  });

  return scored.slice(0, prefs.topN);
}

//  Stars render
function renderStars(rating){
  if (rating == null){
    return `<span class="bubble bubble--off"></span><span class="bubble bubble--off"></span><span class="bubble bubble--off"></span><span class="bubble bubble--off"></span><span class="bubble bubble--off"></span>`;
  }
  const full = clamp(Math.round(rating), 0, 5);
  let html = "";
  for (let i = 0; i < 5; i++){
    html += `<span class="bubble ${i < full ? "" : "bubble--off"}"></span>`;
  }
  return html;
}

//  Results render + search
function setResults(list, prefs){
  currentResultsAll = list;
  currentPrefs = prefs;

  // reset search box each time
  if (resultsSearch) resultsSearch.value = "";
  renderResultsFiltered("");
}

function renderResultsFiltered(query){
  const q = (query || "").trim().toLowerCase();
  let list = currentResultsAll;

  if (q){
    list = currentResultsAll.filter(p => {
      const hay = `${p.name} ${p.neighbourhood} ${p.city} ${p.address}`.toLowerCase();
      return hay.includes(q);
    });
  }

  countBadge.textContent = `${list.length} résultat${list.length > 1 ? "s" : ""}`;
  activeFilters.textContent = prefsToText(currentPrefs || getPrefs());
  resultsSubtitle.textContent = q ? `Filtré par: "${query}"` : "Clique sur un lieu pour voir la fiche détaillée.";

  resultsEl.innerHTML = "";
  if (!list.length){
    resultsEl.innerHTML = `<div class="empty">Aucun résultat pour cette recherche.</div>`;
    return;
  }

  for (const p of list){
    const distanceTxt = p.km != null ? `${p.km.toFixed(1)} km` : "— km";
    const ratingVal = getDisplayRating(p);
    const ratingTxt = ratingVal != null ? ratingVal.toFixed(1) : "—";

    const tags = [];
    tags.push(`<span class="tag tag--green">${escapeHtml(typeLabel(p.type))}</span>`);
    if (p.type === "restaurant" && p.cuisine_norm && p.cuisine_norm !== "any"){
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
                  <span>${ratingTxt}</span>
                </span>
              </div>
            </div>
            <div class="score">Score: ${p.score}</div>
          </div>

          <div class="tags">${tags.slice(0,6).join("")}</div>
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

//  Enrichment cache (quartier + photo)
const ENRICH_CACHE_KEY = "citytaste_enrich_cache_v2";
let enrichCache = {};
try { enrichCache = JSON.parse(localStorage.getItem(ENRICH_CACHE_KEY) || "{}"); } catch { enrichCache = {}; }

function saveEnrichCache(){
  localStorage.setItem(ENRICH_CACHE_KEY, JSON.stringify(enrichCache));
}

async function reverseGeocode(lat, lon){
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=18&addressdetails=1&accept-language=fr`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Reverse geocode failed");
  return await res.json();
}

async function wikidataToImageUrl(qid){
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

async function ensureEnrichment(place){
  const key = place.id;
  const cached = enrichCache[key];

  if (cached){
    place.neighbourhood = cached.neighbourhood || place.neighbourhood;
    place.photo_url = cached.photo_url || place.photo_url;
    return;
  }

  const newData = {};

  // quartier via reverse geocode (si manquant)
  if (!place.neighbourhood && place.lat != null && place.lon != null){
    try{
      const geo = await reverseGeocode(place.lat, place.lon);
      const a = geo.address || {};
      newData.neighbourhood =
        a.neighbourhood || a.suburb || a.city_district || a.county || "";
    }catch{}
  }

  // photo via Wikidata si dispo et pas déjà une photo URL
  if (!place.photo_url && place.wikidata){
    try{
      const url = await wikidataToImageUrl(place.wikidata);
      if (url) newData.photo_url = url;
    }catch{}
  }

  place.neighbourhood = newData.neighbourhood || place.neighbourhood;
  place.photo_url = newData.photo_url || place.photo_url;

  enrichCache[key] = newData;
  saveEnrichCache();
}

//  Modal
async function openDetails(placeId, prefs){
  const p = PLACES.find(x => x.id === placeId);
  if (!p) return;

  await ensureEnrichment(p);

  const score = scorePlace(p, prefs);
  const why = explain(p, prefs);
  const ratingVal = getDisplayRating(p);

  mTitle.textContent = p.name;
  mSub.textContent = `${typeLabel(p.type)} • ${p.neighbourhood || p.city || "Ottawa"}`;

  mRating.textContent = ratingVal != null ? ratingVal.toFixed(1) : "—";
  mBudget.textContent = "—"; // price_level absent dans OSM (enrichissement possible via API plus tard)
  mDistance.textContent = p.km != null ? `${p.km.toFixed(1)} km` : "—";
  mScore.textContent = String(score);

  mWhy.textContent = why;

  // photo (vraie ou placeholder)
  mPhoto.src = getThumb(p);
  mPhoto.alt = p.name;

  // tags
  mTags.innerHTML = "";
  const tagList = [];
  tagList.push(typeLabel(p.type));
  if (p.type === "restaurant" && p.cuisine_norm && p.cuisine_norm !== "any") tagList.push(cuisineLabel(p.cuisine_norm));
  if (p.website) tagList.push("Site web");
  if (p.phone) tagList.push("Téléphone");
  if (p.opening_hours) tagList.push("Horaires");
  if (p.wheelchair) tagList.push("Accessibilité");

  tagList.slice(0,10).forEach(t => {
    const span = document.createElement("span");
    span.className = "tag";
    span.textContent = t;
    mTags.appendChild(span);
  });

  // infos
  mAddress.textContent = p.address || "—";
  mArea.textContent = p.neighbourhood || p.city || "—";
  mHours.textContent = p.opening_hours || "—";
  mPhone.textContent = p.phone || "—";
  if (p.website){
    mWebsite.innerHTML = `<a href="${p.website}" target="_blank" rel="noreferrer">${escapeHtml(p.website)}</a>`;
  }else{
    mWebsite.textContent = "—";
  }

  // maps
  if (p.lat != null && p.lon != null){
    mMaps.href = `https://www.google.com/maps?q=${p.lat},${p.lon}`;
  }else{
    const q = encodeURIComponent(`${p.name}, ${p.address || "Ottawa"}`);
    mMaps.href = `https://www.google.com/maps/search/?api=1&query=${q}`;
  }

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(){
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}
overlay?.addEventListener("click", closeModal);
btnCloseModal?.addEventListener("click", closeModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modal && !modal.classList.contains("hidden")) closeModal();
});

//  Actions (home / filters / results)
function quickExplore(query){
  const q = (query || "").trim().toLowerCase();
  const prefs = getPrefs();

  // si l'utilisateur tape un mot, on le met aussi en zone (boost)
  if (q) prefs.area = query;

  let base = PLACES;

  // quick filter par texte
  if (q){
    base = PLACES.filter(p => {
      const hay = `${p.name} ${p.neighbourhood} ${p.city} ${p.address}`.toLowerCase();
      return hay.includes(q);
    });
  }

  // scorer + topN
  const list = base.map(p => ({
    ...p,
    score: scorePlace(p, prefs),
    why: explain(p, prefs)
  })).sort((a,b) => b.score - a.score)
    .slice(0, prefs.topN);

  setResults(list, prefs);
  showResults();
}

function recommend(){
  const prefs = getPrefs();
  const list = computeRecommendations(prefs);
  setResults(list, prefs);
  showResults();
}

function resetForm(){
  el("type").value = "any";
  el("cuisine").value = "any";
  el("budget").value = "any";
  el("maxKm").value = 8;
  el("veg").checked = false;
  el("halal").checked = false;
  el("glutenfree").checked = false;
  el("area").value = "";
  el("topN").value = 12;
  el("sortBy").value = "score";
}

//  Events
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

//  Init (load data)
(async function init(){
  try{
    if (btnReco) btnReco.disabled = true;
    if (dataStatus) dataStatus.textContent = "Chargement…";
    if (dataNote){ dataNote.style.display = "none"; dataNote.textContent = ""; }

    const csvText = await loadCSV();
    const rows = parseCSV(csvText);
    PLACES = buildPlacesFromRows(rows);

    // KPIs
    const nAll = PLACES.length;
    const nRest = PLACES.filter(p => p.type === "restaurant").length;
    const nHot = PLACES.filter(p => p.type === "hotel").length;

    if (dataStatus) dataStatus.textContent = "OK";
    if (dataCount) dataCount.textContent = String(nAll);

    if (kpiPlaces) kpiPlaces.textContent = String(nAll);
    if (kpiRestaurants) kpiRestaurants.textContent = String(nRest);
    if (kpiHotels) kpiHotels.textContent = String(nHot);

    if (btnReco) btnReco.disabled = false;

    // Landing au démarrage
    showHome();
  }catch(err){
    if (dataStatus) dataStatus.textContent = "Erreur";
    if (dataCount) dataCount.textContent = "—";
    if (dataNote){
      dataNote.style.display = "block";
      dataNote.textContent = String(err.message || err);
    }
    if (btnReco) btnReco.disabled = true;
    showHome();
  }
})();