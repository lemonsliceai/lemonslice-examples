import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ConnectionState,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { SLOT_OPTIONS, weekSlotsAroundSelection } from "../data/availability";
import type { SidebarState, TranscriptInterim, TranscriptLine } from "../demoTypes";
import { DemoConfirmationModal, type DemoConfirmation } from "./DemoConfirmationModal";

type Props = {
  room: Room | null;
  connectionState: ConnectionState;
  sidebar: SidebarState;
  avatarJoined: boolean;
  transcript: TranscriptLine[];
  interim: TranscriptInterim;
  onDisconnect: () => void;
  sendUiEvent: (p: Record<string, unknown>) => Promise<void>;
  sendChat: (text: string) => Promise<void>;
  micEnabled: boolean;
  onToggleMicrophone: () => void;
};

export function AgentSidebar({
  room,
  connectionState,
  sidebar,
  avatarJoined,
  transcript,
  interim,
  onDisconnect,
  sendUiEvent,
  sendChat,
  micEnabled,
  onToggleMicrophone,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  /** Calendar strip anchored to connect time; shifts only when agent picks a day outside that window. */
  const scheduleAnchorRef = useRef(new Date());
  const live = connectionState === ConnectionState.Connected;
  const week = useMemo(
    () => weekSlotsAroundSelection(sidebar.selected_date, scheduleAnchorRef.current),
    [sidebar.selected_date],
  );
  const [pickIso, setPickIso] = useState<string>(() => week[0]?.iso ?? "");
  const [pickSlot, setPickSlot] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [finishedDemo, setFinishedDemo] = useState<DemoConfirmation | null>(null);
  const [confirmPending, setConfirmPending] = useState(false);
  const reopenRafRef = useRef<number | null>(null);

  const showFinishedDemo = useCallback((next: DemoConfirmation) => {
    if (reopenRafRef.current != null) {
      window.cancelAnimationFrame(reopenRafRef.current);
      reopenRafRef.current = null;
    }
    // Force an unmount/remount so the entrance animation replays every time.
    setFinishedDemo(null);
    reopenRafRef.current = window.requestAnimationFrame(() => {
      setFinishedDemo(next);
      reopenRafRef.current = null;
    });
  }, []);

  useEffect(() => {
    if (sidebar.selected_date) setPickIso(sidebar.selected_date.trim());
  }, [sidebar.selected_date]);

  useEffect(() => {
    if (sidebar.selected_slot) setPickSlot(sidebar.selected_slot.trim());
  }, [sidebar.selected_slot]);

  useEffect(() => {
    if (sidebar.confirmed) setConfirmPending(false);
  }, [sidebar.confirmed]);

  useEffect(() => {
    if (
      sidebar.stage === "done" &&
      sidebar.confirmed &&
      sidebar.email &&
      sidebar.selected_date &&
      sidebar.selected_slot
    ) {
      showFinishedDemo({
        email: sidebar.email,
        selected_date: sidebar.selected_date,
        selected_slot: sidebar.selected_slot,
      });
    }
  }, [
    showFinishedDemo,
    sidebar.stage,
    sidebar.confirmed,
    sidebar.email,
    sidebar.selected_date,
    sidebar.selected_slot,
  ]);

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const isShortcut =
        (ev.metaKey || ev.ctrlKey) &&
        ev.shiftKey &&
        ev.key.toLowerCase() === "k";
      if (!isShortcut) return;
      ev.preventDefault();
      const fallbackIso = pickIso || week[0]?.iso || new Date().toISOString().slice(0, 10);
      showFinishedDemo({
        email: sidebar.email ?? "bryce@lemonslice.com",
        selected_date: sidebar.selected_date ?? fallbackIso,
        selected_slot: sidebar.selected_slot ?? pickSlot ?? SLOT_OPTIONS[0]?.label ?? "1:00 pm",
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pickIso, pickSlot, showFinishedDemo, sidebar.email, sidebar.selected_date, sidebar.selected_slot, week]);

  useEffect(() => {
    return () => {
      if (reopenRafRef.current != null) {
        window.cancelAnimationFrame(reopenRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [transcript, interim, sidebar]);

  useEffect(() => {
    const el = videoRef.current;
    if (!room || !el) return;

    const attach = (track: RemoteTrack) => {
      track.attach(el);
    };

    const tryAttach = (participant: RemoteParticipant) => {
      if (!participant.identity?.includes("lemonslice")) return;
      participant.trackPublications.forEach((pub) => {
        if (pub.track?.kind === Track.Kind.Video) attach(pub.track as RemoteTrack);
      });
    };

    const onTrack = (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
      if (track.kind !== Track.Kind.Video) return;
      if (!participant.identity?.includes("lemonslice")) return;
      attach(track);
    };

    room.on(RoomEvent.TrackSubscribed, onTrack);
    for (const p of room.remoteParticipants.values()) tryAttach(p);

    return () => {
      room.off(RoomEvent.TrackSubscribed, onTrack);
      el.srcObject = null;
    };
  }, [room, avatarJoined]);

  const schedulingDone = sidebar.stage === "done" && sidebar.confirmed;
  const showSchedule =
    (sidebar.stage === "schedule" || sidebar.stage === "done") && !schedulingDone;

  const submitMessage = () => {
    const t = messageDraft.trim();
    if (!t) return;
    setMessageDraft("");
    void sendChat(t);
  };

  return (
    <aside className="flex h-full min-h-0 w-[300px] lg:w-[400px]  shrink-0 flex-col overflow-hidden border-l border-border bg-sidebar">


      {live && avatarJoined ? (
        <>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 px-6 pt-6">
              <div className="relative w-full aspect-[3/2] shrink-0 overflow-hidden rounded-xl bg-black/10">
                <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
                <p className="text-white text-center text-[15px] font-semibold absolute top-2 left-3 z-10">Alex</p>
              </div>
            </div>
            <div
              ref={chatScrollRef}
              className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-7 pb-4 pt-3"
            >
            {transcript.map((line) =>
              line.role === "user" ? (
                <div key={line.id} className="max-w-[85%] self-end rounded-[10px] bg-bubble px-4 py-3 text-[15px]">
                  {line.text}
                </div>
              ) : (
                <div key={line.id} className="max-w-full self-start text-[15px] leading-[1.45] text-accent">
                  {line.text}
                </div>
              ),
            )}
            {interim.user ? (
              <div className="max-w-[85%] self-end rounded-[10px] bg-bubble px-4 py-3 text-[15px] opacity-55">{interim.user}</div>
            ) : null}
            {interim.agent ? (
              <div className="max-w-full self-start text-[15px] leading-[1.45] text-accent opacity-55">{interim.agent}</div>
            ) : null}

            {showSchedule ? (
              <div className="flex flex-col gap-1 pt-1">
                <div className=" flex items-center justify-between text-[15px] font-semibold">
                  <button type="button" className="cursor-pointer border-0 bg-transparent p-1" aria-label="prev month">
                    ‹
                  </button>
                  <span>{week[0]?.date.toLocaleDateString("en-US", { month: "long" })}</span>
                  <button type="button" className="cursor-pointer border-0 bg-transparent p-1" aria-label="next month">
                    ›
                  </button>
                </div>
                <div className=" flex gap-1">
                  {week.map((d) => (
                    <button
                      key={d.iso}
                      type="button"
                      className={`min-w-0 flex-1 cursor-pointer rounded-[10px]  px-1 text-center font-sans ${
                        pickIso === d.iso ? "border-2 border-accent bg-black/10" : "border-2 border-transparent"
                      }`}
                      onClick={() => {
                        setPickIso(d.iso);
                        setPickSlot(null);
                      }}
                    >
                      <span className="block text-[24px] font-bold">{d.labelNum}</span>
                      <span className="block text-[11px] text-muted font-bold mt-[-6px] mb-1">{d.labelDay}</span>
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2 pt-3">
                  {SLOT_OPTIONS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`cursor-pointer rounded-lg border  px-2 py-2 font-sans text-sm ${
                        pickSlot === s.label ? "border-2 border-accent bg-black/10" : "border-border"
                      }`}
                      onClick={() => {
                        setPickSlot(s.label);
                        void sendUiEvent({
                          event: "slot_selected",
                          date: pickIso,
                          slot: s.label,
                        });
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-3 inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] border-0 bg-accent text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!pickIso || !pickSlot || confirmPending}
                  aria-busy={confirmPending}
                  onClick={() => {
                    setConfirmPending(true);
                    void sendUiEvent({ event: "confirm_clicked" }).catch(() => setConfirmPending(false));
                  }}
                >
                  {confirmPending ? (
                    <>
                      <span
                        className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white border-t-transparent"
                        aria-hidden
                      />
                      Confirming…
                    </>
                  ) : (
                    "Confirm"
                  )}
                </button>
              </div>
            ) : null}

            {/* {sidebar.confirmed ? (
              <p className="max-w-full self-start text-[15px] leading-[1.45] text-accent">You&apos;re all set — talk soon!</p>
            ) : null} */}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 px-7 pb-5">
            <input
              value={messageDraft}
              onChange={(e) => setMessageDraft(e.target.value)}
              placeholder="Message"
              aria-label="Message"
              className="h-12 flex-1 rounded-[10px] border border-border bg-white focus:outline-accent/50 px-3.5 font-sans text-[15px]"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitMessage();
                }
              }}
            />
            <button
              type="button"
              className={`flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-border bg-white ${micEnabled ? "" : "text-muted"}`}
              aria-label={micEnabled ? "Mute microphone" : "Unmute microphone"}
              aria-pressed={!micEnabled}
              onClick={() => onToggleMicrophone()}
            >
              {micEnabled ? (
                <Mic className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
              ) : (
                <MicOff className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
              )}
            </button>
            <button
              type="button"
              className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-danger text-white"
              aria-label="Leave call"
              onClick={() => void onDisconnect()}
            >
              <PhoneOff className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
            </button>
          </div>
        </>
      ) : null}

      {finishedDemo ? (
        <DemoConfirmationModal
          confirmation={finishedDemo}
          onDismiss={() => {
            setFinishedDemo(null);
            void onDisconnect();
          }}
        />
      ) : null}
    </aside>
  );
}
