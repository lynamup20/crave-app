import { supabase, isSupabaseConfigured } from "../lib/supabase.js";

const CUISINE_EMOJI = {
  ramen: "??",
  japanese: "??",
  sushi: "??",
  mexican: "??",
  tacos: "??",
  american: "??",
  burgers: "??",
  pizza: "??",
  bbq: "??",
  thai: "??",
  indian: "??",
  italian: "??",
  chinese: "??",
  korean: "??",
  seafood: "??",
  steak: "??",
  vegan: "??",
  vegetarian: "??",
  dessert: "??",
  cafe: "?",
  bakery: "??",
};

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function cuisineEmoji(cuisine) {
  if (!cuisine) return "???";
  const normalized = cuisine.toLowerCase().replace(/_/g, " ");
  for (const [key, emoji] of Object.entries(CUISINE_EMOJI)) {
    if (normalized.includes(key)) return emoji;
  }
  return "???";
}

function cuisineSearchTerm(cuisine) {
  return (cuisine || "restaurant").toLowerCase().replace(/_/g, " ").trim();
}

export function recipeCacheKey(name, cuisine) {
  return `${name}|${cuisine}`.toLowerCase().trim();
}

export function restaurantCacheKey(term, lat, lng) {
  return `${term}|${Number(lat).toFixed(2)}|${Number(lng).toFixed(2)}`;
}

export async function signUpWithEmail(email, password) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  if (data.user) await ensureUserProfile(data.user);
  return data;
}

export async function signInWithEmail(email, password) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (data.user) await ensureUserProfile(data.user);
  return data;
}

export async function signOutUser() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getCurrentSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function ensureUserProfile(authUser) {
  if (!supabase || !authUser) return null;

  const { data: existing, error: fetchError } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (existing) return resetDailySwipesIfNeeded(existing);

  const row = {
    id: authUser.id,
    email: authUser.email || "",
    taste_tags: [],
    swipes_used: 0,
    swipes_reset_date: todayDateString(),
    onboarding_completed: false,
    is_premium: false,
    bonus_swipes: 0,
  };

  const { data: created, error: insertError } = await supabase
    .from("users")
    .insert(row)
    .select("*")
    .single();

  if (insertError) throw insertError;
  return created;
}

export async function resetDailySwipesIfNeeded(profile) {
  if (!supabase || !profile) return profile;

  const today = todayDateString();
  if (profile.swipes_reset_date === today) return profile;

  const { data, error } = await supabase
    .from("users")
    .update({ swipes_used: 0, swipes_reset_date: today })
    .eq("id", profile.id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function fetchUserProfile(userId) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? resetDailySwipesIfNeeded(data) : null;
}

export async function updateUserProfile(userId, patch) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from("users")
    .update(patch)
    .eq("id", userId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function incrementSwipesUsed(userId) {
  if (!supabase || !userId) return;
  const profile = await fetchUserProfile(userId);
  if (!profile) return;
  await supabase
    .from("users")
    .update({ swipes_used: (profile.swipes_used || 0) + 1 })
    .eq("id", userId);
}

export async function recordSwipe(userId, restaurant, action) {
  if (!supabase || !userId || !restaurant) return;
  await supabase.from("swipe_history").insert({
    user_id: userId,
    restaurant_id: String(restaurant.placeId || restaurant.id),
    restaurant_name: restaurant.name,
    cuisine_type: restaurant.cuisine || "Restaurant",
    action,
  });
}

const BLOCKED_CUISINES = new Set([
  "restaurant",
  "food",
  "establishment",
  "point of interest",
  "store",
  "bar",
  "cafe",
  "meal takeaway",
  "meal delivery",
  "lodging",
  "finance",
  "health",
]);

function isValidLearningCuisine(cuisine) {
  if (!cuisine || typeof cuisine !== "string") return false;
  const normalized = cuisine.trim();
  if (normalized.length < 4) return false;
  return !BLOCKED_CUISINES.has(normalized.toLowerCase());
}

export async function computeDynamicDish(userId) {
  if (!supabase || !userId) return null;

  const { data, error } = await supabase
    .from("swipe_history")
    .select("cuisine_type, action")
    .eq("user_id", userId)
    .eq("action", "like");

  if (error) {
    console.warn("Learning engine query failed:", error.message);
    return null;
  }

  const likes = data || [];
  const counts = {};

  for (const row of likes) {
    const cuisine = row.cuisine_type;
    if (!isValidLearningCuisine(cuisine)) continue;
    counts[cuisine] = (counts[cuisine] || 0) + 1;
  }

  const top = Object.entries(counts)
    .filter(([, count]) => count >= 5)
    .sort((a, b) => b[1] - a[1])[0];

  if (!top) return null;

  const [cuisine] = top;
  const emoji = cuisineEmoji(cuisine);
  const term = cuisineSearchTerm(cuisine);

  return {
    id: `dynamic-${term.replace(/\s+/g, "-")}`,
    name: `Because You Love ${cuisine}`,
    emoji,
    term,
    tags: ["Personalized", "For You"],
    isDynamic: true,
    image: "",
    g1: "#1a0500",
    g2: "#5c1200",
    g3: "#a02800",
    glow: "rgba(160,40,0,0.6)",
  };
}

export async function getCachedRecipe(dishKey) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("recipe_cache")
    .select("recipe")
    .eq("dish_key", dishKey)
    .maybeSingle();
  if (error) {
    console.warn("Recipe cache read failed:", error.message);
    return null;
  }
  return data?.recipe || null;
}

export async function saveCachedRecipe(dishKey, recipe) {
  if (!supabase) return;
  const { error } = await supabase.from("recipe_cache").upsert({
    dish_key: dishKey,
    recipe,
    created_at: new Date().toISOString(),
  });
  if (error) console.warn("Recipe cache write failed:", error.message);
}

export async function fetchRecipeWithCache(name, cuisine) {
  const dishKey = recipeCacheKey(name, cuisine);
  const cached = await getCachedRecipe(dishKey);
  if (cached) return cached;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: `You are a professional chef. Generate a home recipe for "${name}" (${cuisine} cuisine). Return ONLY valid JSON, no markdown: {"servings":2,"prepTime":"15 min","cookTime":"30 min","difficulty":"Medium","chefTip":"One sentence tip","ingredients":[{"amount":"2","unit":"cups","item":"ingredient"}],"steps":[{"title":"Step","instruction":"Instruction."}]} 8-10 ingredients, 5-6 steps.`,
      }],
    }),
  });

  if (!res.ok) throw new Error(`Recipe API HTTP ${res.status}`);
  const data = await res.json();
  const text = data.content?.find((b) => b.type === "text")?.text || "";
  const recipe = JSON.parse(text.replace(/```json|```/g, "").trim());
  await saveCachedRecipe(dishKey, recipe);
  return recipe;
}

export async function getCachedRestaurants(cacheKey) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("restaurant_cache")
    .select("results, cached_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (error) {
    console.warn("Restaurant cache read failed:", error.message);
    return null;
  }
  if (!data?.cached_at) return null;

  const ageMs = Date.now() - new Date(data.cached_at).getTime();
  if (ageMs > 24 * 60 * 60 * 1000) return null;
  return data.results || null;
}

export async function saveCachedRestaurants(cacheKey, results) {
  if (!supabase) return;
  const { error } = await supabase.from("restaurant_cache").upsert({
    cache_key: cacheKey,
    results,
    cached_at: new Date().toISOString(),
  });
  if (error) console.warn("Restaurant cache write failed:", error.message);
}

export { isSupabaseConfigured };
