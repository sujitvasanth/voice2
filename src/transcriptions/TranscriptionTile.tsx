import { ChatMessageType, ChatTile } from "@/components/chat/ChatTile";
import {
  TrackReferenceOrPlaceholder,
  useChat,
  useDataChannel,
  useLocalParticipant,
  useTrackTranscription,
} from "@livekit/components-react";
import {
  LocalParticipant,
  Participant,
  Track,
  TranscriptionSegment,
} from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";

export function TranscriptionTile({
  agentAudioTrack,
  accentColor,
}: {
  agentAudioTrack: TrackReferenceOrPlaceholder;
  accentColor: string;
}) {
  const agentMessages = useTrackTranscription(agentAudioTrack);
  const localParticipant = useLocalParticipant();
  const localMessages = useTrackTranscription({
    publication: localParticipant.microphoneTrack,
    source: Track.Source.Microphone,
    participant: localParticipant.localParticipant,
  });
  const [transcripts, setTranscripts] = useState<Map<string, ChatMessageType>>(new Map());
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const { chatMessages, send: sendChat } = useChat();

  const asrTranscripts = useRef<Map<string, ChatMessageType>>(new Map());
  const [asrTick, setAsrTick] = useState(0);

  const onAsrData = useCallback((msg: { payload: Uint8Array; topic?: string }) => {
    try {
      const data = JSON.parse(new TextDecoder().decode(msg.payload));
      asrTranscripts.current.set(data.id, {
        name: "You",
        message: data.message,
        timestamp: data.timestamp,
        isSelf: true,
      });
      setAsrTick(t => t + 1);
    } catch {}
  }, []);

  useDataChannel("asr-user-input", onAsrData);

  useEffect(() => {
    agentMessages.segments.forEach((s) =>
      transcripts.set(s.id, segmentToChatMessage(s, transcripts.get(s.id), agentAudioTrack.participant))
    );
    localMessages.segments.forEach((s) =>
      transcripts.set(s.id, segmentToChatMessage(s, transcripts.get(s.id), localParticipant.localParticipant))
    );

    const allMessages = Array.from(transcripts.values());
    asrTranscripts.current.forEach((msg) => allMessages.push(msg));

    for (const msg of chatMessages) {
      const isAgent = msg.from?.identity === agentAudioTrack.participant?.identity;
      const isSelf = msg.from?.identity === localParticipant.localParticipant.identity;
      if (msg.message.startsWith("🎤")) continue;
      let name = msg.from?.name;
      if (!name) {
        if (isAgent) name = "Agent";
        else if (isSelf) name = "You";
        else name = "Unknown";
      }
      allMessages.push({ name, message: msg.message, timestamp: msg.timestamp, isSelf });
    }

    allMessages.sort((a, b) => a.timestamp - b.timestamp);
    setMessages(allMessages);
  }, [
    transcripts,
    chatMessages,
    asrTick,
    localParticipant.localParticipant,
    agentAudioTrack.participant,
    agentMessages.segments,
    localMessages.segments,
  ]);

  return (
    <ChatTile messages={messages} accentColor={accentColor} onSend={sendChat} />
  );
}

function segmentToChatMessage(
  s: TranscriptionSegment,
  existingMessage: ChatMessageType | undefined,
  participant: Participant
): ChatMessageType {
  return {
    message: s.final ? s.text : `${s.text} ...`,
    name: participant instanceof LocalParticipant ? "You" : "Agent",
    isSelf: participant instanceof LocalParticipant,
    timestamp: existingMessage?.timestamp ?? Date.now(),
  };
}
