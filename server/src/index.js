import "./env.js";
import express from "express";
import http from "http";
import cors from "cors";
import { WebSocketServer } from "ws";
import {
  addMessage,
  createRoom,
  guess,
  joinRoom,
  nextRound,
  playAgain,
  replyToMessage,
  roomSnapshot,
  scheduleNextRound,
  setPlayerDraft,
  toggleReaction
} from "./game.js";

const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const app = express();

function normalizeOrigin(origin) {
  const value = String(origin ?? "").trim();
  if (!value) return null;
  if (value === "*") return "*";
  if (value.includes("://")) return value;
  return `https://${value}`;
}

function parseAllowedOrigins(value) {
  const normalized = String(value ?? "")
    .split(",")
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);

  if (normalized.includes("*")) {
    return "*";
  }

  return normalized.length > 0 ? normalized : "*";
}

function isAllowedOrigin(origin, allowedOrigins) {
  if (!origin) return true;
  if (allowedOrigins === "*") return true;
  if (allowedOrigins.includes(origin)) return true;

  const isVercelPreview = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
  if (isVercelPreview) {
    return true;
  }

  return false;
}

const allowedOrigins = parseAllowedOrigins(CLIENT_ORIGIN);

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin, allowedOrigins)) {
        callback(null, true);
        return;
      }

      callback(new Error("origin_not_allowed"));
    }
  })
);
app.use(express.json());

const rooms = new Map();

function normalizeRoomCode(value) {
  return String(value ?? "").trim().toUpperCase();
}

function generateRoomCode() {
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

async function createUniqueRoomId() {
  let roomId = generateRoomCode();
  while (rooms.has(roomId)) {
    roomId = generateRoomCode();
  }
  return roomId;
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/api/rooms", async (req, res) => {
  const name = String(req.body?.name ?? "").trim().slice(0, 24);
  const playerId = String(req.body?.playerId ?? "").trim() || `p-${Math.random().toString(16).slice(2)}`;
  if (!name) {
    res.status(400).json({ error: "name_required" });
    return;
  }

  const roomId = await createUniqueRoomId();
  const room = await createRoom(roomId, { playerId, name });
  rooms.set(roomId, room);
  res.status(201).json(roomSnapshot(room));
});

app.get("/api/rooms/:roomId", (req, res) => {
  const roomId = normalizeRoomCode(req.params.roomId);
  const room = rooms.get(roomId);
  if (!room) {
    res.status(404).json({ error: "room_not_found" });
    return;
  }
  res.json(roomSnapshot(room));
});

app.get("/api/room/:roomId", (req, res) => {
  const roomId = normalizeRoomCode(req.params.roomId);
  const room = rooms.get(roomId);
  if (!room) {
    res.status(404).json({ error: "room_not_found" });
    return;
  }
  res.json(roomSnapshot(room));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

function broadcast(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const payload = JSON.stringify({
    type: "state",
    state: roomSnapshot(room)
  });
  for (const client of wss.clients) {
    if (client.readyState === 1 && client.roomId === roomId) {
      client.send(payload);
    }
  }
}

wss.on("connection", async (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const roomId = normalizeRoomCode(url.searchParams.get("roomId"));
  const playerId = url.searchParams.get("playerId") || `p-${Math.random().toString(16).slice(2)}`;
  const name = url.searchParams.get("name") || "Player";
  ws.roomId = roomId;
  ws.playerId = playerId;

  const room = rooms.get(roomId);
  if (!room) {
    ws.send(JSON.stringify({ type: "error", error: "room_not_found" }));
    ws.close();
    return;
  }

  const joinResult = joinRoom(room, playerId, name);
  if (!joinResult.ok) {
    ws.send(JSON.stringify({ type: "error", error: joinResult.error }));
    ws.close();
    return;
  }

  broadcast(roomId);

  ws.send(JSON.stringify({ type: "state", state: roomSnapshot(room), you: { playerId, name } }));

  ws.on("message", async (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const currentRoom = rooms.get(roomId);
    if (!currentRoom) {
      ws.send(JSON.stringify({ type: "error", error: "room_not_found" }));
      return;
    }

    if (data.type === "join_room" || data.type === "join") {
      const join = joinRoom(currentRoom, playerId, data.name || name);
      if (!join.ok) {
        ws.send(JSON.stringify({ type: "join_result", ok: false, error: join.error }));
        return;
      }
      ws.send(JSON.stringify({ type: "join_result", ok: true }));
      broadcast(roomId);
      return;
    }

    if (data.type === "guess") {
      const result = await guess(currentRoom, playerId, data.value);
      if (result.ok) {
        if (result.roundEnded) {
          if (!result.matchEnded) {
            scheduleNextRound(currentRoom, () => broadcast(roomId));
          }
        }
        broadcast(roomId);
      }
      ws.send(JSON.stringify({ type: "guess_result", ...result }));
      return;
    }

    if (data.type === "guess_draft") {
      if (setPlayerDraft(currentRoom, playerId, data.value)) {
        broadcast(roomId);
      }
      return;
    }

    if (data.type === "chat") {
      const message = data.replyTo
        ? replyToMessage(currentRoom, data.replyTo, playerId, data.name || name, data.text)
        : addMessage(currentRoom, playerId, data.name || name, data.text);
      if (message) {
        broadcast(roomId);
      }
      return;
    }

    if (data.type === "reaction") {
      const message = toggleReaction(currentRoom, data.messageId, playerId, data.emoji);
      if (message) {
        broadcast(roomId);
      }
      return;
    }

    if (data.type === "next_round") {
      const result = await nextRound(currentRoom);
      if (result.ok) {
        broadcast(roomId);
      } else {
        ws.send(JSON.stringify({ type: "next_round_result", ...result }));
      }
      return;
    }

    if (data.type === "play_again") {
      const result = await playAgain(currentRoom);
      if (result.ok) {
        broadcast(roomId);
        ws.send(JSON.stringify({ type: "play_again_result", ok: true }));
      } else {
        ws.send(JSON.stringify({ type: "play_again_result", ...result }));
      }
    }
  });

  ws.on("close", () => {
    const currentRoom = rooms.get(roomId);
    if (!currentRoom) return;
    if (currentRoom.round?.draftsByPlayer) {
      delete currentRoom.round.draftsByPlayer[playerId];
    }
    currentRoom.players = currentRoom.players.filter((p) => p.id !== playerId);
    broadcast(roomId);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
