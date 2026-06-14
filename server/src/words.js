import { getPrismaClient } from "./db.js";

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

const DATAMUSE_VALIDATE_URL = (word) => `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&max=1`;
const validWordCache = new Map();
let wordPickQueue = Promise.resolve();

export async function pickWord() {
  const run = async () => {
    const pool = await getUnusedWordPool();
    const word = pool[Math.floor(Math.random() * pool.length)];
    if (!word) {
      throw new Error("No words available");
    }
    try {
      const prisma = await getPrismaClient();
      if (prisma) {
        await prisma.usedWord.upsert({
          where: { word },
          create: { word },
          update: { pickedAt: new Date() }
        });
      }
    } catch {
      // Keep the game playable if the database write fails.
    }

    return word;
  };

  const next = wordPickQueue.then(run, run);
  wordPickQueue = next.catch(() => {});
  return next;
}

async function getUnusedWordPool() {
  const prisma = await getPrismaClient();
  if (!prisma) {
    return WORDS;
  }

  try {
    const usedWords = await prisma.usedWord.findMany({
      select: { word: true }
    });
    const usedSet = new Set(usedWords.map((entry) => entry.word));
    const remaining = WORDS.filter((word) => !usedSet.has(word));
    if (remaining.length > 0) {
      return remaining;
    }

    await prisma.usedWord.deleteMany();
    return WORDS;
  } catch {
    return WORDS;
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
