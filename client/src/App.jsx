import { useEffect, useMemo, useRef, useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  (import.meta.env.DEV ? "http://localhost:3001" : "https://wordle-9iz0.onrender.com");

function getId() {
  return localStorage.getItem("wordle_player_id") || (() => {
    const id = `u-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem("wordle_player_id", id);
    return id;
  })();
}

function getName() {
  return localStorage.getItem("wordle_player_name") || "Player";
}

function setStoredName(name) {
  localStorage.setItem("wordle_player_name", name);
}

function cellClass(status) {
  return `cell ${status || ""}`;
}

export default function App() {
  const [roomId, setRoomId] = useState("demo");
  const [roomDraft, setRoomDraft] = useState("demo");
  const [name, setName] = useState(getName());
  const [nameDraft, setNameDraft] = useState(getName());
  const [input, setInput] = useState("");
  const [chat, setChat] = useState("");
  const [state, setState] = useState(null);
  const [status, setStatus] = useState("Disconnected");
  const [you, setYou] = useState({ playerId: getId(), name: getName() });
  const [joined, setJoined] = useState(false);
  const socketRef = useRef(null);

  const roomState = state?.round;
  const meAttempts = roomState?.attemptsByPlayer?.[you.playerId] || [];
  const otherPlayer = state?.players?.find((p) => p.id !== you.playerId);
  const canPlay = !!socketRef.current && roomState && !roomState.finishedAt;

  const boardRows = useMemo(() => {
    const rows = [...meAttempts];
    while (rows.length < 6) rows.push(null);
    return rows;
  }, [meAttempts]);

  const keyboardState = useMemo(() => {
    const order = { correct: 3, present: 2, absent: 1 };
    const map = {};
    for (const attempt of meAttempts) {
      attempt.result.forEach((result, index) => {
        const letter = attempt.guess[index]?.toUpperCase();
        if (!letter) return;
        if ((order[result] || 0) > (order[map[letter]] || 0)) {
          map[letter] = result;
        }
      });
    }
    return map;
  }, [meAttempts]);

  useEffect(() => {
    if (joined) {
      connect();
    }
    return () => socketRef.current?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, joined]);

  useEffect(() => {
    if (!joined) return;
    function onKeyDown(event) {
      if (!canPlay) return;
      if (event.key === "Enter") {
        if (input.length === 5) {
          send("guess", { value: input.trim().toLowerCase() });
          setInput("");
        }
        return;
      }
      if (event.key === "Backspace") {
        setInput((value) => value.slice(0, -1));
        return;
      }
      if (/^[a-zA-Z]$/.test(event.key)) {
        setInput((value) => (value.length < 5 ? `${value}${event.key.toLowerCase()}` : value));
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canPlay, input, joined]);

  function connect() {
    socketRef.current?.close();
    const wsUrl = API_BASE.replace(/^http/, "ws");
    const socket = new WebSocket(`${wsUrl}/ws?roomId=${encodeURIComponent(roomId)}&playerId=${encodeURIComponent(you.playerId)}&name=${encodeURIComponent(name)}`);
    socketRef.current = socket;
    setStatus("Connecting...");

    socket.onopen = () => {
      setStatus("Connected");
      socket.send(JSON.stringify({ type: "join", name }));
    };
    socket.onclose = () => setStatus("Disconnected");
    socket.onerror = () => setStatus("Connection error");
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "state") {
        setState(data.state);
        if (data.you) setYou(data.you);
      }
      if (data.type === "guess_result") {
        if (!data.ok) setStatus(data.error);
      }
    };
  }

  function send(type, payload) {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type, ...payload }));
    }
  }

  function onSubmitGuess(e) {
    e.preventDefault();
    send("guess", { value: input.trim().toLowerCase() });
    setInput("");
  }

  function onSubmitChat(e) {
    e.preventDefault();
    send("chat", { text: chat, name });
    setChat("");
  }

  function enterRoom() {
    const nextRoom = roomDraft.trim() || "demo";
    const trimmedName = nameDraft.trim().slice(0, 24) || "Player";
    setRoomId(nextRoom);
    setRoomDraft(nextRoom);
    setName(trimmedName);
    setNameDraft(trimmedName);
    setStoredName(trimmedName);
    setJoined(true);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <button className="icon-button" aria-label="menu">☰</button>
          <div className="brand">
            <div className="brand-kicker">Online Wordle</div>
            <div className="brand-title">Room duel</div>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="pill">{status}</div>
          <div className="pill">Room {roomId}</div>
          <div className="pill">{otherPlayer?.name || "Waiting"}</div>
        </div>
      </header>

      <main className={`workspace ${joined ? "is-live" : "is-landing"}`}>
        {!joined ? (
          <section className="landing-pane">
            <div className="landing-card">
              <div className="landing-copy">
                <div className="brand-kicker">ONLINE WORDLE</div>
                <h2>Create or join a room</h2>
                <p>Open the site, pick a room, set your name, then start the board.</p>
              </div>
              <div className="landing-form">
                <label>Room</label>
                <input value={roomDraft} onChange={(e) => setRoomDraft(e.target.value)} />
                <label>Your name</label>
                <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
                <button onClick={enterRoom}>Enter room</button>
              </div>
            </div>
          </section>
        ) : null}

        {joined ? (
          <>
        <section className="board-pane">
          <div className="board-shell">
            <div className="grid">
              {boardRows.map((row, rowIndex) => {
                const currentGuess = row ? row.guess : input;
                return (
                  <div key={rowIndex} className="row">
                    {Array.from({ length: 5 }).map((_, colIndex) => {
                      const letter = currentGuess?.[colIndex] || "";
                      const status = row?.result?.[colIndex];
                      return (
                        <div key={colIndex} className={cellClass(status)}>
                          {letter}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            <div className="keyboard">
              {[
                "QWERTYUIOP",
                "ASDFGHJKL",
                "ZXCVBNM"
              ].map((row, rowIndex) => (
                <div key={rowIndex} className="keyboard-row">
                  {row.split("").map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={`key ${keyboardState[key] || ""}`}
                      onClick={() => setInput((value) => (value.length < 5 ? `${value}${key.toLowerCase()}` : value))}
                      disabled={!canPlay}
                    >
                      {key}
                    </button>
                  ))}
                  {rowIndex === 2 ? (
                    <button type="button" className="key wide" onClick={() => setInput((value) => value.slice(0, -1))}>
                      ⌫
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            <form className="guess-form" onSubmit={onSubmitGuess}>
              <button className="guess-submit" disabled={!canPlay || input.length !== 5}>Enter</button>
            </form>

            <div className="footer-row">
              {roomState?.finishedAt ? (
                <button onClick={() => send("next_round", {})}>New round</button>
              ) : null}
            </div>
          </div>
        </section>
        <aside className="chat-pane">
          <div className="chat-shell">
            <div className="chat-header">
              <div>
                <div className="chat-title">Chat</div>
                <div className="chat-subtitle">Room only</div>
              </div>
            </div>
            <div className="messages">
              {(state?.messages || []).map((message) => (
                <div key={message.id} className={`message ${message.playerId === you.playerId ? "mine" : ""}`}>
                  <div className="bubble">
                    <div className="sender">{message.name}</div>
                    <div>{message.text}</div>
                  </div>
                </div>
              ))}
            </div>
            <form className="chat-form" onSubmit={onSubmitChat}>
              <input
                value={chat}
                onChange={(e) => setChat(e.target.value)}
                placeholder="Message..."
                maxLength={240}
              />
              <button>Send</button>
            </form>
          </div>
        </aside>
          </>
        ) : null}
      </main>
    </div>
  );
}
