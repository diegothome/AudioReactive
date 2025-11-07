(() => {
  const ch = new BroadcastChannel('ar-controls');

  const $ = (id) => document.getElementById(id);
  const statusEl = $('status');

  const send = (type, payload = {}) => {
    ch.postMessage({ type, ...payload });
    if (statusEl) statusEl.textContent = `Enviado: ${type}`;
  };

  const bgSource = $('bgSource');
  const toggleSpace = $('toggleSpace');
  const youtubeUrlInput = $('youtubeUrl');
  const useYoutubeButton = $('useYoutubeButton');
  const videoBrightness = $('videoBrightness');
  const dirPathInput = $('dirPath');
  const useFolderButton = $('useFolderButton');
  const logoPathInput = $('logoPath');
  const useLogoButton = $('useLogoButton');
  const toggleLogo = $('toggleLogo');
  const spectrumType = $('spectrumType');
  const paletteSelect = $('paletteSelect');
  const sensitivity = $('sensitivity');
  const autoSwap = $('autoSwap');
  const swapInterval = $('swapInterval');
  const bgIntensity = $('bgIntensity');
  const logoSize = $('logoSize');
  const logoOpacity = $('logoOpacity');

  if (bgSource) bgSource.addEventListener('change', (e) => send('setBgSource', { value: e.target.value }));
  if (toggleSpace) toggleSpace.addEventListener('change', (e) => send('toggleSpace', { value: e.target.checked }));
  if (useYoutubeButton) useYoutubeButton.addEventListener('click', () => send('useYoutubeUrl', { url: youtubeUrlInput?.value || '' }));
  if (videoBrightness) videoBrightness.addEventListener('input', (e) => send('setVideoBrightness', { value: parseFloat(e.target.value) }));
  if (useFolderButton) useFolderButton.addEventListener('click', () => send('setDirPathAndUse', { path: dirPathInput?.value || '' }));
  if (useLogoButton) useLogoButton.addEventListener('click', () => send('setLogoPathAndUse', { path: logoPathInput?.value || '' }));
  if (toggleLogo) toggleLogo.addEventListener('change', (e) => send('toggleLogo', { value: e.target.checked }));
  if (spectrumType) spectrumType.addEventListener('change', (e) => send('setSpectrumType', { value: e.target.value }));
  if (paletteSelect) paletteSelect.addEventListener('change', (e) => send('setPalette', { value: e.target.value }));
  if (sensitivity) sensitivity.addEventListener('input', (e) => send('setSensitivity', { value: parseFloat(e.target.value) }));
  if (autoSwap) autoSwap.addEventListener('change', (e) => send('setAutoSwap', { value: e.target.checked }));
  if (swapInterval) swapInterval.addEventListener('input', (e) => send('setSwapInterval', { value: parseInt(e.target.value, 10) }));
  if (bgIntensity) bgIntensity.addEventListener('input', (e) => send('setBgIntensity', { value: parseFloat(e.target.value) }));
  if (logoSize) logoSize.addEventListener('input', (e) => send('setLogoSize', { value: parseFloat(e.target.value) }));
  if (logoOpacity) logoOpacity.addEventListener('input', (e) => send('setLogoOpacity', { value: parseFloat(e.target.value) }));

  // Receber confirmações/estado opcional
  ch.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.type === 'ack') {
      if (statusEl) statusEl.textContent = m.message || 'OK';
    }
  });
})();