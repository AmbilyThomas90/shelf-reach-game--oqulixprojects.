import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

const WASM_URL = `${import.meta.env.BASE_URL}mediapipe/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export interface PoseFrame {
  /** 33 normalised landmarks of the first detected person, or null if nobody is visible */
  pose: Array<{ x: number; y: number; z: number; visibility?: number }> | null;
}

interface TrackerOptions {
  kind: 'pose';
  videoRef: RefObject<HTMLVideoElement | null>;
  /** kept for API compatibility with the main app; this build draws nothing on it */
  canvasRef?: RefObject<HTMLCanvasElement | null>;
  enabled: boolean;
  onFrame: (frame: PoseFrame) => void;
}

type TrackerStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Runs MediaPipe Pose Landmarker on the video and calls onFrame for every new video frame. */
export function useTracker({ videoRef, enabled, onFrame }: TrackerOptions) {
  const [status, setStatus] = useState<TrackerStatus>('idle');
  const [error, setError] = useState<{ message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const onFrameRef = useRef(onFrame);

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let raf = 0;
    let landmarker: PoseLandmarker | null = null;
    let lastVideoTime = -1;

    const create = async (delegate: 'GPU' | 'CPU') => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      return PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
    };

    const run = async () => {
      setStatus('loading');
      setError(null);
      try {
        try {
          landmarker = await create('GPU');
        } catch {
          landmarker = await create('CPU');
        }
        if (cancelled) {
          landmarker.close();
          return;
        }
        setStatus('ready');

        const loop = () => {
          const video = videoRef.current;
          if (landmarker && video && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            const result = landmarker.detectForVideo(video, performance.now());
            onFrameRef.current({ pose: result.landmarks[0] ?? null });
          }
          raf = requestAnimationFrame(loop);
        };
        loop();
      } catch (e) {
        if (cancelled) return;
        setError({ message: e instanceof Error ? e.message : 'Could not load the motion tracker.' });
        setStatus('error');
      }
    };

    void run();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      landmarker?.close();
      landmarker = null;
    };
  }, [enabled, attempt, videoRef]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { status, error, retry };
}
