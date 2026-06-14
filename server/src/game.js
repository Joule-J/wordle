import { isRealWord, isValidGuess, pickWord } from "./words.js";

export async function createRoom(roomId) {
  return {
    roomId,
    players: [],
    messages: [],
    lastOutcome: null,
    round: await createRound()
  };
}

async function createRound() {
  return {
    target: await pickWord(),
    startedAt: Date.now(),
    finishedAt: null,
    winner: null,
    attemptsByPlayer: {},
    revealed: false
  };
}

export function roomSnapshot(room) {
  return {
    roomId: room.roomId,
    players: room.players,
    messages: room.messages.slice(-50),
    lastOutcome: room.lastOutcome,
    round: {
      startedAt: room.round.startedAt,
      finishedAt: room.round.finishedAt,
      winner: room.round.winner,
      revealed: room.round.revealed,
      target: room.round.revealed ? room.round.target : null,
      attemptsByPlayer: room.round.attemptsByPlayer
    }
  };
}

export function joinRoom(room, playerId, name) {
  const existing = room.players.find((p) => p.id === playerId);
  if (existing) {
    existing.name = name;
    return existing;
  }
  const player = { id: playerId, name, joinedAt: Date.now() };
  room.players = room.players.filter((p) => p.id !== playerId).concat(player).slice(0, 2);
  return player;
}

export async function guess(room, playerId, value) {
  if (!isValidGuess(value)) {
    return { ok: false, error: "guess_must_be_5_letters" };
  }
  if (!(await isRealWord(value))) {
    return { ok: false, error: "not_a_real_word" };
  }
  if (room.round.finishedAt) {
    return { ok: false, error: "round_finished" };
  }
  const guessWord = value.toLowerCase();
  const playerGuesses = room.round.attemptsByPlayer[playerId] ?? [];
  if (playerGuesses.length >= 6) {
    return { ok: false, error: "attempt_limit" };
  }

  const result = evaluateGuess(guessWord, room.round.target);
  const entry = {
    guess: guessWord,
    result,
    at: Date.now()
  };
  room.round.attemptsByPlayer[playerId] = [...playerGuesses, entry];

  if (guessWord === room.round.target) {
    room.round.finishedAt = Date.now();
    room.round.winner = playerId;
    room.round.revealed = true;
    room.lastOutcome = { type: "won", target: room.round.target, winner: playerId, at: Date.now() };
    return { ok: true, entry, roundEnded: true, won: true };
  }

  const allAttempts = Object.values(room.round.attemptsByPlayer).flat();
  if (allAttempts.length >= 12) {
    room.round.finishedAt = Date.now();
    room.round.revealed = true;
    room.lastOutcome = { type: "lost", target: room.round.target, winner: null, at: Date.now() };
    return { ok: true, entry, roundEnded: true, won: false };
  }

  return { ok: true, entry, roundEnded: false, won: false };
}

export function nextRound(room) {
  return createRound().then((round) => {
    room.round = round;
    room.lastOutcome = null;
  });
}

export function addMessage(room, playerId, name, text) {
  const clean = String(text ?? "").trim().slice(0, 240);
  if (!clean) {
    return null;
  }
  const message = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    playerId,
    name,
    text: clean,
    at: Date.now(),
    replyTo: null,
    reactions: {}
  };
  room.messages.push(message);
  room.messages = room.messages.slice(-50);
  return message;
}

export function replyToMessage(room, messageId, playerId, name, text) {
  const source = room.messages.find((message) => message.id === messageId);
  const clean = String(text ?? "").trim().slice(0, 240);
  if (!source || !clean) {
    return null;
  }
  const message = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    playerId,
    name,
    text: clean,
    at: Date.now(),
    replyTo: {
      id: source.id,
      text: source.text,
      name: source.name
    },
    reactions: {}
  };
  room.messages.push(message);
  room.messages = room.messages.slice(-50);
  return message;
}

export function toggleReaction(room, messageId, playerId, emoji) {
  const message = room.messages.find((item) => item.id === messageId);
  if (!message) return null;
  const next = new Map(Object.entries(message.reactions || {}));
  const existing = next.get(playerId);
  if (existing === emoji) {
    next.delete(playerId);
  } else {
    next.set(playerId, emoji);
  }
  message.reactions = Object.fromEntries(next.entries());
  return message;
}

export function evaluateGuess(guessWord, target) {
  const targetChars = target.split("");
  const result = Array(5).fill("absent");
  const counts = {};

  for (const char of targetChars) {
    counts[char] = (counts[char] ?? 0) + 1;
  }
  for (let i = 0; i < 5; i += 1) {
    if (guessWord[i] === target[i]) {
      result[i] = "correct";
      counts[guessWord[i]] -= 1;
    }
  }
  for (let i = 0; i < 5; i += 1) {
    if (result[i] === "correct") continue;
    const char = guessWord[i];
    if ((counts[char] ?? 0) > 0) {
      result[i] = "present";
      counts[char] -= 1;
    }
  }
  return result;
}
