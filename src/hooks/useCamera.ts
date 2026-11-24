import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { CameraError, CameraErrorCode } from '@/services/camera/errorMessages';

export type CameraStatus = 'idle' | 'starting' | 'active' | 'error';

function toError(e: unknown): CameraError {
  const name = e instanceof DOMException || e instanceof Error ? e.name : '';
  const message = e instanceof Error ? e.message : 'Camera error';
  let code: CameraErrorCode = 'unknown';
  if (name === 'NotAllowedError' || name === 'SecurityError') code = 'permission-denied';
  else if (name === 'NotFoundError' || name === 'OverconstrainedError') code = 'no-device';
  else if (name === 'NotReadableError' || name === 'AbortError') code = 'in-use';
  return { code, message };
}

/** Starts the webcam and attaches it to the given <video> element. */
export function useCamera(videoRef: RefObject<HTMLVideoElement | null>) {
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [error, setError] = useState<CameraError | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startingRef = useRef(false);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError({ code: 'insecure-context', message: 'Camera needs https:// or localhost.' });
      setStatus('error');
      return;
    }
    // React dev mode runs effects twice; never open the webcam twice at the same time
    if (startingRef.current) return;
    startingRef.current = true;
    releaseStream();
    setError(null);
    setStatus('starting');
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false,
        });
      } catch {
        // some webcams reject the size hints - retry with plain defaults
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error('Video element is not ready');
      video.srcObject = stream;
      await video.play();
      setStatus('active');
    } catch (e) {
      releaseStream();
      setError(toError(e));
      setStatus('error');
    } finally {
      startingRef.current = false;
    }
  }, [videoRef, releaseStream]);

  const stop = useCallback(() => {
    releaseStream();
    setStatus('idle');
  }, [releaseStream]);

  // stop the camera light when the page unmounts
  useEffect(() => releaseStream, [releaseStream]);

  return useMemo(() => ({ status, error, start, stop }), [status, error, start, stop]);
}