"use client";
 
// v18: HistoryPanel — browse/resume past chat sessions stored on the agent.
//
// Protocol (chat-channel based, no sidecar):
//   client → agent  (regular chat msg, special prefix):
//     __history_list__:<username>
//     __history_get__:<session_id>
//     __session_resume__:<session_id>
//     __new_session__
//   agent → client  (data channel topic "jeeves-history-response", JSON):
//     {type:"session_list",   sessions:[...]}
//     {type:"session_messages", messages:[...]}
//     {type:"session_resumed", session_id}
//     {type:"new_session",    session_id}
//
// Backward compat: old agent ignores __ messages → 3s timeout → "history not available".
// Old client never sends __ messages → new agent never enters this code path.
import { useEffect, useState, useCallback, useRef } from "react";
import { useChat, useDataChannel } from "@livekit/components-react";
import { useWindowResize } from "@/hooks/useWindowResize";
 
interface Session {
  id: string;
  started: string;
  updated: string;
  summary: string;
  username: string;
}
 
interface Message {
  role: string;
  content: string;
}
 
interface Props {
  username: string;
  accentColor?: string;
}
 
const HISTORY_TOPIC = "jeeves-history-response";
const RESPONSE_TIMEOUT_MS = 3000;
 
export function HistoryPanel({ username, accentColor = "cyan" }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
 
  const { width } = useWindowResize();
  const isDesktop = width >= 1024; // matches existing lg: breakpoint
 
  // useChat returns { send, chatMessages, isSending } in @livekit/components-react v2.
  const chat = useChat();
  const sendChat = chat?.send;
 
  // Listen for agent responses on a dedicated topic so they don't clutter regular chat.
  const dataChannel = useDataChannel(HISTORY_TOPIC);
  const dataMsg = dataChannel?.message;
 
  useEffect(() => {
    if (!dataMsg?.payload) return;
    try {
      const obj = JSON.parse(new TextDecoder().decode(dataMsg.payload));
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (obj.type === "session_list") {
        setSessions(obj.sessions || []);
        setSupported(true);
        setLoading(false);
      } else if (obj.type === "session_messages") {
        setMessages(obj.messages || []);
        setLoading(false);
      } else if (obj.type === "session_resumed" || obj.type === "new_session") {
        setLoading(false);
        setSelected(null);
        setDetailOpen(false);
      }
    } catch {
      // Malformed payload — ignore.
    }
  }, [dataMsg]);
 
  const fetchSessions = useCallback(() => {
    if (!sendChat || !username) return;
    setLoading(true);
    setSupported(null);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setSupported(false);
      setLoading(false);
    }, RESPONSE_TIMEOUT_MS);
    sendChat(`__history_list__:${username}`).catch(() => {});
  }, [sendChat, username]);
 
  // Auto-refresh when username becomes available. sendChat is supplied by
  // @livekit/components-react's useChat() and is always defined inside a Room context.
  useEffect(() => {
    if (username) fetchSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);
 
  const openSession = useCallback(
    (s: Session) => {
      if (!sendChat) return;
      setSelected(s);
      setDetailOpen(true);
      setLoading(true);
      setMessages([]);
      sendChat(`__history_get__:${s.id}`).catch(() => {});
    },
    [sendChat]
  );
 
  const resumeSession = useCallback(() => {
    if (!sendChat || !selected) return;
    sendChat(`__session_resume__:${selected.id}`).catch(() => {});
    setDetailOpen(false);
    setSelected(null);
  }, [sendChat, selected]);
 
  const newSession = useCallback(() => {
    if (!sendChat) return;
    sendChat(`__new_session__`).catch(() => {});
    setDetailOpen(false);
    setSelected(null);
  }, [sendChat]);
 
  const SessionList = (
    // min-w-0 = prevent flex children from forcing horizontal overflow.
    <div className="flex flex-col flex-1 overflow-hidden min-h-0 min-w-0 w-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 flex-shrink-0">
        <span className="text-xs text-gray-500 truncate">
          {username ? `History · ${username}` : "History"}
        </span>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={newSession}
            disabled={!sendChat}
            className="text-xs text-gray-400 hover:text-white px-2 py-1 border border-gray-700 rounded disabled:opacity-40"
          >
            + New
          </button>
          <button
            onClick={fetchSessions}
            disabled={!sendChat || !username}
            className="text-xs text-gray-400 hover:text-white px-2 py-1 border border-gray-700 rounded disabled:opacity-40"
          >
            Refresh
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {!username ? (
          <p className="text-xs text-gray-600 text-center mt-8">
            Connect with a username to view history
          </p>
        ) : !sendChat ? (
          <p className="text-xs text-gray-600 text-center mt-8">
            Connect to load history
          </p>
        ) : loading ? (
          <p className="text-xs text-gray-600 text-center mt-8">Loading…</p>
        ) : supported === false ? (
          <p className="text-xs text-gray-600 text-center mt-8">
            History not available — update agent to v18+
          </p>
        ) : sessions.length === 0 ? (
          <p className="text-xs text-gray-600 text-center mt-8">No sessions found</p>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => openSession(s)}
              className={`p-3 rounded-md mb-2 cursor-pointer border transition-colors min-w-0 ${
                selected?.id === s.id
                  ? "bg-gray-800 border-gray-600"
                  : "border-gray-800 hover:bg-gray-900 hover:border-gray-700"
              }`}
            >
              {/* v18: wrap long titles instead of horizontal-scrolling.
                  break-words handles unbroken strings; whitespace-normal
                  overrides any inherited nowrap. */}
              <p className="text-xs text-gray-300 mb-1 whitespace-normal break-words">
                {s.summary || "(no summary)"}
              </p>
              <p className="text-xs text-gray-600">
                {s.updated ? new Date(s.updated).toLocaleString() : ""}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
 
  const DetailPane = (
    <div className="flex flex-col flex-1 overflow-hidden min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800 flex-shrink-0">
        {!isDesktop && (
          <button
            onClick={() => setDetailOpen(false)}
            className="text-xs text-gray-400 hover:text-white px-2 py-1 border border-gray-700 rounded flex-shrink-0"
          >
            ← Back
          </button>
        )}
        <p className="text-xs text-gray-400 flex-1 truncate">{selected?.summary}</p>
        <button
          onClick={resumeSession}
          className={`text-xs bg-${accentColor}-700 hover:bg-${accentColor}-600 text-white px-3 py-1 rounded flex-shrink-0`}
        >
          Resume
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {loading ? (
          <p className="text-xs text-gray-600 text-center mt-8">Loading…</p>
        ) : (
          messages
            .filter((m) => m.role !== "system")
            .map((m, i) => (
              <div
                key={i}
                className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
              >
                <span className="text-xs text-gray-600 mb-1">
                  {m.role === "user" ? username || "you" : "Jeeves"}
                </span>
                <div
                  className={`max-w-xs px-3 py-2 rounded-xl text-xs leading-relaxed ${
                    m.role === "user"
                      ? `bg-${accentColor}-900 text-${accentColor}-100 rounded-br-sm`
                      : "bg-gray-800 text-gray-300 rounded-bl-sm"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  );
 
  if (isDesktop) {
    return (
      <div className="flex flex-1 overflow-hidden h-full" style={{ minHeight: 300 }}>
        <div className="w-56 flex-shrink-0 border-r border-gray-800 flex flex-col overflow-hidden">
          {SessionList}
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          {selected ? (
            DetailPane
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs text-gray-600">Select a session to view</p>
            </div>
          )}
        </div>
      </div>
    );
  }
 
  return (
    <div className="flex flex-col flex-1 overflow-hidden h-full">
      {detailOpen && selected ? DetailPane : SessionList}
    </div>
  );
}
 
export default HistoryPanel;
