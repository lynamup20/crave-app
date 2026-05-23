import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import AuthScreen from "./components/AuthScreen.jsx";
import { supabase } from "./lib/supabase.js";
import {
  computeDynamicDish,
  ensureUserProfile,
  fetchRecipeWithCache,
  incrementSwipesUsed,
  isSupabaseConfigured,
  recordSwipe,
  restaurantCacheKey,
  saveCachedRestaurants,
  signOutUser,
  updateUserProfile,
} from "./services/craveSupabase.js";

const DISH_PHOTO_CACHE = Object.create(null);

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const CONFIG = {
  GOOGLE_PLACES_API_KEY:
    import.meta.env.VITE_GOOGLE_PLACES_API_KEY ||
    "AIzaSyDrJ-X7_ouEhdgm28iqWZaAFHqQIRw6cUQ",
  SEARCH_RADIUS: 8047, // 5 miles in meters
  RESULTS_LIMIT: 20,
};

const RESTAURANT_FILTERS = [
  { id: "rating", label: "Top Rated" },
  { id: "closest", label: "Closest First" },
  { id: "open", label: "Open Now" },
];

// Same-origin proxy (/maps/api) avoids browser CORS blocks; direct URL as fallback.
const PLACES_API_BASES = [
  "/maps/api",
  "https://maps.googleapis.com/maps/api",
];
const PLACE_TYPE_SKIP = new Set([
  "establishment",
  "point_of_interest",
  "food",
  "restaurant",
  "meal_takeaway",
  "meal_delivery",
  "store",
  "political",
]);

const FREE_DAILY_SWIPES  = 15;
const BONUS_SHARE_SWIPES = 10;
const MONTHLY_PRICE      = 9.99;
const DAY_NAMES          = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

// ─── DISH CATEGORIES ─────────────────────────────────────────────────────────
const DISHES = [
  { id:1,  name:"Spicy Ramen",       emoji:"🍜", term:"ramen",              tags:["Spicy","Umami","Comfort"],    image:"", g1:"#1a0500",g2:"#5c1200",g3:"#a02800",glow:"rgba(160,40,0,0.6)"   },
  { id:2,  name:"Street Tacos",      emoji:"🌮", term:"tacos",              tags:["Savory","Bold","Street"],     image:"", g1:"#1a0900",g2:"#5c2800",g3:"#a04800",glow:"rgba(160,72,0,0.6)"  },
  { id:3,  name:"Smash Burger",      emoji:"🍔", term:"burgers",            tags:["Juicy","Classic","Indulgent"],image:"", g1:"#1a1000",g2:"#5c3800",g3:"#a06000",glow:"rgba(160,96,0,0.6)"  },
  { id:4,  name:"Sushi",             emoji:"🍣", term:"sushi",              tags:["Fresh","Premium","Delicate"], image:"", g1:"#001214",g2:"#003d44",g3:"#006b78",glow:"rgba(0,107,120,0.6)" },
  { id:5,  name:"Wood-Fired Pizza",  emoji:"🍕", term:"pizza",              tags:["Crispy","Cheesy","Classic"],  image:"", g1:"#1a0500",g2:"#5c1500",g3:"#a02a00",glow:"rgba(160,42,0,0.6)"  },
  { id:6,  name:"BBQ Ribs",          emoji:"🍖", term:"bbq",                tags:["Smoky","Rich","Saucy"],       image:"", g1:"#1a0000",g2:"#500000",g3:"#8b0000",glow:"rgba(139,0,0,0.6)"   },
  { id:7,  name:"Hot Chicken",       emoji:"🍗", term:"fried chicken",      tags:["Crispy","Spicy","Comfort"],   image:"", g1:"#1a0a00",g2:"#5c2800",g3:"#a04c00",glow:"rgba(160,76,0,0.6)"  },
  { id:8,  name:"Seafood",           emoji:"🦞", term:"seafood",            tags:["Fresh","Buttery","Ocean"],    image:"", g1:"#001018",g2:"#002a40",g3:"#004868",glow:"rgba(0,72,104,0.6)"  },
  { id:9,  name:"Pad Thai",          emoji:"🥡", term:"thai",               tags:["Tangy","Noodles","Street"],   image:"", g1:"#1a0c00",g2:"#5c3000",g3:"#a05600",glow:"rgba(160,86,0,0.6)"  },
  { id:10, name:"Bakery",            emoji:"🥐", term:"bakeries",           tags:["Flaky","Buttery","Morning"],  image:"", g1:"#1a1400",g2:"#5c4800",g3:"#a08000",glow:"rgba(160,128,0,0.6)" },
  { id:11, name:"Korean BBQ",        emoji:"🫕", term:"korean bbq",         tags:["Smoky","Feast","Fun"],        image:"", g1:"#1a0000",g2:"#4a0000",g3:"#7a0808",glow:"rgba(122,8,8,0.6)"   },
  { id:12, name:"Ice Cream",         emoji:"🍦", term:"ice cream",          tags:["Sweet","Creamy","Dessert"],   image:"", g1:"#000d1a",g2:"#002850",g3:"#004880",glow:"rgba(0,72,128,0.6)"  },
  { id:13, name:"Birria Tacos",      emoji:"🌯", term:"birria",             tags:["Crispy","Rich","Dip"],        image:"", g1:"#2d0800",g2:"#7a2000",g3:"#c83800",glow:"rgba(200,56,0,0.6)"  },
  { id:14, name:"Pho",               emoji:"🍲", term:"pho",                tags:["Brothy","Aromatic","Warm"],   image:"", g1:"#001a0a",g2:"#004a1e",g3:"#007838",glow:"rgba(0,120,56,0.5)"  },
  { id:15, name:"Dim Sum",           emoji:"🥟", term:"dim sum",            tags:["Steamed","Savory","Sharing"], image:"", g1:"#1a0000",g2:"#5c1010",g3:"#a02020",glow:"rgba(160,32,32,0.6)" },
  { id:16, name:"Acai Bowl",         emoji:"🫐", term:"acai bowls",         tags:["Fresh","Healthy","Vibrant"],  image:"", g1:"#0d0028",g2:"#2a0066",g3:"#4400a0",glow:"rgba(68,0,160,0.5)"  },
  { id:17, name:"Chicken & Waffles", emoji:"🧇", term:"chicken and waffles",tags:["Sweet","Savory","Brunch"],    image:"", g1:"#1a1000",g2:"#5c3800",g3:"#a07000",glow:"rgba(160,112,0,0.6)" },
  { id:18, name:"Indian Curry",      emoji:"🍛", term:"indian",             tags:["Spiced","Rich","Aromatic"],   image:"", g1:"#1a0800",g2:"#502000",g3:"#8a3c00",glow:"rgba(138,60,0,0.5)"  },
  { id:19, name:"Shawarma",          emoji:"🥙", term:"shawarma",           tags:["Spiced","Juicy","Wrap"],      image:"", g1:"#1a0a00",g2:"#5c2a00",g3:"#a04a00",glow:"rgba(160,74,0,0.6)"  },
  { id:20, name:"Pasta",             emoji:"🍝", term:"italian",            tags:["Comfort","Rich","Classic"],   image:"", g1:"#0a0a00",g2:"#2e2e00",g3:"#5c5c00",glow:"rgba(92,92,0,0.5)"   },
  { id:21, name:"Donuts",            emoji:"🍩", term:"donuts",             tags:["Sweet","Glazed","Treat"],     image:"", g1:"#1a0010",g2:"#5c0038",g3:"#a00060",glow:"rgba(160,0,96,0.6)"  },
  { id:22, name:"Brunch",            emoji:"🥞", term:"breakfast brunch",   tags:["Lazy","Eggs","Weekend"],      image:"", g1:"#1a0800",g2:"#5c2800",g3:"#a04800",glow:"rgba(160,72,0,0.6)"  },
  { id:23, name:"Greek Food",        emoji:"🫒", term:"greek",              tags:["Fresh","Mediterranean","Light"],image:"",g1:"#001a10",g2:"#004a2c",g3:"#007848",glow:"rgba(0,120,72,0.5)"  },
  { id:24, name:"Boba Tea",          emoji:"🧋", term:"bubble tea",         tags:["Sweet","Chewy","Drinks"],     image:"", g1:"#100028",g2:"#300066",g3:"#5000a0",glow:"rgba(80,0,160,0.5)"  },
  { id:25, name:"Cheesesteak",       emoji:"🥖", term:"cheesesteak",        tags:["Cheesy","Juicy","Classic"],   image:"", g1:"#1a1000",g2:"#5c3800",g3:"#a06200",glow:"rgba(160,98,0,0.6)"  },
  { id:26, name:"Wings",             emoji:"🍗", term:"chicken wings",      tags:["Crispy","Saucy","Game Day"],  image:"", g1:"#1a0500",g2:"#5c1800",g3:"#a03000",glow:"rgba(160,48,0,0.6)"  },
  { id:27, name:"Burritos",          emoji:"🌯", term:"burritos",           tags:["Stuffed","Bold","Filling"],   image:"", g1:"#1a0800",g2:"#5c2400",g3:"#a04000",glow:"rgba(160,64,0,0.6)"  },
  { id:28, name:"Steak",             emoji:"🥩", term:"steakhouses",        tags:["Premium","Rich","Seared"],    image:"", g1:"#1a0000",g2:"#500000",g3:"#8b0000",glow:"rgba(139,0,0,0.6)"   },
  { id:29, name:"Sandwiches",        emoji:"🥪", term:"sandwiches",         tags:["Simple","Fresh","Quick"],     image:"", g1:"#0a1400",g2:"#283c00",g3:"#486400",glow:"rgba(72,100,0,0.5)"  },
  { id:30, name:"Desserts",          emoji:"🍰", term:"desserts",           tags:["Sweet","Indulgent","Happy"],  image:"", g1:"#1a0014",g2:"#5c0040",g3:"#a00070",glow:"rgba(160,0,112,0.6)" },
];

const TASTE_TAGS = [
  "Spicy 🌶️","Savory 🥩","Sweet 🍯","Fresh 🥗",
  "Comfort 🍲","Premium ✨","Quick 🏃","Vegan 🌱","Seafood 🦞","Noodles 🍜",
];

// Taste tag → dish category IDs + Google Places search modifiers
const flavorToCategories = {
  "Spicy 🌶️": {
    dishIds: [1, 7, 13, 18, 26],
    placesKeyword: "spicy",
  },
  "Savory 🥩": {
    dishIds: [6, 3, 28, 11, 17],
    placesKeyword: "savory",
  },
  "Sweet 🍯": {
    dishIds: [12, 21, 30, 24],
    placesKeyword: "sweet dessert",
  },
  "Fresh 🥗": {
    dishIds: [8, 16, 23, 29],
    placesKeyword: "fresh healthy",
  },
  "Comfort 🍲": {
    dishIds: [9, 14, 5, 20, 22],
    placesKeyword: "comfort food",
  },
  "Premium ✨": {
    dishIds: [4, 6, 28, 8],
    rankby: "prominence",
  },
  "Quick 🏃": {
    dishIds: [2, 27, 25, 29, 26],
    placesKeyword: "quick",
  },
  "Vegan 🌱": {
    dishIds: [16, 23, 15],
    placesKeyword: "vegan vegetarian",
  },
  "Seafood 🦞": {
    dishIds: [8, 4],
    placesKeyword: "seafood",
  },
  "Noodles 🍜": {
    dishIds: [1, 9, 14, 20],
    placesKeyword: "noodles",
  },
};

function orderDishesByFlavorProfile(dishes, tasteTags) {
  if (!tasteTags?.length) return dishes;

  const orderedIds = [];
  const seen = new Set();

  for (const tag of tasteTags) {
    const flavor = flavorToCategories[tag];
    if (!flavor?.dishIds) continue;
    for (const id of flavor.dishIds) {
      if (!seen.has(id)) {
        seen.add(id);
        orderedIds.push(id);
      }
    }
  }

  const dishById = new Map(dishes.map((d) => [d.id, d]));
  const matching = orderedIds.map((id) => dishById.get(id)).filter(Boolean);
  const rest = dishes.filter((d) => !seen.has(d.id));

  return [...matching, ...rest];
}

function buildFlavorPlacesParams(tasteTags) {
  const keywordParts = [];
  let rankby = null;
  for (const tag of tasteTags || []) {
    const flavor = flavorToCategories[tag];
    if (!flavor) continue;
    if (flavor.placesKeyword) keywordParts.push(flavor.placesKeyword);
    if (flavor.rankby) rankby = flavor.rankby;
  }
  return {
    keywordSuffix: [...new Set(keywordParts.join(" ").split(/\s+/).filter(Boolean))].join(" "),
    rankby,
  };
}

// ─── GOOGLE PLACES ────────────────────────────────────────────────────────────
function placesApiUrl(base, path, params) {
  const origin = base.startsWith("http") ? undefined : window.location.origin;
  const url = new URL(`${base}${path}`, origin);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  }
  url.searchParams.set("key", CONFIG.GOOGLE_PLACES_API_KEY);
  return url.toString();
}

async function fetchPlacesApi(path, params) {
  let lastError;
  for (const base of PLACES_API_BASES) {
    try {
      const res = await fetch(placesApiUrl(base, path, params));
      const data = await res.json();
      if (!res.ok) throw new Error(`Places HTTP ${res.status}`);
      if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        throw new Error(data.error_message || data.status || "Places request failed");
      }
      return data;
    } catch (err) {
      lastError = err;
      console.warn(`Places request failed (${base}):`, err.message);
    }
  }
  throw lastError || new Error("Places request failed");
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

function placePhotoUrl(photoReference, maxWidth = 800) {
  if (!photoReference) return null;
  return buildGooglePlacePhotoUrl(photoReference, maxWidth);
}

function buildGooglePlacePhotoUrl(photoReference, maxWidth = 800) {
  if (!photoReference) return null;
  const url = new URL("https://maps.googleapis.com/maps/api/place/photo");
  url.searchParams.set("maxwidth", String(maxWidth));
  url.searchParams.set("photo_reference", photoReference);
  url.searchParams.set("key", CONFIG.GOOGLE_PLACES_API_KEY);
  return url.toString();
}

function cuisineFromTypes(types = []) {
  const match = types.find((t) => !PLACE_TYPE_SKIP.has(t));
  if (!match) return "Restaurant";
  return match
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function priceFromLevel(level) {
  if (level == null || level === 0) return "$$";
  return "$".repeat(Math.min(4, Math.max(1, level)));
}

function distanceMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1);
}

function mapGooglePlace(place, userLat, userLng) {
  const lat = place.geometry?.location?.lat;
  const lng = place.geometry?.location?.lng;
  return {
    id: place.place_id,
    placeId: place.place_id,
    name: place.name,
    cuisine: cuisineFromTypes(place.types),
    rating: place.rating != null ? String(place.rating) : "—",
    price: priceFromLevel(place.price_level),
    distanceMiles:
      lat != null && lng != null
        ? distanceMiles(userLat, userLng, lat, lng)
        : "—",
    address: place.vicinity || place.formatted_address || "",
    phone: place.formatted_phone_number || "",
    reviewCount: place.user_ratings_total || 0,
    primaryPhoto: place.photos?.[0]
      ? placePhotoUrl(place.photos[0].photo_reference)
      : null,
    lat: lat ?? userLat,
    lng: lng ?? userLng,
    isOpenNow: place.opening_hours?.open_now ?? true,
    deliversYelp: false,
    doesPickup: true,
    website: null,
    orderUrl: null,
    isPartner: false,
  };
}

async function searchGooglePlacesNearby(lat, lng, term, tasteTags = []) {
  const { keywordSuffix, rankby } = buildFlavorPlacesParams(tasteTags);
  const keyword = [term, keywordSuffix].filter(Boolean).join(" ").trim();
  const params = {
    location: `${lat},${lng}`,
    radius: CONFIG.SEARCH_RADIUS,
    keyword,
    type: "restaurant",
  };
  if (rankby) params.rankby = rankby;
  const data = await fetchPlacesApi("/place/nearbysearch/json", params);
  return (data.results || [])
    .slice(0, CONFIG.RESULTS_LIMIT)
    .map((place) => mapGooglePlace(place, lat, lng));
}

// ─── DISH CARD PHOTOS (Unsplash only — never Google Places) ─────────────────
const DISH_PHOTO_QUERIES = {
  1: "ramen bowl noodles soup",
  2: "tacos mexican street food",
  3: "smash burger beef patty juicy",
  4: "sushi nigiri fish close up",
  5: "pizza margherita melted cheese",
  6: "bbq pork ribs smoked meat",
  7: "crispy fried chicken",
  8: "fresh lobster seafood plate",
  9: "pad thai noodles wok",
  10: "croissant flaky butter pastry",
  11: "korean bbq galbi grill",
  12: "ice cream gelato scoop",
  13: "birria tacos consomme dip",
  14: "pho bo vietnamese soup",
  15: "xiaolongbao dim sum dumplings",
  16: "acai bowl granola berries",
  17: "chicken waffles maple syrup",
  18: "butter chicken tikka masala",
  19: "shawarma lamb wrap flatbread",
  20: "spaghetti carbonara pasta",
  21: "glazed donuts sprinkles",
  22: "eggs benedict hollandaise brunch",
  23: "greek salad feta olives",
  24: "bubble tea tapioca boba",
  25: "philly cheesesteak sandwich",
  26: "buffalo chicken wings sauce",
  27: "carne asada burrito stuffed",
  28: "ribeye steak medium rare seared",
  29: "club sandwich toasted",
  30: "tiramisu chocolate dessert",
};

const dishCardPhotoInflight = Object.create(null);
const dishCardPhotoListeners = new Set();
const UNSPLASH_ACCESS_KEY = import.meta.env.VITE_UNSPLASH_ACCESS_KEY || "";

function dishPhotoStorageKey(dishId) {
  return `crave_photo_${dishId}`;
}

function legacyDishPhotoStorageKey(dishId) {
  return `crave_dish_photo_${dishId}`;
}

function readDishPhotoFromStorage(dishId) {
  try {
    return (
      localStorage.getItem(dishPhotoStorageKey(dishId)) ||
      localStorage.getItem(legacyDishPhotoStorageKey(dishId)) ||
      ""
    );
  } catch {
    return "";
  }
}

function writeDishPhotoToStorage(dishId, url) {
  try {
    if (url) {
      localStorage.setItem(dishPhotoStorageKey(dishId), url);
      localStorage.setItem(legacyDishPhotoStorageKey(dishId), url);
    }
  } catch {
    /* ignore quota / private mode */
  }
}

function hydrateDishPhotosFromStorage() {
  for (const id of Object.keys(DISH_PHOTO_QUERIES)) {
    const dishId = Number(id);
    const stored = readDishPhotoFromStorage(dishId);
    if (stored) DISH_PHOTO_CACHE[dishId] = stored;
  }
}

hydrateDishPhotosFromStorage();

function resolveDishPhotoUrl(dishId) {
  if (typeof dishId !== "number") return null;
  if (typeof DISH_PHOTO_CACHE[dishId] === "string") return DISH_PHOTO_CACHE[dishId];
  const stored = readDishPhotoFromStorage(dishId);
  if (stored) {
    DISH_PHOTO_CACHE[dishId] = stored;
    return stored;
  }
  return null;
}

function notifyDishCardPhotoListeners() {
  dishCardPhotoListeners.forEach((fn) => fn());
}

function subscribeDishCardPhotos(listener) {
  dishCardPhotoListeners.add(listener);
  return () => dishCardPhotoListeners.delete(listener);
}

function getCachedDishCardPhoto(dishId) {
  return resolveDishPhotoUrl(dishId) || "";
}

async function getDishCardPhoto(query, dishId) {
  if (!query) return null;
  if (!UNSPLASH_ACCESS_KEY) {
    console.warn("Unsplash skipped: VITE_UNSPLASH_ACCESS_KEY is not set");
    return null;
  }

  if (typeof dishId === "number") {
    const cached = resolveDishPhotoUrl(dishId);
    if (cached) return cached;
    if (DISH_PHOTO_CACHE[dishId] === false) return null;
    if (dishCardPhotoInflight[dishId]) return dishCardPhotoInflight[dishId];
  }

  console.log("Fetching Unsplash photo for dish: " + dishId);

  const fetchPromise = (async () => {
    const url =
      "https://api.unsplash.com/search/photos?query=" +
      encodeURIComponent(query) +
      "&per_page=3&orientation=portrait&content_filter=high&client_id=" +
      UNSPLASH_ACCESS_KEY;

    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Unsplash HTTP ${res.status}${body ? `: ${body.slice(0, 120)}` : ""}`);
    }

    const data = await res.json();
    const photoUrl = data.results?.[0]?.urls?.regular || null;

    if (typeof dishId === "number") {
      if (photoUrl) {
        DISH_PHOTO_CACHE[dishId] = photoUrl;
        writeDishPhotoToStorage(dishId, photoUrl);
      } else {
        DISH_PHOTO_CACHE[dishId] = false;
      }
      delete dishCardPhotoInflight[dishId];
      notifyDishCardPhotoListeners();
    }

    return photoUrl;
  })();

  if (typeof dishId === "number") {
    dishCardPhotoInflight[dishId] = fetchPromise;
  }

  try {
    return await fetchPromise;
  } catch (err) {
    if (typeof dishId === "number") {
      DISH_PHOTO_CACHE[dishId] = false;
      delete dishCardPhotoInflight[dishId];
      notifyDishCardPhotoListeners();
    }
    throw err;
  }
}

function scheduleDishPhotoFetch(dishId, query, staggerIndex) {
  if (typeof dishId !== "number" || !query) return;
  if (resolveDishPhotoUrl(dishId)) return;
  if (DISH_PHOTO_CACHE[dishId] === false) return;
  if (dishCardPhotoInflight[dishId]) return;

  setTimeout(() => {
    getDishCardPhoto(query, dishId).catch((err) => {
      console.warn(`Unsplash fetch failed (dish ${dishId}):`, err.message);
    });
  }, staggerIndex * 200);
}

function prefetchDishPhotosForIndices(orderedDishes, startIdx, endIdx) {
  if (!UNSPLASH_ACCESS_KEY) return;

  let stagger = 0;
  for (let i = startIdx; i <= endIdx && i < orderedDishes.length; i++) {
    const dish = orderedDishes[i];
    const query = DISH_PHOTO_QUERIES[dish.id];
    if (!query) continue;
    scheduleDishPhotoFetch(dish.id, query, stagger);
    stagger += 1;
  }
}

function parseRating(restaurant) {
  const n = parseFloat(restaurant.rating);
  return Number.isFinite(n) ? n : 0;
}

function parseDistanceMiles(restaurant) {
  const n = parseFloat(restaurant.distanceMiles);
  return Number.isFinite(n) ? n : 10;
}

function restaurantRankScore(restaurant) {
  const ratingPart = (parseRating(restaurant) / 5) * 0.6;
  const distancePart = Math.max(0, 1 - parseDistanceMiles(restaurant) / 10) * 0.4;
  return ratingPart + distancePart;
}

function sortRestaurantsByRankScore(list) {
  return [...list].sort((a, b) => restaurantRankScore(b) - restaurantRankScore(a));
}

function applyRestaurantFilter(list, filter) {
  let out = [...list];
  if (filter === "open") {
    out = out.filter((r) => r.isOpenNow);
  }
  switch (filter) {
    case "rating":
      return out.sort((a, b) => parseRating(b) - parseRating(a));
    case "closest":
      return out.sort((a, b) => parseDistanceMiles(a) - parseDistanceMiles(b));
    case "smart":
    default:
      return sortRestaurantsByRankScore(out);
  }
}

// ─── API CALLS ────────────────────────────────────────────────────────────────
async function searchRestaurants(lat, lng, term, tasteTags = []) {
  const cacheKey = restaurantCacheKey(term, lat, lng);
  try {
    const cached = await getCachedRestaurants(cacheKey);
    if (cached?.length) return sortRestaurantsByRankScore(cached);
  } catch (err) {
    console.warn("Restaurant cache lookup failed:", err.message);
  }

  let results;
  if (!CONFIG.GOOGLE_PLACES_API_KEY) {
    console.warn("Missing Google Places API key, using mock data");
    results = sortRestaurantsByRankScore(await getMockList(term));
  } else {
    try {
      results = sortRestaurantsByRankScore(
        await searchGooglePlacesNearby(lat, lng, term, tasteTags),
      );
    } catch (err) {
      console.warn("Google Places Nearby Search failed, using mock data:", err);
      results = sortRestaurantsByRankScore(await getMockList(term));
    }
  }

  try {
    await saveCachedRestaurants(cacheKey, results);
  } catch (err) {
    console.warn("Restaurant cache save failed:", err.message);
  }

  return results;
}

async function fetchDetail(businessId, restaurant) {
  if (isMockPlaceId(businessId)) {
    return getMockDetail(businessId, restaurant);
  }
  const placeId = restaurant?.placeId || businessId;
  if (!placeId || !CONFIG.GOOGLE_PLACES_API_KEY) {
    return buildDetailFromSearch(restaurant);
  }
  try {
    return await fetchGooglePlaceDetails(placeId, restaurant);
  } catch (err) {
    console.warn("Place details failed, using search data:", err.message);
    return buildDetailFromSearch(restaurant);
  }
}

const PLACE_DETAIL_FIELDS =
  "name,formatted_phone_number,website,opening_hours,photos,reviews,price_level,formatted_address,url,rating,user_ratings_total";

function isMockPlaceId(id) {
  return typeof id === "string" && /^[rtb]\d+$/.test(id);
}

function buildDetailFromSearch(r = {}) {
  const phone = r.phone || "";
  return {
    id: r.id,
    placeId: r.placeId || r.id,
    name: r.name || "Restaurant",
    cuisine: r.cuisine || "Restaurant",
    allCategories: [r.cuisine || "Restaurant"],
    rating: r.rating || "—",
    reviewCount: r.reviewCount || 0,
    price: r.price || "$$",
    phone,
    phoneRaw: phone.replace(/\D/g, ""),
    address: r.address || "",
    lat: r.lat,
    lng: r.lng,
    photos: r.primaryPhoto ? [r.primaryPhoto] : [],
    primaryPhoto: r.primaryPhoto || null,
    website: r.website || null,
    googleMapsUrl:
      r.lat != null && r.lng != null
        ? `https://maps.google.com/?q=${r.lat},${r.lng}`
        : null,
    orderUrl: r.orderUrl || null,
    isPartner: r.isPartner || false,
    deliversYelp: r.deliversYelp || false,
    doesPickup: r.doesPickup ?? true,
    doesReservations: false,
    isOpenNow: r.isOpenNow ?? true,
    weekdayText: [],
    hours: [],
    reviews: [],
    yelpUrl: null,
  };
}

function mapGooglePlaceDetails(result, restaurant) {
  const r = restaurant || {};
  const photos = (result.photos || [])
    .slice(0, 4)
    .map((p) => placePhotoUrl(p.photo_reference, 800))
    .filter(Boolean);
  const phone = result.formatted_phone_number || r.phone || "";
  const fallback = buildDetailFromSearch(r);

  return {
    ...fallback,
    id: r.id || result.place_id,
    placeId: result.place_id || r.placeId || r.id,
    name: result.name || r.name,
    rating: result.rating != null ? String(result.rating) : r.rating,
    reviewCount: result.user_ratings_total ?? r.reviewCount ?? 0,
    price:
      result.price_level != null
        ? priceFromLevel(result.price_level)
        : r.price || "$$",
    phone,
    phoneRaw: phone.replace(/\D/g, ""),
    address: result.formatted_address || r.address,
    photos: photos.length ? photos : fallback.photos,
    primaryPhoto: photos[0] || r.primaryPhoto || null,
    website: result.website || null,
    googleMapsUrl: result.url || fallback.googleMapsUrl,
    isOpenNow: result.opening_hours?.open_now ?? r.isOpenNow ?? true,
    weekdayText: result.opening_hours?.weekday_text || [],
    hours: [],
    reviews: (result.reviews || []).map((rv, i) => ({
      id: `gp-${i}-${rv.author_name}`,
      author: rv.author_name,
      rating: rv.rating,
      text: rv.text,
      date: rv.relative_time_description,
    })),
    yelpUrl: null,
  };
}

async function fetchGooglePlaceDetails(placeId, restaurant) {
  const data = await fetchPlacesApi("/place/details/json", {
    place_id: placeId,
    fields: PLACE_DETAIL_FIELDS,
  });
  if (!data.result) throw new Error("No place details returned");
  return mapGooglePlaceDetails(data.result, restaurant);
}

// ─── MOCK DATA ────────────────────────────────────────────────────────────────
function getMockList(term) {
  const base = {
    distanceMiles: "0.4", reviewCount: 2847,
    primaryPhoto: null, isOpenNow: true,
    deliversYelp: true, doesPickup: true,
    website: null, orderUrl: null, isPartner: false,
  };
  const all = {
    ramen: [
      { ...base, id:"r1", name:"Toki Underground",  cuisine:"Ramen",    rating:"4.9", price:"$$",  distanceMiles:"0.4", address:"1234 H St NE, Washington, DC",    phone:"(202) 388-0100", reviewCount:2847 },
      { ...base, id:"r2", name:"Daikaya Ramen",     cuisine:"Japanese", rating:"4.7", price:"$$",  distanceMiles:"0.9", address:"705 6th St NW, Washington, DC",   phone:"(202) 589-1600", reviewCount:1923, isPartner:true, orderUrl:"https://doordash.com", website:"https://daikaya.com" },
      { ...base, id:"r3", name:"Menya Hosaki",      cuisine:"Ramen",    rating:"4.8", price:"$$",  distanceMiles:"1.8", address:"1129 5th St NW, Washington, DC",  phone:"(202) 844-8490", reviewCount:987,  isOpenNow:false },
    ],
    tacos: [
      { ...base, id:"t1", name:"Taco Bamba",        cuisine:"Mexican",  rating:"4.8", price:"$",   distanceMiles:"0.8", address:"7511 Leesburg Pike, Falls Church", phone:"(703) 639-0100", reviewCount:2341 },
      { ...base, id:"t2", name:"Oyamel",            cuisine:"Mexican",  rating:"4.6", price:"$$$", distanceMiles:"0.6", address:"401 7th St NW, Washington, DC",   phone:"(202) 628-1005", reviewCount:3891, isOpenNow:false },
    ],
    burgers: [
      { ...base, id:"b1", name:"Good Stuff Eatery", cuisine:"American", rating:"4.7", price:"$",   distanceMiles:"0.3", address:"303 Pennsylvania Ave SE, DC",     phone:"(202) 543-8222", reviewCount:4521 },
      { ...base, id:"b2", name:"Shake Shack",       cuisine:"Burgers",  rating:"4.5", price:"$$",  distanceMiles:"0.7", address:"1216 18th St NW, DC",             phone:"(202) 683-9922", reviewCount:3210 },
    ],
  };
  return new Promise(r => setTimeout(() => r(all[term] || all.ramen), 900));
}

function getMockDetail(id, restaurant) {
  // Use the real restaurant data as the base — only add supplemental fields
  const r = restaurant || {};
  return new Promise(resolve => setTimeout(() => resolve({
    id,
    // ── Use actual restaurant fields so Shake Shack shows Shake Shack etc ──
    name:          r.name          || "Restaurant",
    cuisine:       r.cuisine       || "Restaurant",
    allCategories: [r.cuisine      || "Restaurant"],
    rating:        r.rating        || "4.5",
    reviewCount:   r.reviewCount   || 0,
    price:         r.price         || "$$",
    phone:         r.phone         || "",
    phoneRaw:      (r.phone        || "").replace(/\D/g, ""),
    address:       r.address       || "",
    lat:           r.lat           || 38.9005,
    lng:           r.lng           || -77.0004,
    photos:        r.primaryPhoto  ? [r.primaryPhoto] : [null],
    primaryPhoto:  r.primaryPhoto  || null,
    yelpUrl:       r.yelpUrl       || "https://yelp.com",
    website:       r.website       || null,
    orderUrl:      r.orderUrl      || null,
    isPartner:     r.isPartner     || false,
    deliversYelp:  r.deliversYelp  || false,
    doesPickup:    r.doesPickup    || false,
    doesReservations: false,
    isOpenNow:     r.isOpenNow     !== undefined ? r.isOpenNow : true,
    // ── Supplemental data — in production comes from Yelp Business Details ──
    hours: [
      { day:0, start:"1100", end:"2200" },
      { day:1, start:"1100", end:"2200" },
      { day:2, start:"1100", end:"2200" },
      { day:3, start:"1100", end:"2200" },
      { day:4, start:"1100", end:"2300" },
      { day:5, start:"1000", end:"2300" },
      { day:6, start:"1000", end:"2200" },
    ],
    reviews: [
      { id:"rv1", rating:5, text:`${r.name || "This place"} is absolutely incredible. One of my favorite spots in the city.`, author:"Alex M.", date:"2024-11-15" },
      { id:"rv2", rating:4, text:"Great food and solid service. Will definitely be coming back again soon.", author:"Jordan K.", date:"2024-11-02" },
      { id:"rv3", rating:5, text:"Worth every penny. The quality here is consistently top notch.", author:"Taylor L.", date:"2024-10-28" },
    ],
  }), 700));
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────
function fmtHour(h) {
  if (!h) return "";
  const n  = parseInt(h.slice(0,2), 10);
  const mm = h.slice(2);
  const suffix = n >= 12 ? "pm" : "am";
  const hr = n > 12 ? n - 12 : n === 0 ? 12 : n;
  return `${hr}${mm === "00" ? "" : ":" + mm}${suffix}`;
}

// ─── GLOBAL STYLES ────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800;900&display=swap');
  *, *::before, *::after {
    box-sizing: border-box; margin: 0; padding: 0;
    -webkit-tap-highlight-color: transparent;
    font-family: 'Montserrat', system-ui, sans-serif;
  }
  body { background: #0A0A0A; }
  ::-webkit-scrollbar { width: 3px; height: 3px; }
  ::-webkit-scrollbar-thumb { background: rgba(232,0,10,0.4); border-radius: 3px; }

  .phone {
    width: min(390px, 100vw);
    height: min(844px, 100svh);
    background: #111;
    border-radius: clamp(0px, 4vw, 48px);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    position: relative;
    box-shadow: 0 40px 100px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.06);
  }
  .tabbody {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 10px 18px 0;
    position: relative;
    min-height: 0;
  }
  .cardstack {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
  }
  .swipecard {
    position: absolute;
    inset: 0;
    border-radius: 26px;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0,0,0,0.7);
    will-change: transform;
  }
  .swipecard.leaving {
    transition: transform 0.42s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.42s ease;
    opacity: 0;
    pointer-events: none;
  }
  .change-craving-pill {
    position: absolute;
    top: 6px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 30;
    padding: 7px 14px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.92);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.02em;
    cursor: pointer;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
    transition: background 0.2s, transform 0.15s;
    pointer-events: auto;
  }
  .change-craving-pill:hover {
    background: rgba(0, 0, 0, 0.72);
    transform: translateX(-50%) scale(1.03);
  }
  .change-craving-pill:active {
    transform: translateX(-50%) scale(0.97);
  }
  .rest-filter-strip {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
    flex-shrink: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .rest-filter-strip::-webkit-scrollbar { display: none; }
  .rest-filter-pill {
    flex-shrink: 0;
    padding: 6px 12px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.75);
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    transition: background 0.2s, border-color 0.2s, color 0.2s;
  }
  .rest-filter-pill.active {
    background: rgba(232, 0, 10, 0.25);
    border-color: rgba(232, 0, 10, 0.55);
    color: #fff;
  }
  .chip {
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 20px;
    padding: 3px 10px;
    font-size: 11px;
    color: rgba(255,255,255,0.8);
    font-weight: 700;
  }
  .redbtn {
    background: linear-gradient(135deg, #E8000A, #FF3322);
    border: none;
    border-radius: 18px;
    color: #fff;
    font-size: 15px;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 8px 24px rgba(232,0,10,0.4);
    transition: transform 0.15s;
    width: 100%;
    padding: 15px 0;
  }
  .redbtn:hover { transform: scale(1.02); }
  .redbtn:active { transform: scale(0.97); }
  .ghostbtn {
    width: 100%;
    padding: 14px 0;
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 18px;
    color: rgba(255,255,255,0.6);
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
  }
  .toast {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    border-radius: 20px;
    padding: 8px 18px;
    font-size: 13px;
    font-weight: 800;
    color: #fff;
    z-index: 100;
    white-space: nowrap;
    animation: bpop 0.35s ease, bfade 0.4s ease 1.4s forwards;
  }
  .toast-r { background: linear-gradient(135deg,#E8000A,#FF3322); box-shadow: 0 4px 20px rgba(232,0,10,0.5); }
  .toast-d { background: rgba(35,35,40,0.96); border: 1px solid rgba(255,255,255,0.1); }

  .likedcard {
    border-radius: 18px;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.03);
    margin-bottom: 12px;
    cursor: pointer;
    transition: transform 0.18s, box-shadow 0.18s;
  }
  .likedcard:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
  .likedcard:active { transform: scale(0.99); }

  .actionbtn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    background: none;
    border: none;
    flex: 1;
  }
  .actionicon {
    width: 48px;
    height: 48px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    transition: transform 0.15s;
  }
  .actionicon:hover { transform: scale(1.1); }
  .actionicon:active { transform: scale(0.9); }
  .actionlabel {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.03em;
  }
  .detailrow {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 11px 0;
    border-bottom: 1px solid rgba(255,255,255,0.05);
  }
  .detailrow:last-child { border-bottom: none; }

  @keyframes bpop    { from { transform: translateX(-50%) scale(0.7); opacity: 0; } to { transform: translateX(-50%) scale(1); opacity: 1; } }
  @keyframes bfade   { to   { opacity: 0; transform: translateX(-50%) translateY(-6px); } }
  @keyframes pulse   { 0%,100% { box-shadow: 0 0 0 0 rgba(79,195,247,0.4); } 50% { box-shadow: 0 0 0 10px rgba(79,195,247,0); } }
  @keyframes fadeUp  { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
  @keyframes spin    { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes floaty  { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
  @keyframes ripple  { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(2.5); opacity: 0; } }

  .discover-actions {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 56px;
    padding: 10px 0 12px;
  }
  .discover-action {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    border: none;
    font-size: 30px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.15s, box-shadow 0.15s;
    color: #fff;
  }
  .discover-action:hover { transform: scale(1.06); }
  .discover-action:active { transform: scale(0.94); }
  .discover-action.pass {
    background: linear-gradient(135deg, #5c0000, #8b0000);
    box-shadow: 0 8px 24px rgba(92, 0, 0, 0.5);
    border: 1px solid rgba(255, 80, 80, 0.25);
  }
  .discover-action.save {
    background: linear-gradient(135deg, #E8000A, #FF3322);
    box-shadow: 0 8px 28px rgba(232, 0, 10, 0.55);
  }

  .detail-skeleton {
    background: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.05) 25%,
      rgba(255, 255, 255, 0.1) 50%,
      rgba(255, 255, 255, 0.05) 75%
    );
    background-size: 200% 100%;
    animation: detailShimmer 1.2s ease-in-out infinite;
    border-radius: 10px;
  }
  @keyframes detailShimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  .swipe-tutorial {
    position: absolute;
    inset: 0;
    z-index: 40;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    animation: swipeTutorialFade 2.6s ease forwards;
  }
  .swipe-tutorial-hand {
    position: absolute;
    top: 50%;
    left: 50%;
    font-size: 52px;
    filter: drop-shadow(0 6px 20px rgba(0, 0, 0, 0.55));
    opacity: 0.88;
    animation: swipeTutorialHand 2.2s ease-in-out forwards;
  }
  .swipe-tutorial-label {
    position: absolute;
    bottom: 18%;
    left: 50%;
    transform: translateX(-50%);
    color: rgba(255, 255, 255, 0.88);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-align: center;
    white-space: nowrap;
    background: rgba(0, 0, 0, 0.55);
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(8px);
  }
  @keyframes swipeTutorialHand {
    0%   { transform: translate(calc(-50% - 72px), -50%) rotate(-14deg); }
    28%  { transform: translate(calc(-50% + 72px), -50%) rotate(14deg); }
    38%  { transform: translate(calc(-50% + 72px), -50%) rotate(14deg); }
    62%  { transform: translate(calc(-50% - 72px), -50%) rotate(-14deg); }
    72%  { transform: translate(calc(-50% - 72px), -50%) rotate(-14deg); }
    88%  { transform: translate(-50%, -50%) rotate(0deg); }
    100% { transform: translate(-50%, -50%) rotate(0deg); opacity: 0.5; }
  }
  @keyframes swipeTutorialFade {
    0%, 75% { opacity: 1; }
    100% { opacity: 0; }
  }
`;

const TUTORIAL_SEEN_KEY = "crave_tutorial_seen";

function hasSeenSwipeTutorial() {
  try {
    return localStorage.getItem(TUTORIAL_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function SwipeTutorial({ onComplete }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(TUTORIAL_SEEN_KEY, "1");
      } catch {
        /* ignore */
      }
      onComplete();
    }, 2600);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="swipe-tutorial">
      <div className="swipe-tutorial-hand">👆</div>
      <div className="swipe-tutorial-label">Swipe right to save · Swipe left to skip</div>
    </div>
  );
}

const CARD_BOTTOM_GRADIENT =
  "linear-gradient(to bottom, transparent 0%, transparent 30%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.85) 75%, rgba(0,0,0,0.97) 100%)";
const CARD_TEXT_SHADOW = "0 2px 8px rgba(0,0,0,0.9)";

// ─── CARD VISUALS ─────────────────────────────────────────────────────────────
function DishCard({ dish, dim }) {
  const [photoUrl, setPhotoUrl] = useState(
    () => DISH_PHOTO_CACHE[dish.id] || readDishPhotoFromStorage(dish.id) || null,
  );
  const [loaded, setLoaded] = useState(
    () => Boolean(DISH_PHOTO_CACHE[dish.id] || readDishPhotoFromStorage(dish.id)),
  );
  const [imgErr, setImgErr] = useState(false);
  const showImg = Boolean(photoUrl) && !imgErr;

  useEffect(() => {
    let cancelled = false;

    const cached = DISH_PHOTO_CACHE[dish.id] || readDishPhotoFromStorage(dish.id);
    if (cached) {
      DISH_PHOTO_CACHE[dish.id] = cached;
      setPhotoUrl((prev) => prev || cached);
      setLoaded(true);
      return;
    }

    const query = DISH_PHOTO_QUERIES[dish.id];
    if (!query || DISH_PHOTO_CACHE[dish.id] === false) return;

    getDishCardPhoto(query, dish.id)
      .then((url) => {
        if (!cancelled && url) {
          DISH_PHOTO_CACHE[dish.id] = url;
          setPhotoUrl(url);
        }
      })
      .catch((err) => {
        console.warn(`Unsplash fetch failed (dish ${dish.id}):`, err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [dish.id]);

  useEffect(() => {
    const unsubscribe = subscribeDishCardPhotos(() => {
      const url = DISH_PHOTO_CACHE[dish.id] || readDishPhotoFromStorage(dish.id);
      if (url) {
        DISH_PHOTO_CACHE[dish.id] = url;
        setPhotoUrl((prev) => prev || url);
        setLoaded(true);
      }
    });
    return unsubscribe;
  }, [dish.id]);

  return (
    <div style={{ position:"absolute", inset:0, borderRadius:26, overflow:"hidden", background:`radial-gradient(ellipse at 35% 25%, ${dish.g2} 0%, ${dish.g1} 65%)` }}>
      {showImg && (
        <img
          src={photoUrl} alt={dish.name} draggable={false}
          onLoad={() => setLoaded(true)} onError={() => setImgErr(true)}
          style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", opacity: loaded ? 1 : 0, transition:"opacity 0.4s", pointerEvents:"none", zIndex:1 }}
        />
      )}
      {!showImg && (
        <>
          <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-65%)", width:230, height:230, borderRadius:"50%", background:`radial-gradient(circle, ${dish.glow} 0%, transparent 70%)`, filter:"blur(32px)" }} />
          <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-72%)", fontSize:118, lineHeight:1, userSelect:"none", pointerEvents:"none", filter:"drop-shadow(0 8px 32px rgba(0,0,0,0.5))", animation:"floaty 3s ease-in-out infinite" }}>
            {dish.emoji}
          </div>
        </>
      )}
      <div style={{ position:"absolute", inset:0, background: CARD_BOTTOM_GRADIENT }} />
      <div style={{ position:"absolute", inset:0, borderRadius:26, border:"1px solid rgba(255,255,255,0.08)", pointerEvents:"none" }} />
      {dim && <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.58)", borderRadius:26 }} />}
    </div>
  );
}

function RestCard({ restaurant, category, dim }) {
  const [loaded, setLoaded] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const showPhoto = restaurant.primaryPhoto && !imgErr;

  return (
    <div style={{ position:"absolute", inset:0, borderRadius:26, overflow:"hidden", background:`radial-gradient(ellipse at 35% 25%, ${category.g2} 0%, ${category.g1} 65%)` }}>
      {showPhoto && (
        <img
          src={restaurant.primaryPhoto} alt={restaurant.name} draggable={false}
          onLoad={() => setLoaded(true)} onError={() => setImgErr(true)}
          style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", opacity: loaded ? 1 : 0, transition:"opacity 0.4s", pointerEvents:"none" }}
        />
      )}
      {(!showPhoto || !loaded) && (
        <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-65%)", fontSize:108, lineHeight:1, userSelect:"none", pointerEvents:"none", filter:"drop-shadow(0 8px 24px rgba(0,0,0,0.5))" }}>
          {category.emoji}
        </div>
      )}
      <div style={{ position:"absolute", inset:0, background:"linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, transparent 38%, transparent 44%, rgba(0,0,0,0.97) 100%)" }} />
      {restaurant.isOpenNow !== null && restaurant.isOpenNow !== undefined && (
        <div style={{ position:"absolute", top:18, left:18, background: restaurant.isOpenNow ? "rgba(76,175,80,0.9)" : "rgba(244,67,54,0.85)", backdropFilter:"blur(8px)", borderRadius:20, padding:"4px 12px", fontSize:11, fontWeight:800, color:"#fff" }}>
          {restaurant.isOpenNow ? "🟢 Open Now" : "🔴 Closed"}
        </div>
      )}
      <div style={{ position:"absolute", top:18, right:18, background:"rgba(0,0,0,0.55)", backdropFilter:"blur(8px)", borderRadius:20, padding:"4px 12px", fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.85)", border:"1px solid rgba(255,255,255,0.12)" }}>
        {category.emoji} {category.name}
      </div>
      <div style={{ position:"absolute", inset:0, borderRadius:26, border:"1px solid rgba(255,255,255,0.08)", pointerEvents:"none" }} />
      {dim && <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.58)", borderRadius:26 }} />}
    </div>
  );
}

// ─── SPLASH ───────────────────────────────────────────────────────────────────
function Splash({ onDone }) {
  const [phase, setPhase] = useState("in");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("hold"), 400);
    const t2 = setTimeout(() => setPhase("out"),  2000);
    const t3 = setTimeout(() => onDone(),          2550);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div style={{
      position:"absolute", inset:0, zIndex:999,
      background:"linear-gradient(160deg, #E8000A 0%, #C8000A 40%, #A00008 100%)",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      opacity: phase === "out" ? 0 : 1,
      transform: phase === "out" ? "scale(1.04)" : "scale(1)",
      transition: phase === "out" ? "opacity 0.5s ease, transform 0.5s ease" : "none",
    }}>
      <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:280, height:280, borderRadius:"50%", background:"radial-gradient(circle,rgba(255,255,255,0.12) 0%,transparent 70%)" }} />
      <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:230, height:230, borderRadius:"50%", border:"1px solid rgba(255,255,255,0.1)" }} />
      <div style={{
        fontSize:72, marginBottom:14, filter:"drop-shadow(0 6px 24px rgba(0,0,0,0.4))",
        opacity: phase === "in" ? 0 : 1,
        transform: phase === "in" ? "scale(0.6) translateY(10px)" : "scale(1) translateY(0)",
        transition:"opacity 0.5s ease 0.15s, transform 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.15s",
      }}>🔥</div>
      <div style={{
        fontSize:52, fontWeight:900, color:"#fff", letterSpacing:"-2px",
        textShadow:"0 4px 24px rgba(0,0,0,0.3)",
        opacity: phase === "in" ? 0 : 1,
        transform: phase === "in" ? "translateY(12px)" : "translateY(0)",
        transition:"opacity 0.45s ease 0.2s, transform 0.45s ease 0.2s",
      }}>
        crave<span style={{ color:"rgba(255,255,255,0.7)" }}>.</span>
      </div>
      <div style={{
        color:"rgba(255,255,255,0.65)", fontSize:13, fontWeight:600,
        letterSpacing:"0.12em", textTransform:"uppercase", marginTop:12,
        opacity: phase === "in" ? 0 : 1, transition:"opacity 0.45s ease 0.4s",
      }}>
        swipe. crave. eat.
      </div>
      <div style={{ position:"absolute", bottom:52, left:"50%", transform:"translateX(-50%)", width:48, height:3, borderRadius:3, background:"rgba(255,255,255,0.2)", overflow:"hidden" }}>
        <div style={{ height:"100%", borderRadius:3, background:"rgba(255,255,255,0.8)", width: phase === "in" ? "0%" : "100%", transition: phase === "in" ? "none" : "width 1.5s ease 0.3s" }} />
      </div>
    </div>
  );
}

// ─── ONBOARDING ───────────────────────────────────────────────────────────────
function Onboard({ step, setStep, tasteTags, setTasteTags, onDone, onLocationGranted }) {
  const [locStatus, setLocStatus] = useState("idle");

  const requestLocation = () => {
    setLocStatus("requesting");
    if (!navigator.geolocation) { setLocStatus("denied"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onLocationGranted({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocStatus("granted");
        setTimeout(() => onDone(), 1200);
      },
      () => setLocStatus("denied"),
      { timeout: 10000, maximumAge: 300000 }
    );
  };

  const steps = [
    { emoji:"🔥", title:"Find food you'll actually crave", sub:`${FREE_DAILY_SWIPES} free swipes per day. Share to earn more. Premium unlocks AI recipes and 1-tap ordering.`, cta:"Let's Go" },
    { emoji:"🎯", title:"Build your flavor profile", sub:"Pick your vibe. We show you the best matches near you first.", tags:true, cta:"Looks Good" },
    { emoji:"👑", title:"Unlock the full experience", sub:"Premium = unlimited swipes, AI recipes, and 1-tap ordering.", premium:true, cta:"Maybe Later" },
    { emoji:"📍", title:"Find restaurants near you", sub:"Crave uses your location to show real restaurants within miles of you right now.", location:true },
  ];

  const s = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div className="phone" style={{ justifyContent:"space-between", padding:"52px 28px 48px", background:"#111" }}>
      {/* Progress dots */}
      <div style={{ display:"flex", gap:6, justifyContent:"center" }}>
        {steps.map((_, i) => (
          <div key={i} style={{ width: i === step ? 24 : 6, height:6, borderRadius:3, background: i === step ? "#E8000A" : "rgba(255,255,255,0.15)", transition:"all 0.3s" }} />
        ))}
      </div>

      {/* Body */}
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:72, marginBottom:18, animation:"floaty 3s ease-in-out infinite" }}>{s.emoji}</div>
        {step === 0 && (
          <div style={{ fontSize:34, fontWeight:900, color:"#fff", letterSpacing:"-1px", marginBottom:14 }}>
            crave<span style={{ color:"#E8000A" }}>.</span>
          </div>
        )}
        <div style={{ color:"#fff", fontSize:21, fontWeight:900, lineHeight:1.3, marginBottom:10 }}>{s.title}</div>
        <div style={{ color:"rgba(255,255,255,0.5)", fontSize:14, lineHeight:1.7 }}>{s.sub}</div>

        {/* Taste tags */}
        {s.tags && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, justifyContent:"center", marginTop:22 }}>
            {TASTE_TAGS.map(tag => (
              <div key={tag}
                onClick={() => setTasteTags(p => p.includes(tag) ? p.filter(t => t !== tag) : [...p, tag])}
                style={{
                  padding:"9px 16px", borderRadius:22, cursor:"pointer", fontSize:13, fontWeight:700, transition:"all 0.2s",
                  background: tasteTags.includes(tag) ? "linear-gradient(135deg,#E8000A,#FF3322)" : "rgba(255,255,255,0.07)",
                  color: tasteTags.includes(tag) ? "#fff" : "rgba(255,255,255,0.55)",
                  border: `1px solid ${tasteTags.includes(tag) ? "transparent" : "rgba(255,255,255,0.1)"}`,
                }}>
                {tag}
              </div>
            ))}
          </div>
        )}

        {/* Premium preview */}
        {s.premium && (
          <div style={{ marginTop:20, background:"rgba(232,0,10,0.1)", border:"1px solid rgba(232,0,10,0.25)", borderRadius:16, padding:"14px 16px", textAlign:"left" }}>
            {["♾️ Unlimited swipes", "👨‍🍳 AI recipes with ingredient lists", "🛵 1-tap ordering via DoorDash and Uber Eats", "📍 Real-time restaurant discovery"].map(f => (
              <div key={f} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                <div style={{ width:5, height:5, borderRadius:"50%", background:"#E8000A", flexShrink:0 }} />
                <span style={{ color:"rgba(255,255,255,0.75)", fontSize:13, fontWeight:600 }}>{f}</span>
              </div>
            ))}
            <div style={{ marginTop:10, padding:"8px 0", background:"rgba(255,215,0,0.1)", borderRadius:10, textAlign:"center", border:"1px solid rgba(255,215,0,0.2)" }}>
              <span style={{ color:"#FFD700", fontSize:13, fontWeight:800 }}>👑 ${MONTHLY_PRICE}/month · cancel anytime</span>
            </div>
          </div>
        )}

        {/* Location step */}
        {s.location && (
          <div style={{ marginTop:24 }}>
            {locStatus === "idle" && (
              <>
                <div style={{ position:"relative", width:80, height:80, margin:"0 auto 16px" }}>
                  <div style={{ position:"absolute", inset:0, borderRadius:"50%", background:"rgba(232,0,10,0.2)", animation:"ripple 2s ease-out infinite" }} />
                  <div style={{ position:"absolute", inset:8, borderRadius:"50%", background:"rgba(232,0,10,0.3)", animation:"ripple 2s ease-out 0.5s infinite" }} />
                  <div style={{ position:"absolute", inset:16, borderRadius:"50%", background:"linear-gradient(135deg,#E8000A,#FF3322)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:24 }}>📍</div>
                </div>
                <div style={{ background:"rgba(255,255,255,0.05)", borderRadius:14, padding:"12px 14px", textAlign:"left", border:"1px solid rgba(255,255,255,0.07)" }}>
                  {[
                    { icon:"📏", text:"Show exact distance to each restaurant" },
                    { icon:"🗺️", text:"Find spots within walking distance" },
                    { icon:"🔄", text:"Update results as you move around" },
                  ].map(r => (
                    <div key={r.text} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:7 }}>
                      <span style={{ fontSize:15, flexShrink:0 }}>{r.icon}</span>
                      <span style={{ color:"rgba(255,255,255,0.65)", fontSize:12, fontWeight:600 }}>{r.text}</span>
                    </div>
                  ))}
                  <div style={{ color:"rgba(255,255,255,0.25)", fontSize:11, marginTop:4 }}>Your location is never stored or shared.</div>
                </div>
              </>
            )}
            {locStatus === "granted" && (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10, padding:"16px 0" }}>
                <div style={{ width:60, height:60, borderRadius:"50%", background:"linear-gradient(135deg,#4CAF50,#66BB6A)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:28, boxShadow:"0 6px 20px rgba(76,175,80,0.4)" }}>✓</div>
                <div style={{ color:"#4CAF50", fontSize:16, fontWeight:800 }}>Location Enabled!</div>
                <div style={{ color:"rgba(255,255,255,0.4)", fontSize:13 }}>Finding restaurants near you...</div>
              </div>
            )}
            {locStatus === "denied" && (
              <div style={{ background:"rgba(255,152,0,0.12)", border:"1px solid rgba(255,152,0,0.3)", borderRadius:14, padding:"12px 14px" }}>
                <div style={{ color:"#FFA726", fontSize:13, fontWeight:800, marginBottom:6 }}>Location not available</div>
                <div style={{ color:"rgba(255,255,255,0.5)", fontSize:12, lineHeight:1.6 }}>No problem — we will use a default city to find restaurants near you.</div>
              </div>
            )}
            {locStatus === "requesting" && (
              <div style={{ padding:"20px 0", textAlign:"center", color:"rgba(255,255,255,0.5)", fontSize:14, fontWeight:700 }}>
                <span style={{ display:"inline-block", animation:"spin 1s linear infinite", marginRight:8 }}>⏳</span>
                Waiting for permission...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Buttons */}
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {s.location ? (
          <>
            {locStatus === "idle" && (
              <>
                <button onClick={requestLocation} className="redbtn">📍 Enable Location</button>
                <button onClick={onDone} className="ghostbtn">Skip for Now</button>
              </>
            )}
            {locStatus === "denied" && (
              <button onClick={onDone} className="redbtn">Continue Without Location</button>
            )}
          </>
        ) : s.premium ? (
          <>
            <button onClick={() => setStep(s => s + 1)} className="redbtn">👑 Try Premium Free for 7 Days</button>
            <button onClick={() => setStep(s => s + 1)} className="ghostbtn">{s.cta}</button>
          </>
        ) : (
          <button onClick={() => isLast ? onDone() : setStep(s => s + 1)} className="redbtn">{s.cta}</button>
        )}
      </div>
    </div>
  );
}

// ─── RESTAURANT DETAIL MODAL ──────────────────────────────────────────────────
function DetailSkeleton() {
  return (
    <div style={{ padding:"16px 20px" }}>
      <div className="detail-skeleton" style={{ height:28, width:"72%", marginBottom:10 }} />
      <div className="detail-skeleton" style={{ height:14, width:"40%", marginBottom:16 }} />
      <div style={{ display:"flex", gap:8, marginBottom:16 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="detail-skeleton" style={{ flex:1, height:72 }} />
        ))}
      </div>
      <div style={{ display:"flex", gap:8, marginBottom:20 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="detail-skeleton" style={{ flex:1, height:56, borderRadius:16 }} />
        ))}
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="detail-skeleton" style={{ height:52, marginBottom:10 }} />
      ))}
      <div className="detail-skeleton" style={{ height:88, marginTop:8 }} />
    </div>
  );
}

function DetailModal({ restaurant, category, isPremium, onClose, onRecipe }) {
  const [detail,      setDetail]      = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [activePhoto, setActivePhoto] = useState(0);
  const [showHours,   setShowHours]   = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [imgErrs,     setImgErrs]     = useState({});

  useEffect(() => {
    setDetail(null);
    setLoading(true);
    setActivePhoto(0);
    setShowHours(false);
    setImgErrs({});
    fetchDetail(restaurant.id, restaurant)
      .then((d) => setDetail(d))
      .catch(() => setDetail(buildDetailFromSearch(restaurant)))
      .finally(() => setLoading(false));
  }, [restaurant.id]);

  const d          = detail || buildDetailFromSearch(restaurant);
  const photos     = (d.photos?.length ? d.photos : [restaurant.primaryPhoto]).filter(Boolean);
  const isPartner  = d.isPartner || restaurant.isPartner;
  const orderUrl   = d.orderUrl  || restaurant.orderUrl;
  const website    = d.website   || restaurant.website;
  const hasPhoto   = photos.length > 0 && !imgErrs[activePhoto];
  const mapsUrl    = d.googleMapsUrl || (d.lat != null && d.lng != null ? `https://maps.google.com/?q=${d.lat},${d.lng}` : null);
  const todayName  = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date().getDay()];

  const handleOrder = () => {
    if (isPartner && orderUrl) {
      window.open(orderUrl, "_blank");
    } else {
      setShowTooltip(true);
      setTimeout(() => setShowTooltip(false), 3200);
    }
  };

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.88)", zIndex:300, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width:"100%", maxWidth:390, background:"#131313", borderRadius:"26px 26px 0 0", maxHeight:"92vh", display:"flex", flexDirection:"column", border:"1px solid rgba(255,255,255,0.08)", animation:"slideUp 0.3s ease", overflow:"hidden" }}>

        {/* Photo hero */}
        <div style={{ position:"relative", height:220, flexShrink:0, background: category ? `radial-gradient(circle at 40% 50%, ${category.g2}, ${category.g1})` : "#1a1a1a" }}>
          {hasPhoto && (
            <img src={photos[activePhoto]} alt={d.name}
              onError={() => setImgErrs(p => ({ ...p, [activePhoto]: true }))}
              style={{ width:"100%", height:"100%", objectFit:"cover", position:"absolute", inset:0 }}
            />
          )}
          {!hasPhoto && (
            <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-60%)", fontSize:80 }}>
              {category?.emoji || "🍽️"}
            </div>
          )}
          <div style={{ position:"absolute", inset:0, background:"linear-gradient(to top, rgba(19,19,19,1) 0%, rgba(0,0,0,0.25) 55%, transparent 100%)" }} />

          {/* Back */}
          <button onClick={onClose} style={{ position:"absolute", top:14, left:14, width:34, height:34, borderRadius:"50%", background:"rgba(0,0,0,0.6)", backdropFilter:"blur(8px)", border:"1px solid rgba(255,255,255,0.15)", color:"#fff", fontSize:18, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
            ←
          </button>

          {/* Photo dots */}
          {photos.length > 1 && (
            <div style={{ position:"absolute", bottom:70, left:"50%", transform:"translateX(-50%)", display:"flex", gap:5 }}>
              {photos.map((_, i) => (
                <div key={i} onClick={e => { e.stopPropagation(); setActivePhoto(i); }}
                  style={{ width: i === activePhoto ? 20 : 6, height:6, borderRadius:3, background: i === activePhoto ? "#fff" : "rgba(255,255,255,0.4)", cursor:"pointer", transition:"all 0.2s" }}
                />
              ))}
            </div>
          )}

          {/* Thumbnails */}
          {photos.length > 1 && (
            <div style={{ position:"absolute", bottom:12, left:14, right:14, display:"flex", gap:6 }}>
              {photos.slice(0, 4).map((p, i) => (
                <div key={i} onClick={e => { e.stopPropagation(); setActivePhoto(i); }}
                  style={{ width:52, height:40, borderRadius:8, overflow:"hidden", border:`2px solid ${i === activePhoto ? "#E8000A" : "rgba(255,255,255,0.2)"}`, cursor:"pointer", flexShrink:0, background: category ? `radial-gradient(${category.g2},${category.g1})` : "#222" }}>
                  {p && !imgErrs[i] && <img src={p} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={() => setImgErrs(pr => ({ ...pr, [i]: true }))} />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Scrollable content */}
        <div style={{ flex:1, overflowY:"auto", minHeight:0 }}>
          {loading ? (
            <DetailSkeleton />
          ) : (
          <>

          {/* Name + rating */}
          <div style={{ padding:"16px 20px 0" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div style={{ flex:1, minWidth:0, marginRight:12 }}>
                <div style={{ color:"#fff", fontSize:22, fontWeight:900, letterSpacing:"-0.5px", lineHeight:1.15 }}>{d.name}</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginTop:6 }}>
                  {(detail?.allCategories || [d.cuisine]).map(c => (
                    <span key={c} style={{ background:"rgba(232,0,10,0.15)", color:"#FF6060", borderRadius:10, padding:"2px 9px", fontSize:11, fontWeight:700 }}>{c}</span>
                  ))}
                </div>
              </div>
              <div style={{ background:"rgba(255,211,56,0.1)", border:"1px solid rgba(255,211,56,0.2)", borderRadius:12, padding:"8px 12px", textAlign:"center", flexShrink:0 }}>
                <div style={{ color:"#FFD338", fontSize:18, fontWeight:900 }}>{d.rating}</div>
                <div style={{ color:"rgba(255,255,255,0.35)", fontSize:9, marginTop:3, fontWeight:600 }}>{(d.reviewCount || 0).toLocaleString()} reviews</div>
              </div>
            </div>

            {/* 3 quick stat boxes */}
            <div style={{ display:"flex", gap:8, marginTop:14 }}>
              {[
                { icon:"📏", label:`${restaurant.distanceMiles} mi`, sub:"Distance" },
                { icon: d.isOpenNow ? "🟢" : "🔴", label: d.isOpenNow ? "Open Now" : "Closed", sub:"Status" },
                { icon:"💰", label: d.price || "$$", sub:"Price Range" },
              ].map(stat => (
                <div key={stat.sub} style={{ flex:1, background:"rgba(255,255,255,0.05)", borderRadius:12, padding:"10px 8px", textAlign:"center", border:"1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize:18 }}>{stat.icon}</div>
                  <div style={{ color:"#fff", fontSize:12, fontWeight:800, marginTop:4 }}>{stat.label}</div>
                  <div style={{ color:"rgba(255,255,255,0.35)", fontSize:9, marginTop:1 }}>{stat.sub}</div>
                </div>
              ))}
            </div>

            {/* Delivery badges */}
            {(d.deliversYelp || d.doesPickup || d.doesReservations) && (
              <div style={{ display:"flex", gap:7, marginTop:10, flexWrap:"wrap" }}>
                {d.deliversYelp     && <span style={{ background:"rgba(6,193,103,0.15)",  color:"#06C167", border:"1px solid rgba(6,193,103,0.3)",  borderRadius:10, padding:"4px 10px", fontSize:11, fontWeight:700 }}>🛵 Delivery</span>}
                {d.doesPickup       && <span style={{ background:"rgba(100,181,246,0.15)", color:"#64B5F6", border:"1px solid rgba(100,181,246,0.3)", borderRadius:10, padding:"4px 10px", fontSize:11, fontWeight:700 }}>🥡 Pickup</span>}
                {d.doesReservations && <span style={{ background:"rgba(255,215,0,0.15)",  color:"#FFD700", border:"1px solid rgba(255,215,0,0.3)",  borderRadius:10, padding:"4px 10px", fontSize:11, fontWeight:700 }}>📅 Reservations</span>}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ padding:"16px 20px", display:"flex", gap:8, borderBottom:"1px solid rgba(255,255,255,0.06)" }}>

            {/* Directions */}
            <button className="actionbtn" onClick={() => mapsUrl && window.open(mapsUrl, "_blank")} style={{ opacity: mapsUrl ? 1 : 0.5 }}>
              <div className="actionicon" style={{ background:"rgba(79,195,247,0.15)", border:"1px solid rgba(79,195,247,0.25)" }}>📍</div>
              <span className="actionlabel" style={{ color: mapsUrl ? "#4FC3F7" : "rgba(255,255,255,0.3)" }}>Directions</span>
            </button>

            {/* Call */}
            {d.phoneRaw && (
              <button className="actionbtn" onClick={() => window.open(`tel:${d.phoneRaw}`, "_blank")}>
                <div className="actionicon" style={{ background:"rgba(76,175,80,0.15)", border:"1px solid rgba(76,175,80,0.25)" }}>📞</div>
                <span className="actionlabel" style={{ color:"#81C784" }}>Call</span>
              </button>
            )}

            {/* Website */}
            <button className="actionbtn" onClick={() => website && window.open(website, "_blank")} style={{ opacity: website ? 1 : 0.5 }}>
              <div className="actionicon" style={{ background:"rgba(255,167,38,0.15)", border:"1px solid rgba(255,167,38,0.25)" }}>🌐</div>
              <span className="actionlabel" style={{ color: website ? "#FFA726" : "rgba(255,255,255,0.3)" }}>{website ? "Website" : "No Site"}</span>
            </button>

            {/* Order — grey if not partner */}
            <div style={{ flex:1, position:"relative" }}>
              <button className="actionbtn" onClick={handleOrder} style={{ width:"100%" }}>
                <div className="actionicon" style={{
                  background: isPartner && orderUrl ? "linear-gradient(135deg,#E8000A,#FF3322)" : "rgba(255,255,255,0.06)",
                  border: `1px solid ${isPartner && orderUrl ? "rgba(232,0,10,0.5)" : "rgba(255,255,255,0.12)"}`,
                }}>🛵</div>
                <span className="actionlabel" style={{ color: isPartner && orderUrl ? "#FF6060" : "rgba(255,255,255,0.3)" }}>
                  {isPartner && orderUrl ? "Order" : "Order"}
                </span>
              </button>

              {/* Tooltip */}
              {showTooltip && (
                <div style={{ position:"absolute", bottom:62, left:"50%", transform:"translateX(-50%)", background:"rgba(25,25,25,0.98)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:14, padding:"12px 14px", width:210, textAlign:"center", zIndex:10, animation:"fadeUp 0.2s ease", boxShadow:"0 8px 24px rgba(0,0,0,0.6)" }}>
                  <div style={{ color:"rgba(255,255,255,0.55)", fontSize:11, lineHeight:1.6, marginBottom: website ? 8 : 0 }}>
                    This restaurant has not joined Crave for direct ordering yet.
                  </div>
                  {website && (
                    <button onClick={() => window.open(website, "_blank")} style={{ padding:"6px 14px", background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:8, color:"#fff", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                      Visit their website →
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* AI Recipe (premium only) */}
            {isPremium && (
              <button className="actionbtn" onClick={() => onRecipe({ name: category?.name || d.cuisine, cuisine: d.cuisine, emoji: category?.emoji || "🍽️", g1: category?.g1 || "#1a0000", g3: category?.g3 || "#a00000" })}>
                <div className="actionicon" style={{ background:"rgba(255,215,0,0.15)", border:"1px solid rgba(255,215,0,0.3)" }}>👨‍🍳</div>
                <span className="actionlabel" style={{ color:"#FFD700" }}>Recipe</span>
              </button>
            )}
          </div>

          {/* Non-partner order info banner */}
          {!isPartner && (
            <div style={{ margin:"12px 20px 0", padding:"11px 14px", background:"rgba(255,255,255,0.04)", borderRadius:12, border:"1px solid rgba(255,255,255,0.07)", display:"flex", alignItems:"flex-start", gap:10 }}>
              <span style={{ fontSize:18, flexShrink:0 }}>🛵</span>
              <div style={{ color:"rgba(255,255,255,0.5)", fontSize:12, lineHeight:1.6 }}>
                This restaurant has not partnered with Crave yet for direct ordering.
                {website ? <> <span onClick={() => window.open(website,"_blank")} style={{ color:"#FF6060", cursor:"pointer", fontWeight:700 }}>Visit their website</span> to order directly.</> : " Check their Yelp page for ordering options."}
              </div>
            </div>
          )}

          {/* Detail info rows */}
          <div style={{ padding:"14px 20px 0" }}>

            {/* Address */}
            <div className="detailrow">
              <span style={{ fontSize:18, flexShrink:0 }}>📍</span>
              <div style={{ flex:1 }}>
                <div style={{ color:"#fff", fontSize:13, fontWeight:700 }}>{d.address || restaurant.address}</div>
                <div style={{ color:"rgba(255,255,255,0.35)", fontSize:11, marginTop:3 }}>{restaurant.distanceMiles} miles from your location</div>
              </div>
              <button onClick={() => mapsUrl && window.open(mapsUrl, "_blank")}
                style={{ background:"rgba(79,195,247,0.1)", border:"1px solid rgba(79,195,247,0.25)", borderRadius:8, padding:"5px 10px", color:"#4FC3F7", fontSize:11, fontWeight:700, cursor: mapsUrl ? "pointer" : "default", flexShrink:0, opacity: mapsUrl ? 1 : 0.5 }}>
                Map →
              </button>
            </div>

            {/* Phone */}
            {d.phone && (
              <div className="detailrow">
                <span style={{ fontSize:18, flexShrink:0 }}>📞</span>
                <div style={{ flex:1 }}>
                  <div style={{ color:"#fff", fontSize:13, fontWeight:700 }}>{d.phone}</div>
                  <div style={{ color:"rgba(255,255,255,0.35)", fontSize:11, marginTop:3 }}>Tap to call</div>
                </div>
                <a href={`tel:${d.phoneRaw || d.phone}`} style={{ background:"rgba(76,175,80,0.1)", border:"1px solid rgba(76,175,80,0.25)", borderRadius:8, padding:"5px 10px", color:"#81C784", fontSize:11, fontWeight:700, cursor:"pointer", textDecoration:"none" }}>
                  Call →
                </a>
              </div>
            )}

            {/* Hours */}
            <div className="detailrow" style={{ flexDirection:"column", gap:0 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", width:"100%", marginBottom: showHours ? 10 : 0 }}>
                  <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                    <span style={{ fontSize:18 }}>🕐</span>
                    <div>
                      <div style={{ color: d.isOpenNow ? "#81C784" : "#EF5350", fontSize:13, fontWeight:800 }}>
                        {d.isOpenNow ? "Open Now" : "Currently Closed"}
                      </div>
                      {d.weekdayText?.length > 0 && !showHours && (() => {
                        const todayLine = d.weekdayText.find((line) => line.startsWith(todayName));
                        return todayLine ? (
                          <div style={{ color:"rgba(255,255,255,0.35)", fontSize:11, marginTop:2 }}>
                            {todayLine.replace(/^[^:]+:\s*/, "")}
                          </div>
                        ) : null;
                      })()}
                      {!d.weekdayText?.length && d.hours?.length > 0 && (() => {
                        const today = new Date().getDay();
                        const yd    = today === 0 ? 6 : today - 1;
                        const th    = d.hours.find(h => h.day === yd);
                        return th ? <div style={{ color:"rgba(255,255,255,0.35)", fontSize:11, marginTop:2 }}>Today {fmtHour(th.start)} – {fmtHour(th.end)}</div> : null;
                      })()}
                    </div>
                  </div>
                  {(d.weekdayText?.length > 0 || d.hours?.length > 0) && (
                    <button onClick={() => setShowHours(s => !s)} style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, padding:"4px 10px", color:"rgba(255,255,255,0.5)", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                      {showHours ? "Hide" : "All Hours"}
                    </button>
                  )}
                </div>
                {showHours && d.weekdayText?.length > 0 && (
                  <div style={{ width:"100%", background:"rgba(255,255,255,0.04)", borderRadius:10, padding:"10px 12px" }}>
                    {d.weekdayText.map((line) => {
                      const isToday = line.startsWith(todayName);
                      const [dayPart, ...timeParts] = line.split(": ");
                      const timePart = timeParts.join(": ");
                      return (
                        <div key={line} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", fontSize:12, color: isToday ? "#fff" : "rgba(255,255,255,0.45)", fontWeight: isToday ? 700 : 500, gap:12 }}>
                          <span>{dayPart}{isToday ? " (today)" : ""}</span>
                          <span style={{ textAlign:"right" }}>{timePart}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {showHours && !d.weekdayText?.length && d.hours?.length > 0 && (
                  <div style={{ width:"100%", background:"rgba(255,255,255,0.04)", borderRadius:10, padding:"10px 12px" }}>
                    {d.hours.map(h => {
                      const today = new Date().getDay();
                      const yd    = today === 0 ? 6 : today - 1;
                      const isToday = h.day === yd;
                      return (
                        <div key={h.day} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", fontSize:12, color: isToday ? "#fff" : "rgba(255,255,255,0.45)", fontWeight: isToday ? 700 : 500 }}>
                          <span>{DAY_NAMES[h.day]}{isToday ? " (today)" : ""}</span>
                          <span>{fmtHour(h.start)} – {fmtHour(h.end)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            {/* Yelp link */}
            {d.yelpUrl && (
              <div className="detailrow">
                <span style={{ fontSize:18, flexShrink:0 }}>⭐</span>
                <div style={{ flex:1 }}>
                  <div style={{ color:"#fff", fontSize:13, fontWeight:700 }}>Read all {(d.reviewCount || 0).toLocaleString()} reviews</div>
                  <div style={{ color:"rgba(255,255,255,0.35)", fontSize:11, marginTop:3 }}>Powered by Yelp</div>
                </div>
                <a href={d.yelpUrl} target="_blank" rel="noopener noreferrer"
                  style={{ background:"rgba(232,0,10,0.1)", border:"1px solid rgba(232,0,10,0.25)", borderRadius:8, padding:"5px 10px", color:"#FF6060", fontSize:11, fontWeight:700, cursor:"pointer", textDecoration:"none" }}>
                  Yelp →
                </a>
              </div>
            )}
          </div>

          {/* Reviews */}
          {d.reviews?.length > 0 && (
            <div style={{ padding:"14px 20px" }}>
              <div style={{ color:"rgba(255,255,255,0.35)", fontSize:11, fontWeight:700, letterSpacing:1, marginBottom:10 }}>RECENT REVIEWS</div>
              {d.reviews.map(rv => (
                <div key={rv.id} style={{ background:"rgba(255,255,255,0.04)", borderRadius:14, padding:"12px 14px", border:"1px solid rgba(255,255,255,0.06)", marginBottom:10 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:7 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <div style={{ width:30, height:30, borderRadius:"50%", background:"linear-gradient(135deg,#E8000A,#FF3322)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:800, color:"#fff", flexShrink:0 }}>
                        {rv.author.charAt(0)}
                      </div>
                      <div>
                        <div style={{ color:"#fff", fontSize:12, fontWeight:700 }}>{rv.author}</div>
                        <div style={{ color:"rgba(255,255,255,0.3)", fontSize:10 }}>{rv.date}</div>
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:2 }}>
                      {[1,2,3,4,5].map(i => (
                        <span key={i} style={{ fontSize:11, color: i <= rv.rating ? "#FFD338" : "rgba(255,255,255,0.2)" }}>★</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ color:"rgba(255,255,255,0.6)", fontSize:12.5, lineHeight:1.65 }}>{rv.text}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ height:28 }} />
          </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── LIKED CARD ───────────────────────────────────────────────────────────────
function LikedCard({ restaurant, category, onClick }) {
  const [imgErr, setImgErr] = useState(false);
  const hasPhoto = restaurant.primaryPhoto && !imgErr;

  return (
    <div className="likedcard" onClick={onClick}>
      <div style={{ display:"flex", minHeight:96 }}>
        {/* Thumbnail */}
        <div style={{ width:100, flexShrink:0, position:"relative", background: category ? `radial-gradient(circle,${category.g2},${category.g1})` : "#1a1a1a", display:"flex", alignItems:"center", justifyContent:"center" }}>
          {hasPhoto ? (
            <img src={restaurant.primaryPhoto} alt={restaurant.name} onError={() => setImgErr(true)} style={{ width:"100%", height:"100%", objectFit:"cover", position:"absolute", inset:0 }} />
          ) : (
            <div style={{ fontSize:40 }}>{category?.emoji || "🍽️"}</div>
          )}
          {/* Open dot */}
          {restaurant.isOpenNow !== null && restaurant.isOpenNow !== undefined && (
            <div style={{ position:"absolute", top:8, left:8, width:8, height:8, borderRadius:"50%", background: restaurant.isOpenNow ? "#4CAF50" : "#F44336", border:"1.5px solid rgba(0,0,0,0.4)" }} />
          )}
        </div>

        {/* Info */}
        <div style={{ flex:1, padding:"12px 14px 10px", display:"flex", flexDirection:"column", justifyContent:"space-between", minWidth:0 }}>
          <div>
            <div style={{ color:"#fff", fontSize:15, fontWeight:800, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{restaurant.name}</div>
            <div style={{ color:"rgba(255,255,255,0.4)", fontSize:11, marginTop:2, fontWeight:600 }}>{restaurant.cuisine} · {category?.name}</div>
          </div>

          {/* 3 quick data points */}
          <div style={{ display:"flex", gap:6, marginTop:8, flexWrap:"wrap" }}>
            <div style={{ display:"flex", alignItems:"center", gap:4, background:"rgba(255,211,56,0.12)", borderRadius:8, padding:"4px 9px" }}>
              <span style={{ color:"#FFD338", fontSize:11 }}>⭐</span>
              <span style={{ color:"#FFD338", fontSize:11, fontWeight:800 }}>{restaurant.rating}</span>
              {restaurant.reviewCount > 0 && <span style={{ color:"rgba(255,255,255,0.3)", fontSize:10 }}>({restaurant.reviewCount.toLocaleString()})</span>}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:4, background:"rgba(232,0,10,0.12)", borderRadius:8, padding:"4px 9px" }}>
              <span style={{ color:"#FF6060", fontSize:11 }}>📏</span>
              <span style={{ color:"#FF6060", fontSize:11, fontWeight:800 }}>{restaurant.distanceMiles} mi</span>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:4, background: restaurant.isOpenNow ? "rgba(76,175,80,0.12)" : "rgba(244,67,54,0.12)", borderRadius:8, padding:"4px 9px" }}>
              <span style={{ fontSize:10 }}>{restaurant.isOpenNow ? "🟢" : "🔴"}</span>
              <span style={{ color: restaurant.isOpenNow ? "#81C784" : "#EF5350", fontSize:11, fontWeight:800 }}>{restaurant.isOpenNow ? "Open" : "Closed"}</span>
            </div>
          </div>
        </div>

        {/* Arrow */}
        <div style={{ display:"flex", alignItems:"center", paddingRight:14 }}>
          <div style={{ color:"rgba(255,255,255,0.2)", fontSize:20 }}>›</div>
        </div>
      </div>

      {/* Address strip */}
      <div style={{ padding:"8px 14px 10px", borderTop:"1px solid rgba(255,255,255,0.04)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ color:"rgba(255,255,255,0.3)", fontSize:10, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>
          📍 {restaurant.address}
        </div>
        <div style={{ color:"rgba(255,255,255,0.2)", fontSize:10, flexShrink:0, marginLeft:8 }}>Tap for full details</div>
      </div>
    </div>
  );
}

// ─── AI RECIPE MODAL ──────────────────────────────────────────────────────────
function RecipeModal({ name, cuisine, emoji, g1, g3, onClose }) {
  const [recipe,    setRecipe]    = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(false);
  const [activeTab, setActiveTab] = useState("ingredients");

  const load = useCallback(() => {
    setLoading(true); setError(false); setRecipe(null);
    fetchRecipeWithCache(name, cuisine)
      .then((data) => { setRecipe(data); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [name, cuisine]);

  useEffect(() => { load(); }, [load]);

  const diffColor = { Easy:"#4CAF50", Medium:"#FF9800", Hard:"#F44336" };

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.94)", zIndex:400, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width:"100%", maxWidth:390, background:"#0f0f0f", borderRadius:"28px 28px 0 0", maxHeight:"88vh", display:"flex", flexDirection:"column", border:"1px solid rgba(255,255,255,0.08)", animation:"slideUp 0.32s ease", overflow:"hidden" }}>
        <div style={{ position:"relative", height:155, flexShrink:0, background:`radial-gradient(circle at 40% 50%, ${g3}, ${g1})` }}>
          <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-58%)", fontSize:82 }}>{emoji}</div>
          <div style={{ position:"absolute", inset:0, background:"linear-gradient(to top,rgba(15,15,15,1),transparent 55%)" }} />
          <div style={{ position:"absolute", bottom:14, left:20 }}>
            <div style={{ background:"linear-gradient(135deg,#FFD700,#FFA500)", borderRadius:8, padding:"2px 10px", fontSize:11, fontWeight:900, color:"#000", display:"inline-block", marginBottom:4 }}>👑 PREMIUM RECIPE</div>
            <div style={{ color:"#fff", fontSize:19, fontWeight:900 }}>{name}</div>
          </div>
          <button onClick={onClose} style={{ position:"absolute", top:14, right:14, width:32, height:32, borderRadius:"50%", background:"rgba(0,0,0,0.6)", border:"none", color:"#fff", fontSize:16, cursor:"pointer" }}>✕</button>
        </div>

        {loading && (
          <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, padding:32 }}>
            <div style={{ fontSize:44, animation:"spin 1.2s linear infinite" }}>👨‍🍳</div>
            <div style={{ color:"#fff", fontSize:15, fontWeight:800 }}>Generating your recipe...</div>
          </div>
        )}

        {error && !loading && (
          <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12, padding:32 }}>
            <div style={{ fontSize:44 }}>😅</div>
            <div style={{ color:"#fff", fontSize:15, fontWeight:800 }}>Could not load recipe</div>
            <button onClick={load} className="redbtn" style={{ width:"auto", padding:"12px 28px", marginTop:8 }}>Try Again</button>
          </div>
        )}

        {recipe && !loading && (
          <div style={{ flex:1, overflowY:"auto", minHeight:0 }}>
            <div style={{ display:"flex", gap:8, padding:"14px 18px 0", flexWrap:"wrap" }}>
              {[
                { icon:"🕐", label:"Prep",   val: recipe.prepTime },
                { icon:"🔥", label:"Cook",   val: recipe.cookTime },
                { icon:"👥", label:"Serves", val: String(recipe.servings) },
                { icon:"📊", label:"Level",  val: recipe.difficulty, color: diffColor[recipe.difficulty] || "#fff" },
              ].map(m => (
                <div key={m.label} style={{ background:"rgba(255,255,255,0.06)", borderRadius:12, padding:"10px 8px", flex:1, minWidth:60, textAlign:"center", border:"1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize:16 }}>{m.icon}</div>
                  <div style={{ color: m.color || "#fff", fontSize:11, fontWeight:800, marginTop:3 }}>{m.val}</div>
                  <div style={{ color:"rgba(255,255,255,0.35)", fontSize:9, marginTop:1 }}>{m.label}</div>
                </div>
              ))}
            </div>

            <div style={{ margin:"12px 18px 0", background:"rgba(232,0,10,0.1)", border:"1px solid rgba(232,0,10,0.2)", borderRadius:14, padding:"12px 14px", display:"flex", gap:10 }}>
              <span style={{ fontSize:20, flexShrink:0 }}>👨‍🍳</span>
              <div>
                <div style={{ color:"#E8000A", fontSize:10, fontWeight:800, letterSpacing:1, marginBottom:3 }}>CHEF TIP</div>
                <div style={{ color:"rgba(255,255,255,0.7)", fontSize:12.5, lineHeight:1.6 }}>{recipe.chefTip}</div>
              </div>
            </div>

            <div style={{ display:"flex", margin:"14px 18px 0", background:"rgba(255,255,255,0.05)", borderRadius:14, padding:4 }}>
              {["ingredients","steps"].map(t => (
                <button key={t} onClick={() => setActiveTab(t)} style={{ flex:1, padding:"9px 0", borderRadius:11, border:"none", background: activeTab === t ? "linear-gradient(135deg,#E8000A,#FF3322)" : "transparent", color: activeTab === t ? "#fff" : "rgba(255,255,255,0.4)", fontSize:13, fontWeight:800, cursor:"pointer", transition:"all 0.2s" }}>
                  {t === "ingredients" ? "🧂 Ingredients" : "📋 Steps"}
                </button>
              ))}
            </div>

            {activeTab === "ingredients" && (
              <div style={{ padding:"14px 18px 28px" }}>
                <div style={{ color:"rgba(255,255,255,0.35)", fontSize:11, fontWeight:700, letterSpacing:1, marginBottom:10 }}>{recipe.ingredients.length} INGREDIENTS</div>
                {recipe.ingredients.map((ing, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom: i < recipe.ingredients.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                    <div style={{ width:28, height:28, borderRadius:8, background:"rgba(232,0,10,0.12)", border:"1px solid rgba(232,0,10,0.2)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <span style={{ color:"#E8000A", fontSize:10, fontWeight:900 }}>{i + 1}</span>
                    </div>
                    <div style={{ flex:1, color:"#fff", fontSize:13, fontWeight:700 }}>{ing.item}</div>
                    <div style={{ background:"rgba(255,255,255,0.06)", borderRadius:8, padding:"3px 9px", flexShrink:0 }}>
                      <span style={{ color:"rgba(255,255,255,0.8)", fontSize:11, fontWeight:700 }}>{ing.amount} {ing.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "steps" && (
              <div style={{ padding:"14px 18px 28px" }}>
                <div style={{ color:"rgba(255,255,255,0.35)", fontSize:11, fontWeight:700, letterSpacing:1, marginBottom:10 }}>{recipe.steps.length} STEPS</div>
                {recipe.steps.map((s, i) => (
                  <div key={i} style={{ display:"flex", gap:14, marginBottom:18 }}>
                    <div style={{ flexShrink:0, display:"flex", flexDirection:"column", alignItems:"center" }}>
                      <div style={{ width:32, height:32, borderRadius:"50%", background: i === 0 ? "linear-gradient(135deg,#E8000A,#FF3322)" : "rgba(255,255,255,0.07)", border: i === 0 ? "none" : "1px solid rgba(255,255,255,0.1)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                        <span style={{ color:"#fff", fontSize:12, fontWeight:900 }}>{i + 1}</span>
                      </div>
                      {i < recipe.steps.length - 1 && <div style={{ width:1, flex:1, background:"rgba(255,255,255,0.07)", marginTop:6, minHeight:12 }} />}
                    </div>
                    <div style={{ flex:1, paddingTop:5 }}>
                      <div style={{ color:"#fff", fontSize:13, fontWeight:800, marginBottom:4 }}>{s.title}</div>
                      <div style={{ color:"rgba(255,255,255,0.55)", fontSize:12.5, lineHeight:1.7 }}>{s.instruction}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ height:20 }} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SWIPE WALL ───────────────────────────────────────────────────────────────
function SwipeWall({ onShare, onUpgrade, isShare }) {
  return (
    <div style={{ position:"absolute", inset:0, zIndex:50, background:"rgba(0,0,0,0.92)", backdropFilter:"blur(16px)", borderRadius:26, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"28px 24px" }}>
      <div style={{ fontSize:52, marginBottom:14 }}>{isShare ? "🎁" : "🔥"}</div>
      {!isShare && (
        <>
          <div style={{ color:"#fff", fontSize:19, fontWeight:900, textAlign:"center", marginBottom:8 }}>You have used your {FREE_DAILY_SWIPES} free swipes</div>
          <div style={{ color:"rgba(255,255,255,0.5)", fontSize:13, textAlign:"center", lineHeight:1.6, marginBottom:18 }}>Share Crave to get more free swipes, or go Premium.</div>
          <button onClick={onShare} style={{ width:"100%", padding:"13px 0", background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:18, color:"#fff", fontSize:14, fontWeight:800, cursor:"pointer", marginBottom:12 }}>
            📲 Share for +{BONUS_SHARE_SWIPES} Free Swipes
          </button>
        </>
      )}
      {isShare && (
        <>
          <div style={{ color:"#fff", fontSize:19, fontWeight:900, textAlign:"center", marginBottom:8 }}>Share and Get 10 More!</div>
          <div style={{ color:"rgba(255,255,255,0.5)", fontSize:13, textAlign:"center", lineHeight:1.6, marginBottom:20 }}>Send Crave to a friend. You both get 10 free swipes daily.</div>
          <button onClick={onShare} className="redbtn" style={{ marginBottom:12 }}>📲 Share Crave Now</button>
          <div style={{ color:"rgba(255,255,255,0.3)", fontSize:12, marginBottom:14 }}>or upgrade below</div>
        </>
      )}
      <div style={{ width:"100%", background:"rgba(232,0,10,0.12)", border:"1px solid rgba(232,0,10,0.28)", borderRadius:18, padding:"16px 18px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
          <span style={{ fontSize:20 }}>👑</span>
          <div>
            <div style={{ color:"#fff", fontSize:14, fontWeight:900 }}>Crave Premium</div>
            <div style={{ color:"rgba(255,255,255,0.45)", fontSize:11 }}>${MONTHLY_PRICE}/month, cancel anytime</div>
          </div>
        </div>
        {["♾️ Unlimited swipes", "👨‍🍳 AI recipes", "🛵 1-tap ordering", "📍 Real-time discovery"].map(f => (
          <div key={f} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
            <div style={{ width:5, height:5, borderRadius:"50%", background:"#E8000A", flexShrink:0 }} />
            <span style={{ color:"rgba(255,255,255,0.7)", fontSize:12 }}>{f}</span>
          </div>
        ))}
        <button onClick={onUpgrade} className="redbtn" style={{ marginTop:12 }}>
          👑 Go Premium — ${MONTHLY_PRICE}/mo
        </button>
      </div>
    </div>
  );
}

// ─── BOTTOM NAV ───────────────────────────────────────────────────────────────
function BottomNav({ tab, setTab, count }) {
  const tabs = [
    { id:"discover", icon:"⚡", label:"Discover" },
    { id:"liked",    icon:"❤️", label:"Saved",   badge: count },
    { id:"profile",  icon:"👤", label:"Profile" },
  ];

  return (
    <nav style={{ padding:"8px 10px 24px", background:"rgba(12,12,16,0.98)", backdropFilter:"blur(20px)", borderTop:"1px solid rgba(255,255,255,0.05)", display:"flex", justifyContent:"space-around", flexShrink:0 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => setTab(t.id)} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3, color: tab === t.id ? "#E8000A" : "rgba(255,255,255,0.28)" }}>
          <div style={{ width:42, height:34, borderRadius:12, background: tab === t.id ? "rgba(232,0,10,0.15)" : "transparent", display:"flex", alignItems:"center", justifyContent:"center", fontSize:19, position:"relative", transition:"all 0.2s" }}>
            {t.icon}
            {t.badge > 0 && (
              <div style={{ position:"absolute", top:1, right:1, width:15, height:15, borderRadius:"50%", background:"#E8000A", color:"#fff", fontSize:8, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", border:"2px solid #0C0C10" }}>
                {t.badge > 9 ? "9+" : t.badge}
              </div>
            )}
          </div>
          <span style={{ fontSize:9.5, fontWeight:700, letterSpacing:"0.04em" }}>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [screen,       setScreen]       = useState("loading");
  const [authUser,     setAuthUser]     = useState(null);
  const [userProfile,  setUserProfile]  = useState(null);
  const [dynamicDish, setDynamicDish]  = useState(null);
  const [step,         setStep]         = useState(0);
  const [tasteTags,    setTasteTags]    = useState([]);
  const [userLoc,      setUserLoc]      = useState(null);
  const [layer,        setLayer]        = useState("categories");
  const [catIdx,       setCatIdx]       = useState(0);
  const [restaurantsRaw,    setRestaurantsRaw]    = useState([]);
  const [restaurantFilter,  setRestaurantFilter]  = useState("smart");
  const [restIdx,      setRestIdx]      = useState(0);
  const [activeCat,    setActiveCat]    = useState(null);
  const [fetching,     setFetching]     = useState(false);
  const [fetchErr,     setFetchErr]     = useState(false);
  const [liked,        setLiked]        = useState([]);
  const [tab,          setTab]          = useState("discover");
  const [dx,           setDx]           = useState(0);
  const [dy,           setDy]           = useState(0);
  const [dragging,     setDragging]     = useState(false);
  const [exiting,      setExiting]      = useState(false);
  const [banner,       setBanner]       = useState(null);
  const [detailTarget, setDetailTarget] = useState(null);
  const [recipeTarget, setRecipeTarget] = useState(null);
  const [swipesUsed,   setSwipesUsed]   = useState(0);
  const [bonusSwipes,  setBonusSwipes]  = useState(0);
  const [isPremium,    setIsPremium]    = useState(false);
  const [showWall,     setShowWall]     = useState(false);
  const [wallMode,     setWallMode]     = useState("limit");
  const [shareToast,   setShareToast]   = useState(false);
  const [showSwipeTutorial, setShowSwipeTutorial] = useState(false);

  const dsRef    = useRef({ x:0, y:0 });
  const velRef   = useRef(0);
  const lxRef    = useRef(0);
  const dyRawRef = useRef(0);
  const dxRawRef = useRef(0);
  const userIdRef = useRef(null);

  const applyUserProfile = useCallback((profile) => {
    if (!profile) return;
    setUserProfile(profile);
    setTasteTags(profile.taste_tags || []);
    setSwipesUsed(profile.swipes_used || 0);
    setIsPremium(profile.is_premium || false);
    setBonusSwipes(profile.bonus_swipes || 0);
    userIdRef.current = profile.id;
  }, []);

  const bootstrapUser = useCallback(async (user) => {
    if (!user) return;
    setAuthUser(user);
    userIdRef.current = user.id;
    const profile = await ensureUserProfile(user);
    applyUserProfile(profile);
    const dish = await computeDynamicDish(user.id);
    setDynamicDish(dish);
    setScreen(profile.onboarding_completed ? "main" : "onboarding");
  }, [applyUserProfile]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setScreen("splash");
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) bootstrapUser(session.user);
      else setScreen("auth");
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (session?.user) {
        setAuthUser(session.user);
        userIdRef.current = session.user.id;
      } else {
        setAuthUser(null);
        setUserProfile(null);
        userIdRef.current = null;
        setScreen("auth");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [bootstrapUser]);

  const handleAuthSuccess = useCallback(async (user) => {
    if (user) await bootstrapUser(user);
  }, [bootstrapUser]);

  const handleOnboardingComplete = useCallback(async () => {
    const userId = userIdRef.current;
    if (userId && isSupabaseConfigured) {
      const profile = await updateUserProfile(userId, {
        taste_tags: tasteTags,
        onboarding_completed: true,
      });
      applyUserProfile(profile);
    }
    setScreen("main");
  }, [tasteTags, applyUserProfile]);

  const refreshLearningDish = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId) return;
    const dish = await computeDynamicDish(userId);
    setDynamicDish(dish);
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setUserLoc({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      () => {},
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }, []);

  useEffect(() => {
    console.log("Unsplash key loaded: " + import.meta.env.VITE_UNSPLASH_ACCESS_KEY);
    notifyDishCardPhotoListeners();
  }, []);

  const orderedDishes = useMemo(() => {
    const base = orderDishesByFlavorProfile(DISHES, tasteTags);
    if (!dynamicDish) return base;
    return [dynamicDish, ...base.filter((d) => d.id !== dynamicDish.id)];
  }, [tasteTags, dynamicDish]);

  useEffect(() => {
    if (layer !== "categories" || !orderedDishes.length) return;

    const startIdx = catIdx;
    const endIdx =
      catIdx === 0
        ? Math.min(4, orderedDishes.length - 1)
        : Math.min(catIdx + 3, orderedDishes.length - 1);

    prefetchDishPhotosForIndices(orderedDishes, startIdx, endIdx);
  }, [catIdx, layer, orderedDishes]);

  useEffect(() => {
    if (screen !== "main" || tab !== "discover") return;
    if (hasSeenSwipeTutorial()) return;
    setShowSwipeTutorial(true);
  }, [screen, tab]);

  const restaurants = useMemo(
    () => applyRestaurantFilter(restaurantsRaw, restaurantFilter),
    [restaurantsRaw, restaurantFilter],
  );

  const totalAllowed = FREE_DAILY_SWIPES + bonusSwipes;
  const swipesLeft   = Math.max(0, totalAllowed - swipesUsed);
  const swipesLow    = swipesLeft <= 3 && swipesLeft > 0 && !isPremium;
  const currentCard  = layer === "categories" ? orderedDishes[catIdx] : restaurants[restIdx];
  const isDone       = layer === "categories" ? catIdx >= orderedDishes.length : restIdx >= restaurants.length;
  const likeAlpha    = Math.min(1, Math.max(0,  dx / 85));
  const nopeAlpha    = Math.min(1, Math.max(0, -dx / 85));

  const handleShare   = useCallback(() => { setBonusSwipes(p => p + BONUS_SHARE_SWIPES); setShowWall(false); setShareToast(true); setTimeout(() => setShareToast(false), 2800); }, []);
  const handleUpgrade = useCallback(() => { setIsPremium(true); setShowWall(false); setBanner("premium"); setTimeout(() => setBanner(null), 3000); }, []);

  const loadRestaurants = useCallback(async (cat) => {
    setFetching(true); setFetchErr(false);
    setActiveCat(cat);
    setLayer("restaurants");
    setRestIdx(0);
    setRestaurantsRaw([]);
    setRestaurantFilter("smart");
    try {
      let lat;
      let lng;
      try {
        const loc = await getCurrentPosition();
        lat = loc.lat;
        lng = loc.lng;
        setUserLoc(loc);
      } catch {
        if (userLoc?.lat != null && userLoc?.lng != null) {
          lat = userLoc.lat;
          lng = userLoc.lng;
        } else {
          setFetchErr(true);
          return;
        }
      }
      const results = await searchRestaurants(lat, lng, cat.term, tasteTags);
      setRestaurantsRaw(results);
    } catch {
      setFetchErr(true);
    } finally {
      setFetching(false);
    }
  }, [userLoc, tasteTags]);

  const goBackToCategories = useCallback(() => {
    if (exiting || layer !== "restaurants") return;
    setExiting(true);
    setDx(0);
    setDy(520);
    setTimeout(() => {
      setLayer("categories");
      setFetchErr(false);
      setFetching(false);
      setDx(0);
      setDy(0);
      setExiting(false);
    }, 420);
  }, [exiting, layer]);

  const swipe = useCallback((dir) => {
    if (exiting) return;
    if (!isPremium && swipesUsed >= totalAllowed) { setWallMode("limit"); setShowWall(true); return; }

    setExiting(true);
    setDx(dir === "right" ? 700 : -700);
    if (!isPremium) {
      setSwipesUsed((p) => p + 1);
      if (userIdRef.current) incrementSwipesUsed(userIdRef.current);
    }

    if (layer === "categories") {
      const cat = orderedDishes[catIdx];
      if (dir === "right") {
        setBanner("searching");
        setTimeout(() => setBanner(null), 1800);
        loadRestaurants(cat);
      } else {
        setBanner("nope");
        setTimeout(() => setBanner(null), 1400);
        setTimeout(() => { setCatIdx(i => i + 1); setDx(0); setDy(0); setExiting(false); }, 420);
        return;
      }
    } else {
      const rest = restaurants[restIdx];
      if (rest && userIdRef.current) {
        recordSwipe(
          userIdRef.current,
          rest,
          dir === "right" ? "like" : "pass",
        );
        if (dir === "right") refreshLearningDish();
      }
      if (dir === "right" && rest) {
        setLiked(p => [...p, { ...rest, category: activeCat }]);
        setBanner("like");
      } else {
        setBanner("nope");
      }
      setTimeout(() => setBanner(null), 1600);
    }

    setTimeout(() => {
      if (layer === "restaurants") {
        const next = restIdx + 1;
        if (next >= restaurants.length) {
          setBanner("back");
          setTimeout(() => setBanner(null), 2000);
          setLayer("categories");
          setCatIdx(i => i + 1);
        } else {
          setRestIdx(next);
        }
      }
      setDx(0); setDy(0); setExiting(false);
    }, 420);
  }, [exiting, isPremium, swipesUsed, totalAllowed, layer, catIdx, restIdx, restaurants, activeCat, loadRestaurants, orderedDishes, refreshLearningDish]);

  const onDown = (e) => {
    if (exiting) return;
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    dsRef.current = { x, y };
    lxRef.current = x;
    velRef.current = 0;
    dyRawRef.current = 0;
    dxRawRef.current = 0;
    setDragging(true);
  };
  const onMove = (e) => {
    if (!dragging) return;
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    const rawDx = x - dsRef.current.x;
    const rawDy = y - dsRef.current.y;
    dxRawRef.current = rawDx;
    dyRawRef.current = rawDy;
    velRef.current = x - lxRef.current;
    lxRef.current = x;
    if (layer === "restaurants" && rawDy > 0 && rawDy > Math.abs(rawDx)) {
      setDx(rawDx * 0.12);
      setDy(rawDy * 0.9);
    } else {
      setDx(rawDx);
      setDy(rawDy * 0.22);
    }
  };
  const onUp = () => {
    if (!dragging) return;
    setDragging(false);
    const rawDy = dyRawRef.current;
    const rawDx = dxRawRef.current;
    if (
      layer === "restaurants" &&
      rawDy > 80 &&
      rawDy > Math.abs(rawDx)
    ) {
      goBackToCategories();
      return;
    }
    if (dx > 80 || velRef.current > 12) swipe("right");
    else if (dx < -80 || velRef.current < -12) swipe("left");
    else { setDx(0); setDy(0); }
  };

  useEffect(() => {
    const h = (e) => {
      if (screen !== "main" || tab !== "discover") return;
      if (e.key === "ArrowRight") swipe("right");
      if (e.key === "ArrowLeft")  swipe("left");
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [screen, tab, swipe]);

  // ── Loading / Auth ─────────────────────────────────────────────────────────
  if (screen === "loading") {
    return (
      <div style={{ background:"#0A0A0A", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <style>{CSS}</style>
        <div style={{ color:"rgba(255,255,255,0.5)", fontSize:14, fontWeight:700 }}>
          <span style={{ display:"inline-block", animation:"spin 1s linear infinite", marginRight:8 }}>⏳</span>
          Loading crave...
        </div>
      </div>
    );
  }

  if (screen === "auth") {
    return (
      <>
        <style>{CSS}</style>
        <AuthScreen onAuthenticated={handleAuthSuccess} />
      </>
    );
  }

  // ── Splash screen ──────────────────────────────────────────────────────────
  if (screen === "splash") {
    return (
      <div style={{ background:"#0A0A0A", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <style>{CSS}</style>
        <div className="phone" style={{ position:"relative" }}>
          <Splash onDone={() => setScreen("onboarding")} />
        </div>
      </div>
    );
  }

  // ── Onboarding ─────────────────────────────────────────────────────────────
  if (screen === "onboarding") {
    return (
      <div style={{ background:"#0A0A0A", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <style>{CSS}</style>
        <Onboard
          step={step} setStep={setStep}
          tasteTags={tasteTags} setTasteTags={setTasteTags}
          onLocationGranted={loc => setUserLoc(loc)}
          onDone={handleOnboardingComplete}
        />
      </div>
    );
  }

  // ── Main app ───────────────────────────────────────────────────────────────
  return (
    <div style={{ background:"#0A0A0A", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <style>{CSS}</style>
      <div className="phone">

        {/* Status bar */}
        <div style={{ display:"flex", justifyContent:"space-between", padding:"14px 24px 0", alignItems:"center" }}>
          <span style={{ color:"#fff", fontSize:12, fontWeight:800 }}>9:41</span>
          <div style={{ display:"flex", gap:5 }}>
            {[14, 14, 22].map((w, i) => (
              <div key={i} style={{ width:w, height:6, background:"rgba(255,255,255,0.55)", borderRadius:3 }} />
            ))}
          </div>
        </div>

        {/* Header */}
        <div style={{ padding:"8px 22px 0", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:28, fontWeight:900, color:"#fff", letterSpacing:"-1px", lineHeight:1 }}>
              crave<span style={{ color:"#E8000A" }}>.</span>
              {isPremium && (
                <span style={{ fontSize:11, background:"linear-gradient(135deg,#FFD700,#FFA500)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", marginLeft:6, fontWeight:900 }}>PRO</span>
              )}
            </div>
            <div style={{ color:"rgba(255,255,255,0.3)", fontSize:11, marginTop:1, fontWeight:600 }}>
              {tab === "discover"
                ? layer === "categories"
                  ? tasteTags.length > 0
                    ? "✨ Curated for your taste"
                    : isPremium ? "♾️ Swipe to discover" : `${swipesLeft} swipes left today`
                  : activeCat ? `${activeCat.emoji} ${activeCat.name} near ${userLoc ? "you" : "DC"}` : "Restaurants near you"
                : tab === "liked"
                ? `${liked.length} saved spots`
                : "Your profile"}
            </div>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {!isPremium && (
              <div onClick={() => { setWallMode("limit"); setShowWall(true); }} style={{ background:"rgba(232,0,10,0.15)", border:"1px solid rgba(232,0,10,0.3)", borderRadius:20, padding:"5px 12px", cursor:"pointer" }}>
                <span style={{ fontSize:11, color:"#FF6060", fontWeight:800 }}>👑 PRO</span>
              </div>
            )}
            <div style={{ width:36, height:36, borderRadius:"50%", background: isPremium ? "linear-gradient(135deg,#FFD700,#FFA500)" : "rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:15 }}>
              👤
            </div>
          </div>
        </div>

        {/* Layer indicator */}
        {tab === "discover" && (
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 22px 0" }}>
            <div style={{ display:"flex", alignItems:"center", gap:5 }}>
              <div style={{ width:20, height:20, borderRadius:"50%", background: layer === "categories" ? "#E8000A" : "rgba(255,255,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:"#fff", flexShrink:0 }}>1</div>
              <span style={{ color: layer === "categories" ? "#fff" : "rgba(255,255,255,0.35)", fontSize:11, fontWeight:700 }}>Pick a Craving</span>
            </div>
            <div style={{ height:1, flex:1, background:"rgba(255,255,255,0.1)", margin:"0 4px" }} />
            <div style={{ display:"flex", alignItems:"center", gap:5 }}>
              <div style={{ width:20, height:20, borderRadius:"50%", background: layer === "restaurants" ? "#E8000A" : "rgba(255,255,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:"#fff", flexShrink:0 }}>2</div>
              <span style={{ color: layer === "restaurants" ? "#fff" : "rgba(255,255,255,0.35)", fontSize:11, fontWeight:700 }}>Find a Restaurant</span>
            </div>
          </div>
        )}

        {/* ── DISCOVER TAB ── */}
        {tab === "discover" && (
          <div className="tabbody">
            {banner === "like"      && <div className="toast toast-r">❤️ Saved to your spots!</div>}
            {banner === "nope"      && <div className="toast toast-d">👋 Next one!</div>}
            {banner === "premium"   && <div className="toast toast-r">👑 Welcome to Premium!</div>}
            {banner === "searching" && <div className="toast toast-r">🔍 Finding spots near you...</div>}
            {banner === "back"      && <div className="toast toast-d">All spots seen! Pick another craving.</div>}
            {shareToast             && <div className="toast toast-r">🎁 +{BONUS_SHARE_SWIPES} bonus swipes!</div>}

            {swipesLow && (
              <div style={{ background:"rgba(232,0,10,0.12)", border:"1px solid rgba(232,0,10,0.25)", borderRadius:12, padding:"8px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8, flexShrink:0 }}>
                <span style={{ color:"rgba(255,255,255,0.7)", fontSize:12, fontWeight:700 }}>⚠️ {swipesLeft} swipe{swipesLeft !== 1 ? "s" : ""} left</span>
                <button onClick={() => { setWallMode("share"); setShowWall(true); }} style={{ background:"none", border:"none", color:"#E8000A", fontSize:12, fontWeight:800, cursor:"pointer" }}>Get More →</button>
              </div>
            )}

            {layer === "restaurants" && !fetching && !fetchErr && restaurantsRaw.length > 0 && (
              <div className="rest-filter-strip">
                {RESTAURANT_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`rest-filter-pill${restaurantFilter === f.id ? " active" : ""}`}
                    onClick={() => {
                      setRestaurantFilter((prev) => (prev === f.id ? "smart" : f.id));
                      setRestIdx(0);
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}

            <div className="cardstack">
              {showSwipeTutorial && !isDone && !fetching && !fetchErr && currentCard && (
                <SwipeTutorial onComplete={() => setShowSwipeTutorial(false)} />
              )}

              {layer === "restaurants" && (
                <button
                  type="button"
                  className="change-craving-pill"
                  onClick={goBackToCategories}
                  disabled={exiting}
                >
                  ← Change Craving
                </button>
              )}

              {/* Ghost stack */}
              {!isDone && !fetching && [2, 1].map(o => {
                if (layer === "categories") {
                  const bg = orderedDishes[catIdx + o];
                  if (!bg) return null;
                  return (
                    <div key={bg.id} style={{ position:"absolute", inset:0, borderRadius:26, overflow:"hidden", transform:`scale(${1 - o * 0.035}) translateY(${o * 13}px)`, zIndex: 10 - o }}>
                      <DishCard dish={bg} dim />
                    </div>
                  );
                } else {
                  const bg = restaurants[restIdx + o];
                  if (!bg || !activeCat) return null;
                  return (
                    <div key={bg.id} style={{ position:"absolute", inset:0, borderRadius:26, overflow:"hidden", transform:`scale(${1 - o * 0.035}) translateY(${o * 13}px)`, zIndex: 10 - o }}>
                      <RestCard restaurant={bg} category={activeCat} dim />
                    </div>
                  );
                }
              })}

              {/* Fetching */}
              {fetching && (
                <div style={{ position:"absolute", inset:0, borderRadius:26, background:"linear-gradient(145deg,#1a1a1a,#222)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, border:"1px solid rgba(255,255,255,0.07)" }}>
                  <div style={{ fontSize:52, animation:"spin 1.2s linear infinite" }}>{activeCat?.emoji || "🔍"}</div>
                  <div style={{ color:"#fff", fontSize:18, fontWeight:800 }}>Finding {activeCat?.name} spots...</div>
                  <div style={{ color:"rgba(255,255,255,0.4)", fontSize:13 }}>{userLoc ? "📍 Near your location" : "Using default location"}</div>
                </div>
              )}

              {/* Fetch error */}
              {fetchErr && !fetching && (
                <div style={{ position:"absolute", inset:0, borderRadius:26, background:"linear-gradient(145deg,#1a1a1a,#222)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14, border:"1px solid rgba(255,255,255,0.07)" }}>
                  <div style={{ fontSize:52 }}>😅</div>
                  <div style={{ color:"#fff", fontSize:18, fontWeight:800 }}>Could not load restaurants</div>
                  <button onClick={() => activeCat && loadRestaurants(activeCat)} className="redbtn" style={{ width:"auto", padding:"12px 28px" }}>Try Again</button>
                  <button onClick={goBackToCategories} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.4)", fontSize:13, cursor:"pointer" }}>← Change Craving</button>
                </div>
              )}

              {/* Main swipe card */}
              {!isDone && !fetching && !fetchErr && currentCard && (
                <div
                  className={`swipecard${exiting ? " leaving" : ""}`}
                  style={{ transform:`translateX(${dx}px) translateY(${dy}px) rotate(${dx * 0.065}deg)`, cursor: dragging ? "grabbing" : "grab", touchAction:"none", zIndex:20 }}
                  onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
                  onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
                >
                  {layer === "categories"
                    ? <DishCard dish={currentCard} />
                    : <RestCard restaurant={currentCard} category={activeCat} />
                  }

                  {showWall && <SwipeWall onShare={handleShare} onUpgrade={handleUpgrade} isShare={wallMode === "share"} />}

                  {/* Stamps */}
                  <div style={{ position:"absolute", top:28, left:20, border:"3px solid #4CAF50", borderRadius:10, padding:"5px 16px", color:"#4CAF50", fontSize:20, fontWeight:900, letterSpacing:3, transform:"rotate(-14deg)", opacity: likeAlpha, zIndex:5 }}>
                    {layer === "categories" ? "CRAVE!" : "YUMMY!"}
                  </div>
                  <div style={{ position:"absolute", top:28, right:20, border:"3px solid #F44336", borderRadius:10, padding:"5px 16px", color:"#F44336", fontSize:20, fontWeight:900, letterSpacing:3, transform:"rotate(14deg)", opacity: nopeAlpha, zIndex:5 }}>
                    NOPE
                  </div>

                  {/* Card info */}
                  <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"20px 20px 22px", zIndex: showWall ? 1 : 5 }}>
                    {layer === "categories" ? (
                      <div>
                        <div style={{ fontSize:26, fontWeight:900, color:"#fff", letterSpacing:"-0.5px", lineHeight:1.1, textShadow: CARD_TEXT_SHADOW }}>
                          {currentCard.isDynamic ? currentCard.name : currentCard.name}
                        </div>
                        <div style={{ color: currentCard.isDynamic ? "#FF6060" : "rgba(255,255,255,0.5)", fontSize:12, marginTop:4, fontWeight:600, textShadow: CARD_TEXT_SHADOW }}>
                          {currentCard.isDynamic ? "Personalized from your likes" : "Swipe right to find restaurants near you"}
                        </div>
                        <div style={{ display:"flex", gap:5, marginTop:10, flexWrap:"wrap" }}>
                          {currentCard.tags.map(t => <span key={t} className="chip">{t}</span>)}
                        </div>
                        <div style={{ marginTop:12, background:"rgba(0,0,0,0.5)", backdropFilter:"blur(16px)", borderRadius:13, padding:"10px 14px", border:"1px solid rgba(255,255,255,0.1)", display:"flex", alignItems:"center", gap:8 }}>
                          <span style={{ fontSize:16 }}>📍</span>
                          <span style={{ color:"rgba(255,255,255,0.75)", fontSize:12.5, fontWeight:700 }}>
                            {userLoc ? "Searching near your location" : "Enable location for real results"}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:22, fontWeight:900, color:"#fff", letterSpacing:"-0.5px", lineHeight:1.1, textShadow: CARD_TEXT_SHADOW }}>{currentCard.name}</div>
                            <div style={{ color:"rgba(255,255,255,0.5)", fontSize:12, marginTop:3, fontWeight:600, textShadow: CARD_TEXT_SHADOW }}>{currentCard.cuisine}</div>
                          </div>
                          <div style={{ background:"rgba(0,0,0,0.6)", backdropFilter:"blur(12px)", borderRadius:14, padding:"8px 10px", textAlign:"center", border:"1px solid rgba(255,255,255,0.1)", flexShrink:0, marginLeft:10 }}>
                            <div style={{ fontSize:14 }}>⭐</div>
                            <div style={{ color:"#fff", fontSize:13, fontWeight:800, marginTop:1 }}>{currentCard.rating}</div>
                            <div style={{ color:"rgba(255,255,255,0.4)", fontSize:10, fontWeight:700 }}>{currentCard.price}</div>
                          </div>
                        </div>
                        <div style={{ marginTop:10, background:"rgba(0,0,0,0.5)", backdropFilter:"blur(16px)", borderRadius:13, padding:"10px 14px", border:"1px solid rgba(255,255,255,0.1)" }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ color:"rgba(255,255,255,0.85)", fontSize:12, fontWeight:700, textShadow: CARD_TEXT_SHADOW }}>{currentCard.name}</div>
                              <div style={{ color:"rgba(255,255,255,0.35)", fontSize:10, marginTop:2 }}>{currentCard.address}</div>
                            </div>
                            <div style={{ background:"rgba(232,0,10,0.2)", border:"1px solid rgba(232,0,10,0.4)", borderRadius:10, padding:"5px 10px", flexShrink:0, marginLeft:8, textAlign:"center" }}>
                              <div style={{ color:"#FF6060", fontSize:13, fontWeight:900 }}>📏 {currentCard.distanceMiles} mi</div>
                              <div style={{ color:"rgba(255,255,255,0.3)", fontSize:9, marginTop:1 }}>from you</div>
                            </div>
                          </div>
                          <button
                            onClick={e => { e.stopPropagation(); setDetailTarget({ restaurant: currentCard, category: activeCat }); }}
                            style={{ width:"100%", marginTop:8, padding:"7px 0", background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:10, color:"rgba(255,255,255,0.7)", fontSize:12, fontWeight:700, cursor:"pointer" }}
                          >
                            Tap for full details, hours and reviews →
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Done */}
              {isDone && !fetching && !fetchErr && (
                <div style={{ position:"absolute", inset:0, borderRadius:26, background:"linear-gradient(145deg,#1a1a1a,#222)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14, border:"1px solid rgba(255,255,255,0.07)" }}>
                  <div style={{ fontSize:64 }}>🍽️</div>
                  <div style={{ fontSize:22, fontWeight:900, color:"#fff" }}>
                    {layer === "restaurants" ? "All spots seen!" : "All categories seen!"}
                  </div>
                  <div style={{ color:"rgba(255,255,255,0.35)", fontSize:13, textAlign:"center", maxWidth:220, lineHeight:1.6 }}>
                    {layer === "restaurants"
                      ? `Every ${activeCat?.name} spot shown. Pick another craving!`
                      : "Check your saved spots or start over."}
                  </div>
                  {layer === "restaurants" && (
                    <button onClick={goBackToCategories} className="redbtn" style={{ width:"auto", padding:"12px 28px", marginTop:4 }}>
                      ← Change Craving
                    </button>
                  )}
                  {layer === "categories" && (
                    <button onClick={() => { setCatIdx(0); setLiked([]); }} className="redbtn" style={{ width:"auto", padding:"12px 28px", marginTop:4 }}>
                      Start Over 🔄
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Action buttons */}
            {!isDone && !fetching && !fetchErr && (
              <div className="discover-actions">
                <button
                  type="button"
                  className="discover-action pass"
                  onClick={() => swipe("left")}
                  disabled={exiting}
                  aria-label="Pass"
                >
                  ✕
                </button>
                <button
                  type="button"
                  className="discover-action save"
                  onClick={() => swipe("right")}
                  disabled={exiting}
                  aria-label="Save"
                >
                  ❤️
                </button>
              </div>
            )}

            {!isDone && !fetching && !fetchErr && !showSwipeTutorial && (
              <div style={{ color:"rgba(255,255,255,0.16)", fontSize:10, textAlign:"center", paddingBottom:6, fontWeight:600, letterSpacing:"0.05em" }}>
                {layer === "categories"
                  ? "← skip · swipe right to find spots →"
                  : "↓ change craving · ← pass · swipe right to save →"}
              </div>
            )}
          </div>
        )}

        {/* ── SAVED TAB ── */}
        {tab === "liked" && (
          <div className="tabbody" style={{ overflowY:"auto" }}>
            {liked.length === 0 ? (
              <div style={{ height:"100%", minHeight:300, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10 }}>
                <div style={{ fontSize:52 }}>💔</div>
                <div style={{ color:"#fff", fontSize:20, fontWeight:800 }}>No saved spots yet</div>
                <div style={{ color:"rgba(255,255,255,0.35)", fontSize:13, textAlign:"center", maxWidth:220, lineHeight:1.6 }}>Swipe right on restaurants you love</div>
              </div>
            ) : (
              <>
                <div style={{ color:"rgba(255,255,255,0.3)", fontSize:12, marginBottom:4, fontWeight:700 }}>
                  {liked.length} spot{liked.length !== 1 ? "s" : ""} saved — tap any card for full details
                </div>
                {liked.map((r, i) => (
                  <LikedCard
                    key={`${r.id}-${i}`}
                    restaurant={r}
                    category={r.category}
                    onClick={() => setDetailTarget({ restaurant: r, category: r.category })}
                  />
                ))}
              </>
            )}
          </div>
        )}

        {/* ── PROFILE TAB ── */}
        {tab === "profile" && (
          <div className="tabbody" style={{ overflowY:"auto" }}>
            <div style={{ textAlign:"center", marginBottom:20 }}>
              <div style={{ width:72, height:72, borderRadius:"50%", background: isPremium ? "linear-gradient(135deg,#FFD700,#FFA500)" : "linear-gradient(135deg,#E8000A,#FF3322)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:28, margin:"0 auto 10px", boxShadow: isPremium ? "0 6px 24px rgba(255,215,0,0.4)" : "none" }}>
                {isPremium ? "👑" : "👤"}
              </div>
              <div style={{ color:"#fff", fontWeight:800, fontSize:18 }}>{isPremium ? "Premium Member" : "Food Explorer"}</div>
              <div style={{ color:"rgba(255,255,255,0.35)", fontSize:12, marginTop:3 }}>{authUser?.email || userProfile?.email || (isPremium ? "Unlimited · AI Recipes · 1-tap ordering" : "Free plan")}</div>
            </div>

            {isSupabaseConfigured && authUser && (
              <button
                onClick={async () => { await signOutUser(); setLiked([]); setDynamicDish(null); }}
                className="ghostbtn"
                style={{ marginBottom:14 }}
              >
                Sign Out
              </button>
            )}

            {!isPremium && (
              <div style={{ background:"rgba(255,255,255,0.05)", borderRadius:14, padding:16, marginBottom:14, border:"1px solid rgba(255,255,255,0.07)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                  <span style={{ color:"rgba(255,255,255,0.7)", fontSize:13, fontWeight:700 }}>Daily Swipes</span>
                  <span style={{ color:"#fff", fontSize:13, fontWeight:800 }}>{swipesUsed} / {totalAllowed}</span>
                </div>
                <div style={{ height:6, background:"rgba(255,255,255,0.1)", borderRadius:3, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${Math.min(100, Math.round(swipesUsed / totalAllowed * 100))}%`, background: swipesUsed / totalAllowed > 0.8 ? "linear-gradient(90deg,#E8000A,#FF3322)" : "linear-gradient(90deg,#4CAF50,#66BB6A)", borderRadius:3, transition:"width 0.5s" }} />
                </div>
                <div style={{ display:"flex", gap:8, marginTop:12 }}>
                  <button onClick={handleShare} style={{ flex:1, padding:"9px 0", background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:10, color:"rgba(255,255,255,0.7)", fontSize:12, fontWeight:700, cursor:"pointer" }}>📲 Share +10</button>
                  <button onClick={handleUpgrade} style={{ flex:1, padding:"9px 0", background:"linear-gradient(135deg,#E8000A,#FF3322)", border:"none", borderRadius:10, color:"#fff", fontSize:12, fontWeight:800, cursor:"pointer" }}>👑 Go Premium</button>
                </div>
              </div>
            )}

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:16 }}>
              {[
                { l:"Saved",    v: liked.length, i:"❤️" },
                { l:"Swipes",   v: swipesUsed,   i:"⚡" },
                { l:"Cravings", v: new Set(liked.map(r => r.category?.id)).size, i:"🎯" },
              ].map(s => (
                <div key={s.l} style={{ background:"rgba(255,255,255,0.05)", borderRadius:14, padding:"14px 10px", textAlign:"center", border:"1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize:20 }}>{s.i}</div>
                  <div style={{ color:"#fff", fontWeight:900, fontSize:22, marginTop:4 }}>{s.v}</div>
                  <div style={{ color:"rgba(255,255,255,0.35)", fontSize:10, marginTop:2 }}>{s.l}</div>
                </div>
              ))}
            </div>

            {/* Location status */}
            <div style={{ background:"rgba(255,255,255,0.04)", borderRadius:14, padding:14, marginBottom:14, border:"1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ fontSize:20 }}>{userLoc ? "📍" : "🔒"}</div>
                <div>
                  <div style={{ color:"#fff", fontSize:13, fontWeight:700 }}>{userLoc ? "Location Active" : "Location Not Set"}</div>
                  <div style={{ color:"rgba(255,255,255,0.4)", fontSize:11, marginTop:2 }}>
                    {userLoc ? `${userLoc.lat.toFixed(4)}, ${userLoc.lng.toFixed(4)} · Real distances active` : "Using DC as default"}
                  </div>
                </div>
              </div>
            </div>

            {tasteTags.length > 0 && (
              <div style={{ marginBottom:14 }}>
                <div style={{ color:"rgba(255,255,255,0.35)", fontSize:11, fontWeight:700, letterSpacing:1, marginBottom:8 }}>FLAVOR PROFILE</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
                  {tasteTags.map(t => <span key={t} className="chip" style={{ background:"rgba(232,0,10,0.18)", borderColor:"rgba(232,0,10,0.3)", color:"#FF6060" }}>{t}</span>)}
                </div>
              </div>
            )}

            <div style={{ background:"rgba(255,255,255,0.04)", borderRadius:14, overflow:"hidden", border:"1px solid rgba(255,255,255,0.05)" }}>
              {["🔔 Notifications","📍 Location Settings","💌 Share Crave","⚙️ Settings"].map((item, i, a) => (
                <div key={item} style={{ padding:"14px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom: i < a.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", cursor:"pointer" }}>
                  <span style={{ color:"rgba(255,255,255,0.7)", fontSize:13, fontWeight:600 }}>{item}</span>
                  <span style={{ color:"rgba(255,255,255,0.2)", fontSize:18 }}>›</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <BottomNav tab={tab} setTab={setTab} count={liked.length} />
      </div>

      {/* ── DETAIL MODAL ── */}
      {detailTarget && (
        <DetailModal
          restaurant={detailTarget.restaurant}
          category={detailTarget.category}
          isPremium={isPremium}
          onClose={() => setDetailTarget(null)}
          onRecipe={target => { setDetailTarget(null); setRecipeTarget(target); }}
        />
      )}

      {/* ── RECIPE MODAL ── */}
      {recipeTarget && (
        <RecipeModal
          name={recipeTarget.name}
          cuisine={recipeTarget.cuisine}
          emoji={recipeTarget.emoji}
          g1={recipeTarget.g1}
          g3={recipeTarget.g3}
          onClose={() => setRecipeTarget(null)}
        />
      )}
    </div>
  );
}
