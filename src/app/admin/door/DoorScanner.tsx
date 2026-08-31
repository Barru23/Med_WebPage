"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { checkIn, type CheckInResult } from "@/lib/admin/actions/door";

type ResultState = { result: CheckInResult; at: number } | null;

export default function DoorScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const scanningRef = useRef(true);
  const lastCodeRef = useRef<string | null>(null);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [resultState, setResultState] = useState<ResultState>(null);
  const [manualCode, setManualCode] = useState("");
  const [pending, setPending] = useState(false);

  const runCheckIn = useCallback(async (code: string) => {
    scanningRef.current = false;
    setPending(true);
    const result = await checkIn(code);
    setPending(false);
    setResultState({ result, at: Date.now() });
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setCameraError("No s'ha pogut obrir la càmera. Fes servir el codi manual.");
        return;
      }

      const tick = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video && canvas && scanningRef.current && video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code && code.data && code.data !== lastCodeRef.current) {
              lastCodeRef.current = code.data;
              runCheckIn(code.data);
            }
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }

    start();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [runCheckIn]);

  function resume() {
    lastCodeRef.current = null;
    setResultState(null);
    scanningRef.current = true;
  }

  if (resultState) {
    const { result } = resultState;
    const tone = !result.ok ? "bg-signal" : result.already ? "bg-deep" : "bg-ink";
    return (
      <div className={`flex min-h-[70vh] flex-col items-center justify-center gap-4 ${tone} p-6 text-center text-bone`}>
        <p className="font-mono text-xs uppercase tracking-[0.2em] opacity-80">
          {!result.ok
            ? result.reason === "not_found"
              ? "Codi no trobat"
              : "Comanda no pagada"
            : result.already
              ? "Ja s'havia escanejat"
              : "Entrada vàlida"}
        </p>
        {result.ok && (
          <>
            <p className="font-display text-4xl leading-tight">{result.buyer}</p>
            <p className="font-mono text-sm">
              {result.activity} · {result.variant} ×{result.quantity}
            </p>
          </>
        )}
        <button
          type="button"
          onClick={resume}
          className="mt-4 border-2 border-bone px-6 py-3 font-mono text-sm uppercase tracking-widest"
        >
          Escanejar un altre
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-square w-full max-w-sm self-center overflow-hidden border border-sand bg-ink">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
        <canvas ref={canvasRef} className="hidden" />
        {pending && (
          <div className="absolute inset-0 flex items-center justify-center bg-ink/60 font-mono text-sm text-bone">
            Comprovant…
          </div>
        )}
      </div>

      {cameraError && <p className="text-center font-mono text-xs text-signal">{cameraError}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (manualCode.trim()) {
            runCheckIn(manualCode.trim());
            setManualCode("");
          }
        }}
        className="flex items-center gap-2 self-center"
      >
        <input
          className="admin-input w-40 text-center font-mono uppercase"
          placeholder="CODI MANUAL"
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
        />
        <button type="submit" className="admin-btn">
          Comprova
        </button>
      </form>
    </div>
  );
}
