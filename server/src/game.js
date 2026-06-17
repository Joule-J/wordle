import { isRealWord, isValidGuess, pickWord } from "./words.js";

export const MATCH_ROUNDS = 5;
const AUTO_ADVANCE_DELAY_MS = 1200;

export async function createRoom(roomId, creator = null) {
  const room = {
    roomId,
    createdAt: Date.now(),
    players: [],
    messages: [],
    lastOutcome: null,
    match: createMatchState(),
    round: await createRound(1)
  };

  if (creator?.playerId && creator?.name) {
    const joinResult = joinRoom(room, creator.playerId, creator.name);
    if (!joinResult.ok) {
      throw new Error(joinResult.error);
    }
  }

  return room;
}

function createMatchState() {
  return {
    startedAt: Date.now(),
    finishedAt: null,
    roundsCompleted: 0,
    currentRoundNumber: 1,
    totalRounds: MATCH_ROUNDS,
    results: [],
    playAgainReady: {}
  };
}

async function createRound(roundNumber) {
  return {
    roundNumber,
    totalRounds: MATCH_ROUNDS,
    target: await pickWord(),
    startedAt: Date.now(),
    finishedAt: null,
    winner: null,
    attempts: [],
    draft: "",
    attemptsByPlayer: {},
    draftsByPlayer: {},
    revealed: false
  };
}

export async function resetMatch(room) {
  room.match = createMatchState();
  room.lastOutcome = null;
  room.round = await createRound(1);
}

export async function startNextRound(room) {
  if (room.match.finishedAt) {
    return { ok: false, error: "match_finished" };
  }
  if (!room.round.finishedAt) {
    return { ok: false, error: "round_active" };
  }
  const nextRoundNumber = room.match.roundsCompleted + 1;
  room.match.currentRoundNumber = nextRoundNumber;
  room.round = await createRound(nextRoundNumber);
  return { ok: true };
}

function finishRound(room, playerId, didWin) {
  const attemptsUsed = room.round.attempts?.length ?? 0;

  room.round.finishedAt = Date.now();
  room.round.revealed = true;
  room.round.winner = didWin ? playerId : null;
  room.match.roundsCompleted += 1;
  room.match.playAgainReady = {};
  room.match.results = [
    ...(room.match.results ?? []),
    {
      roundNumber: room.round.roundNumber,
      target: room.round.target,
      solved: didWin,
      attemptsUsed,
      winner: didWin ? playerId : null,
      finishedAt: room.round.finishedAt
    }
  ].slice(-MATCH_ROUNDS);

  room.lastOutcome = {
    type: didWin ? "won" : "lost",
    target: room.round.target,
    winner: didWin ? playerId : null,
    roundNumber: room.round.roundNumber,
    at: Date.now()
  };

  if (room.match.roundsCompleted >= MATCH_ROUNDS) {
    room.match.currentRoundNumber = MATCH_ROUNDS;
    room.match.finishedAt = Date.now();
    return { roundEnded: true, matchEnded: true };
  }

  room.match.currentRoundNumber = room.match.roundsCompleted + 1;
  return { roundEnded: true, matchEnded: false };
}

export function roomSnapshot(room) {
  return {
    roomId: room.roomId,
    createdAt: room.createdAt,
    players: room.players,
    messages: room.messages.slice(-50),
    lastOutcome: room.lastOutcome,
    match: {
      startedAt: room.match.startedAt,
      finishedAt: room.match.finishedAt,
      roundsCompleted: room.match.roundsCompleted,
      currentRoundNumber: room.match.currentRoundNumber,
      totalRounds: room.match.totalRounds,
      results: room.match.results ?? [],
      playAgainReady: room.match.playAgainReady ?? {}
    },
    round: {
      roundNumber: room.round.roundNumber,
      totalRounds: room.round.totalRounds,
      startedAt: room.round.startedAt,
      finishedAt: room.round.finishedAt,
      winner: room.round.winner,
      revealed: room.round.revealed,
      target: room.round.revealed ? room.round.target : null,
      attempts: room.round.attempts,
      draft: room.round.draft,
      attemptsByPlayer: room.round.attemptsByPlayer,
      draftsByPlayer: room.round.draftsByPlayer
    }
  };
}

export function joinRoom(room, playerId, name) {
  const existing = room.players.find((p) => p.id === playerId);
  if (existing) {
    existing.name = name;
    return { ok: true, player: existing, created: false };
  }

  if (room.players.length >= 2) {
    return { ok: false, error: "room_full" };
  }

  const player = { id: playerId, name, joinedAt: Date.now() };
  room.players = room.players.concat(player);
  return { ok: true, player, created: true };
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
  const attempts = room.round.attempts ?? [];
  if (attempts.length >= 6) {
    return { ok: false, error: "attempt_limit" };
  }

  const result = evaluateGuess(guessWord, room.round.target);
  const entry = {
    guess: guessWord,
    result,
    at: Date.now()
  };
  room.round.attempts = [...attempts, entry];
  room.round.draft = "";
  for (const player of room.players) {
    room.round.attemptsByPlayer[player.id] = room.round.attempts;
    room.round.draftsByPlayer[player.id] = "";
  }

  if (guessWord === room.round.target) {
    const progress = finishRound(room, playerId, true);
    return { ok: true, entry, ...progress, won: true };
  }

  if (attempts.length + 1 >= 6) {
    const progress = finishRound(room, playerId, false);
    return { ok: true, entry, ...progress, won: false, limitReached: true };
  }

  return { ok: true, entry, roundEnded: false, won: false };
}

export async function nextRound(room) {
  if (room.match.finishedAt) {
    return { ok: false, error: "match_finished" };
  }
  if (!room.round.finishedAt) {
    return { ok: false, error: "round_active" };
  }

  room.lastOutcome = null;
  const nextRoundNumber = room.match.currentRoundNumber;
  room.round = await createRound(nextRoundNumber);
  return { ok: true };
}

export async function playAgain(room, playerId) {
  if (!room.match.finishedAt) {
    return { ok: false, error: "match_active" };
  }

  room.match.playAgainReady = {
    ...(room.match.playAgainReady ?? {}),
    [playerId]: Date.now()
  };

  const requiredPlayerIds = room.players.map((player) => player.id);
  const allReady =
    requiredPlayerIds.length > 0 &&
    requiredPlayerIds.every((requiredPlayerId) => room.match.playAgainReady?.[requiredPlayerId]);

  if (!allReady) {
    return { ok: true, waiting: true };
  }

  await resetMatch(room);
  return { ok: true, restarted: true };
}

export function setPlayerDraft(room, playerId, value) {
  if (!room?.round || room.round.finishedAt) {
    return false;
  }

  const draft = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .slice(0, 5);

  room.round.draft = draft;
  for (const player of room.players) {
    room.round.draftsByPlayer[player.id] = draft;
  }
  return true;
}

export function scheduleNextRound(room, broadcast) {
  setTimeout(async () => {
    if (!room || room.match.finishedAt || !room.round.finishedAt) {
      return;
    }
    await nextRound(room);
    broadcast();
  }, AUTO_ADVANCE_DELAY_MS);
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
