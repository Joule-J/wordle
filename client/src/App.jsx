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
  const [replyTo, setReplyTo] = useState(null);
  const [chatError, setChatError] = useState("");
  const [state, setState] = useState(null);
  const [status, setStatus] = useState("Disconnected");
  const [you, setYou] = useState({ playerId: getId(), name: getName() });
  const [joined, setJoined] = useState(false);
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  const roomState = state?.round;
  const meAttempts = roomState?.attemptsByPlayer?.[you.playerId] || [];
  const otherPlayer = state?.players?.find((p) => p.id !== you.playerId);
  const canPlay = !!socketRef.current && roomState && !roomState.finishedAt;
  const roundTarget = roomState?.target;

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
      const target = event.target;
      const tagName = target?.tagName;
      const isTypingField =
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (isTypingField) {
        return;
      }
      if (!canPlay) return;
      if (event.key === "Enter") {
        if (input.length === 5) {
          send("guess", { value: input.trim().toLowerCase() });
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [state?.messages?.length]);

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
        if (!data.ok && data.error === "not_a_real_word") {
          setChatError("That is not a real 5-letter word.");
        }
        if (!data.ok && data.error === "guess_must_be_5_letters") {
          setChatError("Enter exactly 5 letters.");
        }
        if (data.ok) {
          setChatError("");
        }
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
    if (input.length === 5) {
      send("guess", { value: input.trim().toLowerCase() });
    }
  }

  function onSubmitChat(e) {
    e.preventDefault();
    const text = chat.trim();
    if (!text) return;
    send("chat", { text, name, replyTo: replyTo?.id || null });
    setChat("");
    setReplyTo(null);
    setChatError("");
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

  function handleGuessInput(char) {
    setInput((value) => (value.length < 5 ? `${value}${char}` : value));
    setChatError("");
  }

  function submitKeyboardGuess() {
    if (input.length === 5) {
      send("guess", { value: input.trim().toLowerCase() });
    }
  }

  function reactToMessage(messageId, emoji) {
    send("reaction", { messageId, emoji });
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
                <button type="button" onClick={enterRoom}>Enter room</button>
              </div>
            </div>
          </section>
        ) : null}

        {joined ? (
          <>
        <section className="board-pane">
          <div className="board-shell">
            {roomState?.finishedAt ? (
              <div className="outcome-banner">
                <div className="outcome-title">
                  {roomState.winner === you.playerId ? "You won" : "Round ended"}
                </div>
                <div className="outcome-text">
                  Answer: <strong>{roundTarget?.toUpperCase()}</strong>
                </div>
              </div>
            ) : null}
            <div className="grid">
              {boardRows.map((row, rowIndex) => {
                const isActiveRow = !row && rowIndex === meAttempts.length && !roomState?.finishedAt;
                return (
                  <div key={rowIndex} className="row">
                    {Array.from({ length: 5 }).map((_, colIndex) => {
                      const letter = row?.guess?.[colIndex] || (isActiveRow ? input[colIndex] || "" : "");
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
                      onClick={() => handleGuessInput(key.toLowerCase())}
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
              <div className="current-guess">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="guess-slot">
                    {input[index]?.toUpperCase() || ""}
                  </div>
                ))}
              </div>
              <button type="submit" className="guess-submit" disabled={!canPlay || input.length !== 5}>Enter</button>
            </form>

            {chatError ? <div className="error-banner">{chatError}</div> : null}

            <div className="footer-row">
              {roomState?.finishedAt ? (
                <button type="button" onClick={() => send("next_round", {})}>New round</button>
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
                    {message.replyTo ? (
                      <div className="reply-pill">
                        Replying to {message.replyTo.name}: {message.replyTo.text}
                      </div>
                    ) : null}
                    <div className="sender">{message.name}</div>
                    <div>{message.text}</div>
                    <div className="reactions">
                      {["❤️", "😂", "👍", "🔥"].map((emoji) => (
                        <button key={emoji} type="button" className="reaction-btn" onClick={() => reactToMessage(message.id, emoji)}>
                          {emoji}
                          {Object.values(message.reactions || {}).filter((value) => value === emoji).length > 0 ? <span>{Object.values(message.reactions || {}).filter((value) => value === emoji).length}</span> : null}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="reply-btn"
                      onClick={() => setReplyTo({ id: message.id, name: message.name, text: message.text })}
                    >
                      Reply
                    </button>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <form className="chat-form" onSubmit={onSubmitChat}>
              {replyTo ? (
                <div className="reply-composer">
                  Replying to {replyTo.name}: {replyTo.text}
                  <button type="button" onClick={() => setReplyTo(null)}>x</button>
                </div>
              ) : null}
              <input
                value={chat}
                onChange={(e) => setChat(e.target.value)}
                placeholder="Message..."
                maxLength={240}
              />
              <button type="submit">Send</button>
            </form>
          </div>
        </aside>
          </>
        ) : null}
      </main>
    </div>
  );
}
