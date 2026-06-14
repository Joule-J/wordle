export const WORDS = [
  "apple",
  "brain",
  "chair",
  "dream",
  "eagle",
  "flame",
  "globe",
  "honey",
  "light",
  "money",
  "ocean",
  "plant",
  "queen",
  "river",
  "stone",
  "table",
  "trust",
  "valid",
  "water",
  "youth"
];

const DATAMUSE_URL = "https://api.datamuse.com/words?sp=?????&max=1000";
const DATAMUSE_VALIDATE_URL = (word) => `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&max=1`;
let cachedApiWords = [];
let cachedAt = 0;
const validWordCache = new Map();

export async function pickWord() {
  const apiWords = await loadWordsFromApi();
  const pool = apiWords.length > 0 ? apiWords : WORDS;
  return pool[Math.floor(Math.random() * pool.length)];
}

async function loadWordsFromApi() {
  const now = Date.now();
  if (cachedApiWords.length > 0 && now - cachedAt < 1000 * 60 * 30) {
    return cachedApiWords;
  }

  try {
    const response = await fetch(DATAMUSE_URL);
    if (!response.ok) {
      return [];
    }
    const data = await response.json();
    const words = data
      .map((item) => item.word)
      .filter((word) => typeof word === "string" && /^[a-z]{5}$/.test(word.toLowerCase()));
    cachedApiWords = [...new Set(words)];
    cachedAt = now;
    return cachedApiWords;
  } catch {
    return [];
  }
}

export function isValidGuess(word) {
  return typeof word === "string" && /^[a-z]{5}$/.test(word.toLowerCase());
}

export async function isRealWord(word) {
  const normalized = String(word ?? "").toLowerCase();
  if (!/^[a-z]{5}$/.test(normalized)) {
    return false;
  }
  if (validWordCache.has(normalized)) {
    return validWordCache.get(normalized);
  }
  try {
    const response = await fetch(DATAMUSE_VALIDATE_URL(normalized));
    if (!response.ok) {
      validWordCache.set(normalized, false);
      return false;
    }
    const data = await response.json();
    const ok = Array.isArray(data) && data.some((item) => item?.word === normalized);
    validWordCache.set(normalized, ok);
    return ok;
  } catch {
    validWordCache.set(normalized, false);
    return false;
  }
}
