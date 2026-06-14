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
let cachedApiWords = [];
let cachedAt = 0;

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
