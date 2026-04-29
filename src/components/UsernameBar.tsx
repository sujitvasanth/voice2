"use client";

// v18: UsernameBar — optional username with localStorage-backed history.
// - Empty value = anonymous (backward compatible).
// - Past names auto-suggest from a 20-entry rolling list (jeeves_usernames key).
// - Per-entry delete (✕) so users can prune mistakes.
// - Locks while connected so identity stays stable mid-session.
import { useState, useEffect, useRef } from "react";

const STORAGE_KEY = "jeeves_usernames";
const MAX_SAVED = 20;

export function loadSavedNames(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveUsername(name: string) {
  if (!name.trim()) return;
  const names = [name, ...loadSavedNames().filter((n) => n !== name)].slice(0, MAX_SAVED);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
}

function deleteSavedName(name: string) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(loadSavedNames().filter((n) => n !== name))
  );
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  accentColor?: string;
}

export function UsernameBar({ value, onChange, disabled, accentColor = "cyan" }: Props) {
  const [names, setNames] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNames(loadSavedNames());
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = names.filter(
    (n) => n.toLowerCase().startsWith(value.toLowerCase()) && n !== value
  );

  function handleDelete(name: string, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    deleteSavedName(name);
    setNames(loadSavedNames());
  }

  return (
    <div className="flex flex-col gap-1 w-full">
      <label className="text-xs text-gray-500 uppercase tracking-wide">Username</label>
      <div ref={wrapRef} className="relative">
        <input
          type="text"
          value={value}
          disabled={disabled}
          placeholder="Enter username (optional)"
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Persist on blur if the user typed something new.
            if (value.trim()) saveUsername(value.trim());
          }}
          className={`w-full px-3 py-2 rounded-md text-sm bg-gray-900 border border-gray-700 text-white placeholder-gray-600 outline-none focus:border-${accentColor}-500 disabled:opacity-50 disabled:cursor-not-allowed`}
        />
        {open && filtered.length > 0 && !disabled && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-700 rounded-md z-50 max-h-36 overflow-y-auto">
            {filtered.map((name) => (
              <div
                key={name}
                onMouseDown={() => {
                  onChange(name);
                  setOpen(false);
                }}
                className="flex items-center px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-white cursor-pointer"
              >
                <span className="flex-1">{name}</span>
                <button
                  onMouseDown={(e) => handleDelete(name, e)}
                  className="text-xs text-gray-600 hover:text-red-400 px-1 ml-2"
                  aria-label={`Delete ${name}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {!value && !disabled && (
        <p className="text-xs text-gray-600">No username = saved as anonymous</p>
      )}
    </div>
  );
}

export default UsernameBar;
