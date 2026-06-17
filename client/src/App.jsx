import { useEffect, useMemo, useRef, useState } from "react";
import EmojiPicker, { Categories, Theme } from "emoji-picker-react";
import balloonHearts from "./assets/balloon-hearts.png";
import cherryBlossom from "./assets/flowers/cherry-blossom.png";
import sakura from "./assets/flowers/sakura.png";
import tulips from "./assets/flowers/tulips.png";
import tulipSingle from "./assets/flowers/tulip-single.png";

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  (import.meta.env.DEV ? "http://localhost:3001" : "https://wordle-9iz0.onrender.com");

const EMOJI_CATEGORIES = [
  Categories.SMILEYS_PEOPLE,
  Categories.ANIMALS_NATURE,
  Categories.FOOD_DRINK,
  Categories.TRAVEL_PLACES,
  Categories.ACTIVITIES,
  Categories.OBJECTS,
  Categories.SYMBOLS,
  Categories.FLAGS,
];

function getId() {
  return (
    sessionStorage.getItem("wordle_player_id") ||
    (() => {
      const id = `u-${Math.random().toString(16).slice(2)}`;
      sessionStorage.setItem("wordle_player_id", id);
      return id;
    })()
  );
}

function getName() {
  return localStorage.getItem("wordle_player_name") || "";
}

function setStoredName(name) {
  localStorage.setItem("wordle_player_name", name);
}

function normalizeRoomCode(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function cellClass(status) {
  return `cell ${status || ""}`;
}

function buildBoardRows(attempts, draft = "", roundFinished = false) {
  const rows = [...attempts];
  while (rows.length < 6) rows.push(null);

  if (!roundFinished) {
    const activeIndex = attempts.length;
    if (activeIndex < 6 && !rows[activeIndex]) {
      rows[activeIndex] = { guess: draft, isDraft: true };
    }
  }

  return rows;
}

function roomErrorMessage(code) {
  if (code === "room_not_found") return "Room code not found.";
  if (code === "room_full") return "Room is full.";
  if (code === "name_required") return "Name is required.";
  return "Could not connect to room.";
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(url, options = {}, retries = 2) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, options);
      const rawText = await response.text();
      let data = null;

      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        data = null;
      }

      if (response.ok) {
        return data;
      }

      const errorCode = data?.error || `http_${response.status}`;
      const retriable = response.status >= 500 || response.status === 429;

      if (!retriable || attempt === retries) {
        throw new Error(errorCode);
      }

      lastError = new Error(errorCode);
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        break;
      }
    }

    await delay(900 * (attempt + 1));
  }

  throw lastError || new Error("request_failed");
}

function replyPreviewText(text, limit = 72) {
  const value = String(text ?? "").trim();
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
}

function isEmojiOnlyMessage(text) {
  const trimmedText = String(text ?? "").trim();

  if (!trimmedText) {
    return false;
  }

  const emojiPattern =
    /^(?:\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*|\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3)$/u;

  if (typeof Intl?.Segmenter !== "function") {
    return false;
  }

  const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(trimmedText);

  return Array.from(segments).every(({ segment }) => /^\s+$/u.test(segment) || emojiPattern.test(segment));
}

export default function App() {
  const [roomCode, setRoomCode] = useState("");
  const [roomCodeDraft, setRoomCodeDraft] = useState("");
  const [name, setName] = useState(getName());
  const [nameDraft, setNameDraft] = useState(getName());
  const [input, setInput] = useState("");
  const [chat, setChat] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [chatError, setChatError] = useState("");
  const [roomError, setRoomError] = useState("");
  const [boardNotice, setBoardNotice] = useState("");
  const [boardNoticeKind, setBoardNoticeKind] = useState("info");
  const [guessFlashToken, setGuessFlashToken] = useState(0);
  const [composerEmojiOpen, setComposerEmojiOpen] = useState(false);
  const [composerEmojiPickerOpen, setComposerEmojiPickerOpen] = useState(false);
  const [state, setState] = useState(null);
  const [status, setStatus] = useState("Disconnected");
  const [you, setYou] = useState({ playerId: getId(), name: getName() });
  const [joined, setJoined] = useState(false);
  const [activeMessageActionId, setActiveMessageActionId] = useState(null);
  const [activeEmojiMessageId, setActiveEmojiMessageId] = useState(null);
  const socketRef = useRef(null);
  const messagesRef = useRef(null);
  const chatPaneRef = useRef(null);
  const chatInputRef = useRef(null);

  const roundState = state?.round;
  const matchState = state?.match;
  const otherPlayer = state?.players?.find((p) => p.id !== you.playerId);
  const sharedAttempts = roundState?.attempts || roundState?.attemptsByPlayer?.[you.playerId] || [];
  const matchFinished = !!matchState?.finishedAt;
  const canPlay = !!socketRef.current && !!roundState && !roundState.finishedAt && !matchFinished;
  const roundTarget = roundState?.target;
  const roomLabel = state?.roomId || roomCode || "—";
  const roundLabel = matchState ? `${matchState.currentRoundNumber}/${matchState.totalRounds}` : "—";
  const matchResults = matchState?.results || [];
  const playAgainReady = matchState?.playAgainReady || {};
  const readyPlayerCount = Object.keys(playAgainReady).length;
  const totalPlayerCount = state?.players?.length || 1;
  const isPlayAgainReady = !!playAgainReady?.[you.playerId];
  const resultRows = useMemo(() => {
    const totalRounds = matchState?.totalRounds || 5;
    return Array.from({ length: totalRounds }, (_, index) => {
      return matchResults.find((result) => result.roundNumber === index + 1) || {
        roundNumber: index + 1,
        target: "",
        solved: false,
        attemptsUsed: 0
      };
    });
  }, [matchResults, matchState?.totalRounds]);
  const playerNames = (state?.players || []).map((player) => player.name).filter(Boolean);
  const playerLabel =
    playerNames.length > 0 ? `Player: ${playerNames.join(" | ")}` : `Player: ${otherPlayer?.name || "Waiting"}`;

  const boardRows = useMemo(
    () => buildBoardRows(sharedAttempts, input, !!roundState?.finishedAt),
    [input, sharedAttempts, roundState?.finishedAt]
  );

  const keyboardRows = [
    "QWERTYUIOP".split(""),
    "ASDFGHJKL".split(""),
    ["ENTER", ..."ZXCVBNM".split(""), "BACKSPACE"]
  ];

  const keyboardState = useMemo(() => {
    const order = { correct: 3, present: 2, absent: 1 };
    const map = {};
    for (const attempt of sharedAttempts) {
      attempt.result.forEach((result, index) => {
        const letter = attempt.guess[index]?.toUpperCase();
        if (!letter) return;
        if ((order[result] || 0) > (order[map[letter]] || 0)) {
          map[letter] = result;
        }
      });
    }
    return map;
  }, [sharedAttempts]);

  useEffect(() => {
    return () => socketRef.current?.close();
  }, []);

  useEffect(() => {
    if (!joined) return;
    function onKeyDown(event) {
      const target = event.target;
      const tagName = target?.tagName;
      const isTypingField =
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (isTypingField) return;
      if (!canPlay) return;

      if (event.key === "Enter") {
        if (input.length === 5) {
          send("guess", { value: input.trim().toLowerCase() });
        }
        return;
      }
      if (event.key === "Backspace") {
        updateSharedDraft((value) => value.slice(0, -1));
        return;
      }
      if (/^[a-zA-Z]$/.test(event.key)) {
        updateSharedDraft((value) =>
          value.length < 5 ? `${value}${event.key.toLowerCase()}` : value
        );
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canPlay, input, joined]);

  useEffect(() => {
    const messagesEl = messagesRef.current;
    if (!messagesEl) return undefined;

    const scrollToBottom = () => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    };

    scrollToBottom();
    const frameId = window.requestAnimationFrame(scrollToBottom);
    return () => window.cancelAnimationFrame(frameId);
  }, [joined, state?.messages?.length]);

  useEffect(() => {
    setInput("");
    setChatError("");
  }, [matchState?.startedAt, roundState?.roundNumber]);

  useEffect(() => {
    if (!joined) {
      setComposerEmojiOpen(false);
      setComposerEmojiPickerOpen(false);
      setActiveMessageActionId(null);
      setActiveEmojiMessageId(null);
      setReplyTo(null);
    }
  }, [joined]);

  useEffect(() => {
    function handlePointerDown(event) {
      if (!chatPaneRef.current?.contains(event.target)) {
        setComposerEmojiOpen(false);
        setComposerEmojiPickerOpen(false);
        setActiveMessageActionId(null);
        setActiveEmojiMessageId(null);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (!boardNotice) return undefined;
    const timer = window.setTimeout(() => {
      setBoardNotice("");
      setBoardNoticeKind("info");
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [boardNotice]);

  useEffect(() => {
    if (!guessFlashToken) return undefined;
    const timer = window.setTimeout(() => {
      setGuessFlashToken(0);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [guessFlashToken]);

  useEffect(() => {
    if (!replyTo) return;
    chatInputRef.current?.focus();
  }, [replyTo]);

  function connectToRoom(nextRoomCode, nextName) {
    socketRef.current?.close();

    const normalizedRoomCode = normalizeRoomCode(nextRoomCode);
    const trimmedName = nextName.trim().slice(0, 24) || "Player";
    setRoomCode(normalizedRoomCode);
    setRoomCodeDraft(normalizedRoomCode);
    setName(trimmedName);
    setStoredName(trimmedName);
    setStatus("Connecting...");
    setRoomError("");
    setBoardNotice("");
    setBoardNoticeKind("info");

    const wsUrl = API_BASE.replace(/^http/, "ws");
    const socket = new WebSocket(
      `${wsUrl}/ws?roomId=${encodeURIComponent(normalizedRoomCode)}&playerId=${encodeURIComponent(
        you.playerId
      )}&name=${encodeURIComponent(trimmedName)}`
    );
    socketRef.current = socket;

    let settled = false;

    socket.onopen = () => {
      setStatus("Connected");
      socket.send(JSON.stringify({ type: "join_room", name: trimmedName }));
    };

    socket.onclose = () => {
      setStatus("Disconnected");
      if (!settled) {
        setJoined(false);
      }
    };

    socket.onerror = () => {
      setStatus("Connection error");
      if (!settled) {
        setJoined(false);
        setRoomError("Connection error");
      }
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "state") {
        settled = true;
        setState(data.state);
        setInput(data.state?.round?.draft || "");
        if (data.you) setYou(data.you);
        setJoined(true);
        return;
      }

      if (data.type === "guess_result") {
        if (!data.ok) setStatus(data.error);
        if (!data.ok && data.error === "not_a_real_word") {
          setGuessFlashToken(Date.now());
        }
        if (!data.ok && data.error === "guess_must_be_5_letters") {
          setGuessFlashToken(Date.now());
        }
        if (!data.ok && data.error === "attempt_limit") {
          setBoardNotice("Deneme hakkı bitti.");
          setBoardNoticeKind("error");
        }
        if (data.ok) {
          setChatError("");
          setInput("");
        }
        return;
      }

      if (data.type === "join_result" && !data.ok) {
        setRoomError(roomErrorMessage(data.error));
        setStatus(data.error);
        if (!settled) setJoined(false);
        return;
      }

      if (data.type === "play_again_result" && !data.ok) {
        setRoomError(roomErrorMessage(data.error));
        setStatus(data.error);
        return;
      }

      if (data.type === "next_round_result" && !data.ok) {
        setRoomError(roomErrorMessage(data.error));
        setStatus(data.error);
        return;
      }

      if (data.type === "error") {
        const message = roomErrorMessage(data.error);
        setRoomError(message);
        setStatus(data.error || "Connection error");
        if (!settled) setJoined(false);
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

  function updateSharedDraft(updater) {
    if (!canPlay) return;
    setInput((value) => {
      const nextValue = typeof updater === "function" ? updater(value) : updater;
      send("guess_draft", { value: nextValue });
      return nextValue;
    });
    setBoardNotice("");
  }

  function onSubmitChat(e) {
    e.preventDefault();
    const text = chat.trim();
    if (!text) return;
    send("chat", { text, name, replyTo: replyTo?.id || null });
    setChat("");
    setReplyTo(null);
    setComposerEmojiOpen(false);
    setComposerEmojiPickerOpen(false);
    setActiveMessageActionId(null);
    setActiveEmojiMessageId(null);
    setChatError("");
  }

  async function handleCreateRoom() {
    const trimmedName = nameDraft.trim().slice(0, 24) || "Player";

    setRoomError("");
    setStatus("Creating room...");
    setStoredName(trimmedName);
    setName(trimmedName);
    setNameDraft(trimmedName);

    try {
      const data = await fetchJsonWithRetry(`${API_BASE}/api/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          playerId: you.playerId,
          name: trimmedName
        })
      });

      setRoomCode(data.roomId);
      setRoomCodeDraft(data.roomId);
      setState(data);
      setInput(data.round?.draft || "");
      setJoined(true);
      connectToRoom(data.roomId, trimmedName);
    } catch (error) {
      setStatus("Disconnected");
      setJoined(false);
      setRoomError(
        error?.message?.startsWith("http_")
          ? "Server is waking up. Please try again."
          : roomErrorMessage(error?.message || "create_failed")
      );
    }
  }

  async function handleJoinRoom(e) {
    e.preventDefault();
    const trimmedName = nameDraft.trim().slice(0, 24) || "Player";
    const normalizedRoomCode = normalizeRoomCode(roomCodeDraft);
    if (!normalizedRoomCode) {
      setRoomError("Room code is required.");
      return;
    }

    setRoomError("");
    setStatus("Checking room...");
    setStoredName(trimmedName);
    setName(trimmedName);
    setNameDraft(trimmedName);

    try {
      const data = await fetchJsonWithRetry(`${API_BASE}/api/rooms/${encodeURIComponent(normalizedRoomCode)}`);

      setRoomCode(normalizedRoomCode);
      setRoomCodeDraft(normalizedRoomCode);
      setState(data);
      setInput(data.round?.draft || "");
      setJoined(true);
      connectToRoom(normalizedRoomCode, trimmedName);
    } catch (error) {
      setStatus("Disconnected");
      setJoined(false);
      setRoomError(roomErrorMessage(error?.message || "room_not_found"));
    }
  }

  function handleGuessInput(char) {
    updateSharedDraft((value) => (value.length < 5 ? `${value}${char}` : value));
  }

  function reactToMessage(messageId, emoji) {
    send("reaction", { messageId, emoji });
    setActiveEmojiMessageId(null);
  }

  function openEmojiBar(messageId) {
    setActiveMessageActionId(messageId);
    setActiveEmojiMessageId((current) => (current === messageId ? null : messageId));
  }

  function appendEmoji(emoji) {
    setChat((value) => `${value}${emoji}`);
  }

  function toggleComposerEmojiPanel() {
    setActiveMessageActionId(null);
    setActiveEmojiMessageId(null);
    setComposerEmojiOpen((current) => !current);
    setComposerEmojiPickerOpen(false);
  }

  function pickComposerEmoji(emoji) {
    appendEmoji(emoji);
  }

  function pickFullComposerEmoji(emojiData) {
    appendEmoji(emojiData.emoji);
  }

  function playAgain() {
    send("play_again", {});
  }

  return (
    <div className="app-shell">
      <div className="romance-bg" aria-hidden="true">
        <div className="romance-glow romance-glow-left" />
        <div className="romance-glow romance-glow-right" />
        <img className="romance-flower romance-flower-tulips drift-slow" src={tulips} alt="" />
        <img className="romance-flower romance-flower-sakura drift-mid" src={sakura} alt="" />
        <img className="romance-flower romance-flower-branch drift-slow" src={cherryBlossom} alt="" />
        <img className="romance-flower romance-flower-tulip drift-fast" src={tulipSingle} alt="" />
        <img className="romance-flower romance-flower-petal-a drift-fast" src={sakura} alt="" />
        <img className="romance-flower romance-flower-petal-b drift-mid" src={tulipSingle} alt="" />
        <img className="romance-flower romance-flower-petal-c drift-slow" src={cherryBlossom} alt="" />
        <img className="romance-flower romance-flower-petal-d drift-fast" src={tulipSingle} alt="" />
        <img className="romance-flower romance-flower-petal-e drift-mid" src={sakura} alt="" />
      </div>
      {joined ? (
        <div className={`round-badge ${matchFinished ? "is-finished" : ""}`} aria-live="polite">
          <span>{matchFinished ? "Seri bitti" : "Round"}</span>
          <strong>{roundLabel}</strong>
        </div>
      ) : null}
      <main className={`workspace ${joined ? "is-live" : "is-landing"}`}>
        {!joined ? (
          <section className="landing-pane">
            <div className="landing-card">
              <div className="landing-copy">
                <div className="site-brand">
                  <img className="site-brand-logo" src={balloonHearts} alt="Wordle hearts logo" />
                </div>
                <h2>Welcome MyWord</h2>
                <p>Catch Me If You Can ✨</p>
              </div>
              <form className="landing-form" onSubmit={handleJoinRoom}>
                <label>İsim</label>
                <input
                  value={nameDraft}
                  onChange={(e) => {
                    setNameDraft(e.target.value);
                    setRoomError("");
                  }}
                  placeholder="Your name"
                  maxLength={24}
                />
                <label>Oda kodu</label>
                <input
                  value={roomCodeDraft}
                  onChange={(e) => {
                    setRoomCodeDraft(normalizeRoomCode(e.target.value));
                    setRoomError("");
                  }}
                  placeholder="Join code"
                  maxLength={8}
                />
                <div className="landing-actions">
                  <button type="button" onClick={handleCreateRoom}>
                    Oda oluştur
                  </button>
                  <button type="submit">Odaya katıl</button>
                </div>
                {roomError ? <div className="error-banner">{roomError}</div> : null}
              </form>
            </div>
          </section>
        ) : null}

        {joined ? (
          <>
            <section className="board-pane">
              <div className="board-shell">
                <div className="room-stats">
                  <span>Room: {roomLabel}</span>
                  <span>Round: {roundLabel}</span>
                  <span>{playerLabel}</span>
                </div>

                {boardNotice || (!matchFinished && roundTarget && roundState?.finishedAt) ? (
                  <div className="board-overlay" aria-live="polite" aria-atomic="true">
                    <div
                      className={`board-notice ${boardNoticeKind === "error" ? "is-error" : ""} ${
                        !matchFinished && roundTarget && roundState?.finishedAt ? "is-answer" : ""
                      }`}
                    >
                      {boardNotice || (
                        <>
                          Doğru cevap: <strong>{roundTarget.toUpperCase()}</strong>
                        </>
                      )}
                    </div>
                  </div>
                ) : null}

                {matchFinished ? (
                  <div className="results-panel" aria-live="polite">
                    <div className="results-head">
                      <div>
                        <div className="results-kicker">5 round tamamlandı</div>
                        <h2>Sonuç grafiği</h2>
                      </div>
                      <div className="results-room">Room {roomLabel}</div>
                    </div>

                    <div className="results-chart">
                      {resultRows.map((result) => {
                        const attemptsUsed = Number(result.attemptsUsed || 0);
                        const barValue = result.solved ? attemptsUsed : 6;
                        const barWidth = `${Math.max(10, (barValue / 6) * 100)}%`;
                        return (
                          <div key={result.roundNumber} className="result-row">
                            <div className="result-round">R{result.roundNumber}</div>
                            <div className="result-bar-track">
                              <div
                                className={`result-bar ${result.solved ? "is-solved" : "is-lost"}`}
                                style={{ width: barWidth }}
                              >
                                <span>
                                  {result.solved
                                    ? `${attemptsUsed}. deneme`
                                    : "Bulunamadı"}
                                </span>
                              </div>
                            </div>
                            <div className="result-word">{result.target ? result.target.toUpperCase() : "-"}</div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="play-again-panel">
                      <button
                        type="button"
                        className="play-again-button"
                        onClick={playAgain}
                        disabled={isPlayAgainReady}
                      >
                        {isPlayAgainReady ? "Hazır bekleniyor" : "Play Again"}
                      </button>
                      <div className="play-again-status">
                        {readyPlayerCount}/{totalPlayerCount} oyuncu hazır. Yeni 5'li seri herkes basınca başlar.
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="match-line">
                      <div className="match-copy">
                        {!state
                          ? "Bağlanıyor..."
                          : roundState?.finishedAt
                            ? "Round tamamlandı, sonraki tur hazırlanıyor."
                            : "Kelimeyi bul."}
                      </div>
                    </div>

                    {/* Opponent panel removed — opponent letters are shown inline within the main grid cells */}

                    <div className="grid">
                      {boardRows.map((row, rowIndex) => {
                        const isActiveRow = row?.isDraft && rowIndex === sharedAttempts.length && !roundState?.finishedAt;
                        const isFlashRow = isActiveRow && !!guessFlashToken;
                        return (
                          <div key={rowIndex} className={`row ${isFlashRow ? "is-flash" : ""}`}>
                            {Array.from({ length: 5 }).map((_, colIndex) => {
                              const letter = row?.guess?.[colIndex] || "";
                              const status = row?.result?.[colIndex];
                              return (
                                <div
                                  key={colIndex}
                                  className={`${cellClass(status)} ${isFlashRow ? "flash-error" : ""}`}
                                >
                                  <span className="main-letter">{letter}</span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>

                    <div className="keyboard">
                      {keyboardRows.map((row, rowIndex) => (
                        <div key={rowIndex} className="keyboard-row">
                          {row.map((key) => {
                            if (key === "ENTER") {
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  className="key wide enter-key"
                                  onClick={() => {
                                    if (input.length === 5) {
                                      send("guess", { value: input.trim().toLowerCase() });
                                    }
                                  }}
                                  disabled={!canPlay || input.length !== 5}
                                >
                                  Enter
                                </button>
                              );
                            }

                            if (key === "BACKSPACE") {
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  className="key wide icon-key"
                                  onClick={() => updateSharedDraft((value) => value.slice(0, -1))}
                                  disabled={!canPlay}
                                  aria-label="Backspace"
                                >
                                  ⌫
                                </button>
                              );
                            }

                            return (
                              <button
                                key={key}
                                type="button"
                                className={`key ${keyboardState[key] || ""}`}
                                onClick={() => handleGuessInput(key.toLowerCase())}
                                disabled={!canPlay}
                              >
                                {key}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {chatError ? <div className="error-banner">{chatError}</div> : null}

                <div className="footer-row">
                  <div className="hint">Aynı oda kodunda chat korunur, 5 round sonrası yeni match başlatılır.</div>
                </div>
              </div>
            </section>

            <aside className="chat-pane" ref={chatPaneRef}>
              <div className="chat-shell">
                <div className="chat-header">
                  <div className="chat-brand">
                    <img className="chat-brand-logo" src={balloonHearts} alt="Wordle hearts logo" />
                    <div>
                      <div className="chat-title">Chat Box</div>
                      <div className="chat-meta">
                        {roomLabel} · {playerNames.length || 1} player
                        {playerNames.length === 1 ? "" : "s"}
                      </div>
                    </div>
                  </div>
                  <div className={`chat-status ${status === "Connected" ? "is-live" : ""}`}>{status}</div>
                </div>
                <div className="messages" ref={messagesRef}>
                  {(state?.messages || []).map((message) => {
                    const emojiOnlyMessage = isEmojiOnlyMessage(message.text);

                    return (
                    <div
                      key={message.id}
                      className={`message ${activeEmojiMessageId === message.id ? "is-active" : ""} ${
                        Object.keys(message.reactions || {}).length > 0 ? "has-reactions" : ""
                      } ${emojiOnlyMessage ? "is-emoji-only" : ""}`}
                      onMouseEnter={() => setActiveMessageActionId(message.id)}
                      onMouseLeave={() => {
                        setActiveMessageActionId((current) => (current === message.id ? null : current));
                      }}
                    >
                      <div className={`message-stack ${message.playerId === you.playerId ? "mine" : ""}`}>
                        {message.replyTo ? (
                          <button
                            type="button"
                            className="reply-pill"
                            onClick={() =>
                              setReplyTo({
                                id: message.replyTo.id,
                                name: message.replyTo.name,
                                text: message.replyTo.text
                              })
                            }
                          >
                            <span>{replyPreviewText(message.replyTo.text, 54)}</span>
                          </button>
                        ) : null}
                        <div className={`message-row ${message.playerId === you.playerId ? "mine" : "other"}`}>
                          <div
                            className={`bubble-actions ${
                              activeMessageActionId === message.id ? "is-open" : ""
                            } ${message.playerId === you.playerId ? "mine" : "other"}`}
                          >
                            <button
                              type="button"
                              className="bubble-action"
                              aria-label="Add reaction"
                              onClick={() => openEmojiBar(message.id)}
                            >
                              ☺
                            </button>
                            <button
                              type="button"
                              className="bubble-action"
                              aria-label="Reply to message"
                              onClick={() => {
                                setReplyTo({ id: message.id, name: message.name, text: message.text });
                                setActiveMessageActionId(null);
                                setActiveEmojiMessageId(null);
                              }}
                            >
                              ↩
                            </button>
                          </div>
                          <div className="bubble">
                            {emojiOnlyMessage ? (
                              <span className="emoji-message">{message.text}</span>
                            ) : null}
                            {!emojiOnlyMessage ? <p>{message.text}</p> : null}
                            {activeEmojiMessageId === message.id ? (
                              <div
                                className={`floating-reactions ${message.playerId === you.playerId ? "mine" : "other"}`}
                              >
                                {["❤️", "🫠", "🤔", "😢", "😘", "😂"].map((emoji) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    className={`reaction-chip ${
                                      message.reactions?.[you.playerId] === emoji ? "is-selected" : ""
                                    }`}
                                    onClick={() => reactToMessage(message.id, emoji)}
                                    aria-label={`React with ${emoji}`}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                        {Object.entries(message.reactions || {}).length > 0 ? (
                          <div className="reaction-bubble-row">
                            {Array.from(new Set(Object.values(message.reactions || {}))).map((emoji) => (
                              <button
                                key={`${message.id}-${emoji}`}
                                type="button"
                                className={`reaction-bubble ${
                                  message.reactions?.[you.playerId] === emoji ? "is-selected" : ""
                                }`}
                                onClick={() => reactToMessage(message.id, emoji)}
                                aria-label={`Reaction ${emoji}`}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )})}
                </div>
                <form className="chat-form" onSubmit={onSubmitChat}>
                  <div className="chat-controls">
                    {replyTo ? (
                      <div className="reply-composer">
                        <div className="reply-composer-bubble">
                          <div className="reply-composer-label">Replying to {replyTo.name}</div>
                          <div>{replyPreviewText(replyTo.text)}</div>
                        </div>
                        <button
                          type="button"
                          className="reply-dismiss"
                          aria-label="Cancel reply"
                          onClick={() => setReplyTo(null)}
                        >
                          ×
                        </button>
                      </div>
                    ) : null}
                    <div className="chat-input-row">
                      <div className="emoji-wrap">
                        <button
                          type="button"
                          className={`emoji-shortcut ${composerEmojiOpen ? "is-open" : ""}`}
                          onClick={toggleComposerEmojiPanel}
                          aria-label="Open emoji picker"
                        >
                          ☺
                        </button>
                        {composerEmojiOpen ? (
                          <div className="composer-emoji-panel">
                            <div className="emoji-panel-label">Quick reactions</div>
                            <div className="composer-emoji-grid">
                              {["❤️", "🫠", "🤔", "😢", "😘", "😂"].map((emoji) => (
                                <button
                                  key={`composer-${emoji}`}
                                  type="button"
                                  className="composer-emoji-chip"
                                  onClick={() => pickComposerEmoji(emoji)}
                                >
                                  {emoji}
                                </button>
                              ))}
                              <button
                                type="button"
                                className="composer-emoji-chip more"
                                onClick={() => setComposerEmojiPickerOpen((current) => !current)}
                              >
                                +
                              </button>
                            </div>
                            {composerEmojiPickerOpen ? (
                              <div className="full-emoji-picker composer">
                                <EmojiPicker
                                  onEmojiClick={pickFullComposerEmoji}
                                  theme={Theme.DARK}
                                  width="100%"
                                  height={320}
                                  className="compact-emoji-picker"
                                  previewConfig={{ showPreview: false }}
                                  searchPlaceholder="Search emoji"
                                  categories={EMOJI_CATEGORIES}
                                  suggestedEmojisMode="recent"
                                  skinTonesDisabled
                                  lazyLoadEmojis
                                />
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                        <input
                          ref={chatInputRef}
                          value={chat}
                          onChange={(e) => setChat(e.target.value)}
                          placeholder="Write a message"
                          maxLength={240}
                        />
                      <button type="submit" className="chat-send-button" aria-label="Send message">
                        →
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </aside>
          </>
        ) : null}
      </main>
    </div>
  );
}
