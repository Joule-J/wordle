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

export function pickWord() {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

export function isValidGuess(word) {
  return typeof word === "string" && /^[a-z]{5}$/.test(word.toLowerCase());
}
