export type CameraErrorCode =
  | 'insecure-context'
  | 'permission-denied'
  | 'no-device'
  | 'in-use'
  | 'unknown';

export interface CameraError {
  code: CameraErrorCode;
  message: string;
}

export interface CameraGuidance {
  title: string;
  message: string;
  hints: string[];
}

export function describeCameraError(error: CameraError): CameraGuidance {
  switch (error.code) {
    case 'insecure-context':
      return {
        title: 'Secure connection needed',
        message: 'Browsers only allow the camera on https:// pages (or localhost).',
        hints: ['Open the https:// link of this game.', 'On your own PC, use http://localhost:5173.'],
      };
    case 'permission-denied':
      return {
        title: 'Camera access is blocked',
        message: 'Please allow camera access so the game can follow your arm movements.',
        hints: [
          'Click the camera or lock icon in the address bar and choose Allow.',
          'Then press Try again.',
          'Your video never leaves your device.',
        ],
      };
    case 'no-device':
      return {
        title: 'No camera found',
        message: 'We could not find a webcam on this device.',
        hints: ['Check that a webcam is connected and enabled.', 'Then press Try again.'],
      };
    case 'in-use':
      return {
        title: 'Camera is busy',
        message: 'Another app or tab is using the camera.',
        hints: ['Close other apps or tabs that use the webcam (Zoom, Teams, Camera app).', 'Then press Try again.'],
      };
    default:
      return {
        title: 'Camera problem',
        message: error.message || 'The camera could not be started.',
        hints: ['Reload the page and try again.'],
      };
  }
}
