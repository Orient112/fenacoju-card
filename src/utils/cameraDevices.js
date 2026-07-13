export function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent || '';
  const mobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const coarsePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const narrowScreen = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;

  return mobileUa || (coarsePointer && narrowScreen);
}

export function classifyCameraFacing(label = '') {
  const value = label.toLowerCase();
  if (/back|rear|environment|arrière|traseira|trás/i.test(value)) return 'environment';
  if (/front|user|face|selfie|avant|facial|frontal/i.test(value)) return 'user';
  return 'unknown';
}

export function findCameraByFacing(cameras, facing) {
  if (!cameras?.length) return null;

  const byLabel = cameras.find((camera) => classifyCameraFacing(camera.label) === facing);
  if (byLabel) return byLabel;

  if (cameras.length >= 2) {
    if (facing === 'environment') return cameras[cameras.length - 1];
    if (facing === 'user') return cameras[0];
  }

  return facing === 'user' ? cameras[0] : cameras[cameras.length - 1];
}

export function pickDesktopCamera(cameras) {
  if (!cameras?.length) return null;

  const physical = cameras.filter((camera) => !/virtual|obs|snap camera|manycam|xsplit|camo/i.test(camera.label));
  const pool = physical.length ? physical : cameras;

  const preferred = pool.find((camera) =>
    /integrated|built-in|internal|facetime|hd webcam|webcam|usb|logitech|camera|video/i.test(camera.label)
  );

  return preferred || pool[0];
}

export function getCameraStartTarget(cameras, facing) {
  const camera = findCameraByFacing(cameras, facing);
  if (camera?.id) return camera.id;
  return { facingMode: facing };
}

export function getCameraDisplayName(cameras, startTarget) {
  if (!startTarget) return 'Caméra par défaut';

  if (typeof startTarget === 'string') {
    const match = cameras.find((camera) => camera.id === startTarget);
    if (match?.label) return match.label;
    return 'Caméra sélectionnée';
  }

  if (startTarget.facingMode === 'user') return 'Caméra avant';
  if (startTarget.facingMode === 'environment') return 'Caméra arrière';
  return 'Caméra par défaut';
}
