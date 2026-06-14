import express from "express";
import http from "http";
import cors from "cors";
import { WebSocketServer } from "ws";
import { addMessage, createRoom, guess, joinRoom, nextRound, roomSnapshot } from "./game.js";

const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN === "*" ? true : CLIENT_ORIGIN }));
app.use(express.json());

const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, createRoom(roomId));
  }
  return rooms.get(roomId);
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/api/room/:roomId", (req, res) => {
  const room = getRoom(req.params.roomId);
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

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const roomId = url.searchParams.get("roomId") || "lobby";
  const playerId = url.searchParams.get("playerId") || `p-${Math.random().toString(16).slice(2)}`;
  const name = url.searchParams.get("name") || "Player";
  ws.roomId = roomId;
  ws.playerId = playerId;

  const room = getRoom(roomId);
  joinRoom(room, playerId, name);
  broadcast(roomId);

  ws.send(JSON.stringify({ type: "state", state: roomSnapshot(room), you: { playerId, name } }));

  ws.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const currentRoom = getRoom(roomId);

    if (data.type === "join") {
      joinRoom(currentRoom, playerId, data.name || name);
      broadcast(roomId);
      return;
    }

    if (data.type === "guess") {
      const result = guess(currentRoom, playerId, data.value);
      if (result.ok) {
        broadcast(roomId);
      }
      ws.send(JSON.stringify({ type: "guess_result", ...result }));
      return;
    }

    if (data.type === "chat") {
      const message = addMessage(currentRoom, playerId, data.name || name, data.text);
      if (message) {
        broadcast(roomId);
      }
      return;
    }

    if (data.type === "next_round") {
      nextRound(currentRoom);
      broadcast(roomId);
    }
  });

  ws.on("close", () => {
    const currentRoom = rooms.get(roomId);
    if (!currentRoom) return;
    currentRoom.players = currentRoom.players.filter((p) => p.id !== playerId);
    broadcast(roomId);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
