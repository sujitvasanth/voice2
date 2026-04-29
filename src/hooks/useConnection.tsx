"use client"

import { useCloud } from "@/cloud/useCloud";
import React, { createContext, useState } from "react";
import { useCallback } from "react";
import { useConfig } from "./useConfig";
import { useToast } from "@/components/toast/ToasterProvider";

export type ConnectionMode = "cloud" | "manual" | "env"

type TokenGeneratorData = {
  shouldConnect: boolean;
  wsUrl: string;
  token: string;
  mode: ConnectionMode;
  disconnect: () => Promise<void>;
  connect: (mode: ConnectionMode, username?: string) => Promise<void>;
  // v18: optional username — passed to /api/token as ?name= so it becomes the LiveKit identity.
  // Stored in localStorage so it persists across refreshes; empty string = anonymous.
  username: string;
  setUsername: (u: string) => void;
};

const ConnectionContext = createContext<TokenGeneratorData | undefined>(undefined);

export const ConnectionProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { generateToken, wsUrl: cloudWSUrl } = useCloud();
  const { setToastMessage } = useToast();
  const { config } = useConfig();
  const [connectionDetails, setConnectionDetails] = useState<{
    wsUrl: string;
    token: string;
    mode: ConnectionMode;
    shouldConnect: boolean;
  }>({ wsUrl: "", token: "", shouldConnect: false, mode: "manual" });

  // v18: persist last-used username; empty string = anonymous (backward-compatible).
  const [username, setUsername] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("jeeves_last_username") || "";
  });

  const connect = useCallback(
    async (mode: ConnectionMode, usernameArg?: string) => {
      let token = "";
      let url = "";
      if (mode === "cloud") {
        try {
          token = await generateToken();
        } catch (error) {
          setToastMessage({
            type: "error",
            message:
              "Failed to generate token, you may need to increase your role in this LiveKit Cloud project.",
          });
        }
        url = cloudWSUrl;
      } else if (mode === "env") {
        if (!process.env.NEXT_PUBLIC_LIVEKIT_URL) {
          throw new Error("NEXT_PUBLIC_LIVEKIT_URL is not set");
        }
        url = process.env.NEXT_PUBLIC_LIVEKIT_URL;
        // v18: pass ?name= so the API can use it as the LiveKit identity.
        // Falls back gracefully — old API ignores the param, new API treats empty/missing as random identity.
        const name = (usernameArg ?? username ?? "").trim();
        if (name && typeof window !== "undefined") {
          localStorage.setItem("jeeves_last_username", name);
        }
        const url_ = name
          ? `/api/token?name=${encodeURIComponent(name)}`
          : "/api/token";
        const { accessToken } = await fetch(url_).then((res) => res.json());
        token = accessToken;
      } else {
        token = config.settings.token;
        url = config.settings.ws_url;
      }
      setConnectionDetails({ wsUrl: url, token, shouldConnect: true, mode });
    },
    [
      cloudWSUrl,
      config.settings.token,
      config.settings.ws_url,
      generateToken,
      setToastMessage,
      username,
    ]
  );

  const disconnect = useCallback(async () => {
    setConnectionDetails((prev) => ({ ...prev, shouldConnect: false }));
  }, []);

  return (
    <ConnectionContext.Provider
      value={{
        wsUrl: connectionDetails.wsUrl,
        token: connectionDetails.token,
        shouldConnect: connectionDetails.shouldConnect,
        mode: connectionDetails.mode,
        connect,
        disconnect,
        username,
        setUsername,
      }}
    >
      {children}
    </ConnectionContext.Provider>
  );
};

export const useConnection = () => {
  const context = React.useContext(ConnectionContext);
  if (context === undefined) {
    throw new Error("useConnection must be used within a ConnectionProvider");
  }
  return context;
}
