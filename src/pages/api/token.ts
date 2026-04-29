// src/pages/api/token.ts — v2
// Accepts optional ?name= query param as LiveKit identity
// Backward compat: missing name → identity = "user"

import { AccessToken } from "livekit-server-sdk";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const apiKey    = process.env.LIVEKIT_API_KEY!;
  const apiSecret = process.env.LIVEKIT_API_SECRET!;
  const roomName = (req.query.room as string)
    || `room-${Math.random().toString(36).slice(2,6)}-${Math.random().toString(36).slice(2,6)}`;

  const identity  = ((req.query.name as string) || "").trim() || "user";

  if (!apiKey || !apiSecret) {
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const at = new AccessToken(apiKey, apiSecret, { identity });
  at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
  res.json({ accessToken: await at.toJwt() });
}
