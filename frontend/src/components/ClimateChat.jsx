"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAppState } from "@/lib/store";
import { useI18n } from "@/lib/i18n";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Простой рендерер Markdown (без внешних зависимостей) ─────────────────────
function MarkdownText({ text }) {
  const lines = text.split("\n");
  const elements = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Пустая строка — отступ
    if (line.trim() === "") {
      elements.push(<div key={key++} style={{ height: 6 }} />);
      continue;
    }

    // Заголовки ## и ###
    if (line.startsWith("### ")) {
      elements.push(
        <div key={key++} className="chat-md-h3">
          {renderInline(line.slice(4))}
        </div>
      );
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(
        <div key={key++} className="chat-md-h2">
          {renderInline(line.slice(3))}
        </div>
      );
      continue;
    }

    // Маркированный список
    if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <div key={key++} className="chat-md-li">
          <span className="chat-md-bullet">•</span>
          <span>{renderInline(line.slice(2))}</span>
        </div>
      );
      continue;
    }

    // Обычный абзац
    elements.push(
      <div key={key++} className="chat-md-p">
        {renderInline(line)}
      </div>
    );
  }

  return <div className="chat-md">{elements}</div>;
}

// Инлайн-форматирование: **bold**, *italic*, `code`
function renderInline(text) {
  const parts = [];
  // Разбиваем по **bold**, *italic*, `code`
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let match;
  let k = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(<span key={k++}>{text.slice(last, match.index)}</span>);
    }
    const raw = match[0];
    if (raw.startsWith("**")) {
      parts.push(<strong key={k++}>{raw.slice(2, -2)}</strong>);
    } else if (raw.startsWith("*")) {
      parts.push(<em key={k++}>{raw.slice(1, -1)}</em>);
    } else if (raw.startsWith("`")) {
      parts.push(<code key={k++} className="chat-md-code">{raw.slice(1, -1)}</code>);
    }
    last = match.index + raw.length;
  }

  if (last < text.length) {
    parts.push(<span key={k++}>{text.slice(last)}</span>);
  }

  return parts.length > 0 ? parts : text;
}

// ── Индикатор набора текста ───────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="chat-bubble chat-bubble-ai">
      <div className="chat-typing">
        <span /><span /><span />
      </div>
    </div>
  );
}

// ── Основной компонент ────────────────────────────────────────────────────────
export default function ClimateChat() {
  const { userLocation } = useAppState();
  const { lang } = useI18n();
  const isRu = lang === "ru";

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]); // { role: 'user'|'assistant', content: string }
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Автоскролл вниз при новом сообщении
  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading, open]);

  // Фокус на инпут при открытии
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const sendMessage = useCallback(async () => {
    const query = input.trim();
    if (!query || loading) return;

    const lat = userLocation?.lat ?? 55.75;
    const lon = userLocation?.lng ?? 37.62;

    const newMessages = [...messages, { role: "user", content: query }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat,
          lon,
          query,
          chat_history: messages.slice(-6), // последние 3 хода
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const reply =
        data.reply ||
        data.message ||
        (isRu ? "Нет ответа от модели." : "No response from model.");

      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, userLocation, isRu]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

  const noLocation = !userLocation;

  return (
    <div className="glass-card chat-card">
      {/* ── Заголовок / кнопка открытия ── */}
      <button className="chat-header" onClick={() => setOpen((v) => !v)}>
        <div className="glass-card-title" style={{ margin: 0 }}>
          <span className="icon">🤖</span>
          {isRu ? "Climate Intel AI" : "Climate Intel AI"}
          {messages.length > 0 && (
            <span className="chat-msg-count">{messages.length}</span>
          )}
        </div>
        <span className={`chat-chevron ${open ? "open" : ""}`}>▾</span>
      </button>

      {/* ── Тело чата ── */}
      {open && (
        <div className="chat-body">
          {/* Предупреждение если нет геолокации */}
          {noLocation && (
            <div className="chat-no-location">
              <span>📍</span>
              {isRu
                ? "Включите геолокацию для точного анализа. Используются координаты Москвы по умолчанию."
                : "Enable geolocation for accurate analysis. Using Moscow coordinates by default."}
            </div>
          )}

          {/* Пустое состояние */}
          {messages.length === 0 && !loading && (
            <div className="chat-empty">
              <div className="chat-empty-icon">🌍</div>
              <div className="chat-empty-title">
                {isRu ? "Спросите о рисках" : "Ask about risks"}
              </div>
              <div className="chat-empty-sub">
                {isRu
                  ? "Погода, пожары, землетрясения, AQI — анализ в реальном времени"
                  : "Weather, wildfires, earthquakes, AQI — real-time analysis"}
              </div>
              {/* Быстрые запросы */}
              <div className="chat-quick-btns">
                {(isRu
                  ? ["Полный анализ рисков", "Брать ли зонт?", "Качество воздуха"]
                  : ["Full risk analysis", "Should I take umbrella?", "Air quality"]
                ).map((q) => (
                  <button
                    key={q}
                    className="chat-quick-btn"
                    onClick={() => {
                      setInput(q);
                      setTimeout(() => inputRef.current?.focus(), 50);
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Лента сообщений */}
          {messages.length > 0 && (
            <div className="chat-messages">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`chat-bubble ${
                    msg.role === "user" ? "chat-bubble-user" : "chat-bubble-ai"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <MarkdownText text={msg.content} />
                  ) : (
                    <span>{msg.content}</span>
                  )}
                </div>
              ))}
              {loading && <TypingIndicator />}
              <div ref={bottomRef} />
            </div>
          )}

          {/* Ошибка */}
          {error && (
            <div className="chat-error">
              ⚠ {error}
            </div>
          )}

          {/* Инпут */}
          <div className="chat-input-row">
            <textarea
              ref={inputRef}
              className="chat-input"
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isRu
                  ? "Введите вопрос... (Enter — отправить)"
                  : "Ask a question... (Enter to send)"
              }
              disabled={loading}
            />
            <button
              className="chat-send-btn"
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              title={isRu ? "Отправить" : "Send"}
            >
              {loading ? <span className="chat-send-spinner" /> : "➤"}
            </button>
          </div>

          {/* Нижняя панель */}
          {messages.length > 0 && (
            <div className="chat-footer">
              <button className="chat-clear-btn" onClick={clearChat}>
                {isRu ? "Очистить чат" : "Clear chat"}
              </button>
              <span className="chat-model-label">Gemini 1.5 Flash</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
