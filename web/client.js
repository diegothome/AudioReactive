const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Variáveis globais que precisam existir antes de resize/init
var bgIntensity = 0.5;
var starfield = [];
var useSpaceBG = true;
var bgImage = null;
var overlayImage = null;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  initStarfield();
}
window.addEventListener('resize', resize);
resize();

const levels = { low: 0, mid: 0, high: 0 };
let ws = null;
let useWSFallback = false;

// UI elements
const micButton = document.getElementById('micButton');
const statusEl = document.getElementById('status');
const spectrumTypeSelect = document.getElementById('spectrumType');
const paletteSelect = document.getElementById('paletteSelect');
const sensitivityRange = document.getElementById('sensitivity');
const bgSourceSelect = document.getElementById('bgSource');
const toggleSpace = document.getElementById('toggleSpace');
const bgIntensityRange = document.getElementById('bgIntensity');
const dirPathInput = document.getElementById('dirPath');
const useFolderButton = document.getElementById('useFolderButton');
const autoSwapToggle = document.getElementById('autoSwap');
const swapIntervalRange = document.getElementById('swapInterval');
// YouTube elements
const youtubeUrlInput = document.getElementById('youtubeUrl');
const useYoutubeButton = document.getElementById('useYoutubeButton');
const youtubeFrame = document.getElementById('youtubeFrame');
const videoLayer = document.getElementById('videoLayer');
// Logo Vetorial
const logoPathInput = document.getElementById('logoPath');
const useLogoButton = document.getElementById('useLogoButton');
const toggleLogo = document.getElementById('toggleLogo');
const logoSizeRange = document.getElementById('logoSize');
const logoOpacityRange = document.getElementById('logoOpacity');
// Menu
const menuButton = document.getElementById('menuButton');
const controlsPanel = document.getElementById('controls');
const modalBackdrop = document.getElementById('modalBackdrop');
const closeModalButton = document.getElementById('closeModal');
const openControlButton = document.getElementById('openControl');
// Vídeo brightness
const videoBrightnessRange = document.getElementById('videoBrightness');
// HUD (Grave, Médio, Agudo)
const hudEl = document.getElementById('hud');

function setStatus(text, type = 'info') {
  statusEl.textContent = text;
  statusEl.style.color = type === 'error' ? '#ff7043' : '#e8eaed';
}

function updateBars() {
  const lowBar = document.getElementById('bar-low');
  const midBar = document.getElementById('bar-mid');
  const highBar = document.getElementById('bar-high');

  const clamp = (v) => Math.max(0.1, Math.min(1, v));
  lowBar.style.setProperty('--scale', clamp(levels.low));
  midBar.style.setProperty('--scale', clamp(levels.mid));
  highBar.style.setProperty('--scale', clamp(levels.high));

  // Atualiza transform via pseudo-elemento
  lowBar.style.setProperty('--level', clamp(levels.low));
  midBar.style.setProperty('--level', clamp(levels.mid));
  highBar.style.setProperty('--level', clamp(levels.high));

  // Como estamos usando ::after, aplicamos via style.transform na barra inteira (CSS fallback)
  lowBar.style.transform = `scaleX(${clamp(levels.low)})`;
  midBar.style.transform = `scaleX(${clamp(levels.mid)})`;
  highBar.style.transform = `scaleX(${clamp(levels.high)})`;
}

let t = 0;
let audioCtx = null;
let analyser = null;
let freqData = null;
let sampleRate = 48000;
let peakLow = 1e-6, peakMid = 1e-6, peakHigh = 1e-6;
const emaAlpha = 0.3; // suavização mais responsiva
let freqByte = null;
let spectrumType = 'linear';
let palette = 'rainbow';
let sensMult = parseFloat(sensitivityRange?.value || '1.6');
useSpaceBG = true;
let showLogo = true;
bgIntensity = 0.5;
starfield = [];
bgImage = null;
overlayImage = null;
let youtubeActive = false;
let bgSource = 'images';
let videoMoveStrength = 20; // pixels base de deslocamento
let videoZoomStrength = 0.12; // fator de zoom base
let baseVideoBrightness = 1.1; // brilho base ajustável
let logoScaleBase = parseFloat(logoSizeRange?.value || '1.20');
let logoOpacity = parseFloat(logoOpacityRange?.value || '0.90');

// Alterna layout do HUD conforme tipo de espectro
function applyLayoutForSpectrumType() {
  if (!hudEl) return;
  if (spectrumType === 'none') {
    // Oculta HUD quando nenhum espectro deve ser mostrado
    hudEl.style.display = 'none';
  } else {
    // Mostra HUD e ajusta layout
    hudEl.style.display = 'grid';
    if (spectrumType === 'linear') {
      hudEl.classList.add('right');
    } else {
      hudEl.classList.remove('right');
    }
  }
}
// Inicializa posição do HUD
applyLayoutForSpectrumType();

// Posiciona botões (mic/openControl) acima do label "Grave" no HUD
function setupHudActions() {
  try {
    const mic = document.getElementById('micButton');
    const open = document.getElementById('openControl');
    const hud = document.getElementById('hud');
    if (!mic || !open || !hud) return;
    let actions = document.getElementById('hudActions');
    if (!actions) {
      actions = document.createElement('div');
      actions.id = 'hudActions';
      actions.className = 'hud-actions';
      hud.insertBefore(actions, hud.firstChild);
    } else if (actions.parentElement !== hud) {
      hud.insertBefore(actions, hud.firstChild);
    }
    actions.appendChild(mic);
    actions.appendChild(open);
    // Estado inicial oculto
    actions.style.opacity = '0';
    actions.style.pointerEvents = 'none';
  } catch (e) {
    console.warn('setupHudActions falhou:', e);
  }
}
setupHudActions();

function startWebSocketFallback() {
  useWSFallback = true;
  ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onmessage = (ev) => {
    const data = JSON.parse(ev.data);
    levels.low = data.low ?? 0;
    levels.mid = data.mid ?? 0;
    levels.high = data.high ?? 0;
    updateBars();
  };
  ws.onopen = () => setStatus('Usando níveis do servidor (fallback WebSocket)');
  ws.onclose = () => console.warn('WebSocket desconectado');
}

async function startMic() {
  try {
    setStatus('Solicitando permissão de microfone...');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    sampleRate = audioCtx.sampleRate;
    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.7;
    freqData = new Float32Array(analyser.frequencyBinCount);
    freqByte = new Uint8Array(analyser.frequencyBinCount);
    source.connect(analyser);
    setStatus(`Microfone ativo (SR=${sampleRate}Hz)`);
    useWSFallback = false;
  } catch (err) {
    console.error('Erro ao acessar microfone:', err);
    setStatus('Erro ao acessar microfone. Usando fallback do servidor.', 'error');
    startWebSocketFallback();
  }
}

micButton.addEventListener('click', () => {
  startMic();
});

function toEmbedUrl(url) {
  try {
    let id = null;
    const u = new URL(url);
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname.startsWith('/watch')) {
        id = u.searchParams.get('v');
      } else if (u.pathname.startsWith('/shorts/')) {
        id = u.pathname.split('/')[2];
      } else if (u.pathname.startsWith('/embed/')) {
        id = u.pathname.split('/')[2];
      }
    } else if (u.hostname.includes('youtu.be')) {
      id = u.pathname.split('/')[1];
    }
    if (!id) return null;
    return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&loop=1&playlist=${id}`;
  } catch (e) {
    return null;
  }
}

function getEmbedVideoId(src) {
  try {
    const u = new URL(src);
    if (u.hostname.includes('youtube.com') && u.pathname.startsWith('/embed/')) {
      return u.pathname.split('/')[2] || null;
    }
  } catch (e) { /* ignore */ }
  return null;
}

function setVideoVisible(visible) {
  videoLayer.style.opacity = visible ? '1' : '0';
  videoLayer.style.transition = 'opacity 200ms ease';
}

function forceVideoReflow() {
  if (!youtubeFrame) return;
  const prev = youtubeFrame.style.display;
  youtubeFrame.style.display = 'none';
  // força reflow
  void youtubeFrame.offsetHeight;
  youtubeFrame.style.display = prev || 'block';
}

function updateVideoTransform() {
  if (!youtubeActive) return;
  // Vídeo estático: sem deslocamento/zoom reativo
  youtubeFrame.style.transform = 'translate(0px, 0px) scale(1)';
  // Brilho fixo baseado apenas no slider
  youtubeFrame.style.filter = `brightness(${baseVideoBrightness})`;
}

useYoutubeButton.addEventListener('click', () => {
  const url = youtubeUrlInput.value.trim();
  const embed = toEmbedUrl(url);
  if (!embed) {
    setStatus('URL do YouTube inválida. Use watch/shorts/compartilhamento.', 'error');
    return;
  }
  const currentId = getEmbedVideoId(youtubeFrame.src || '');
  const newId = getEmbedVideoId(embed);
  youtubeActive = true;
  bgSource = 'video';
  if (bgSourceSelect) bgSourceSelect.value = 'video';
  // garante visibilidade imediata
  requestAnimationFrame(() => {
    setVideoVisible(true);
    forceVideoReflow();
  });
  // Pausa imagens da pasta
  localFolderActive = false;
  stopAutoSwap();
  if (!currentId || currentId !== newId) {
    youtubeFrame.src = embed;
    setStatus('Vídeo do YouTube carregado como fundo.');
  } else {
    setStatus('Voltando ao vídeo atual sem reiniciar.');
  }
});
spectrumTypeSelect.addEventListener('change', (e) => { spectrumType = e.target.value; applyLayoutForSpectrumType(); });
paletteSelect.addEventListener('change', (e) => { palette = e.target.value; });
sensitivityRange.addEventListener('input', (e) => { sensMult = parseFloat(e.target.value); });
bgIntensityRange.addEventListener('input', (e) => { bgIntensity = parseFloat(e.target.value); initStarfield(); });
videoBrightnessRange.addEventListener('input', (e) => { baseVideoBrightness = parseFloat(e.target.value); });
toggleSpace.addEventListener('change', (e) => { useSpaceBG = e.target.checked; if (useSpaceBG && starfield.length === 0) initStarfield(); });
if (logoSizeRange) logoSizeRange.addEventListener('input', (e) => { logoScaleBase = parseFloat(e.target.value); });
if (logoOpacityRange) logoOpacityRange.addEventListener('input', (e) => { logoOpacity = parseFloat(e.target.value); });
bgSourceSelect.addEventListener('change', async (e) => {
  const v = e.target.value;
  bgSource = v;
  if (v === 'video') {
    youtubeActive = true;
    // Desativa o fundo espaço por padrão ao usar vídeo
    useSpaceBG = false;
    if (toggleSpace) toggleSpace.checked = false;
    // garante visibilidade imediata
    requestAnimationFrame(() => {
      setVideoVisible(true);
      forceVideoReflow();
    });
    localFolderActive = false;
    stopAutoSwap();
    if (!youtubeFrame.src && youtubeUrlInput.value.trim()) {
      const embed = toEmbedUrl(youtubeUrlInput.value.trim());
      if (embed) youtubeFrame.src = embed;
    }
    setStatus('Fundo: Vídeo YouTube.');
  } else { // images
    youtubeActive = false;
    setVideoVisible(false);
    localFolderActive = true;
    const p = dirPathInput.value.trim();
    if (p) {
      try {
        await setLocalFolder(p);
        await fetchRandomImageToBackground();
        setStatus('Fundo: Imagens da pasta.');
      } catch (err) {
        setStatus('Erro ao ativar imagens da pasta.', 'error');
      }
    }
  }
});

// Ao carregar o iframe, garanta que fique visível
if (youtubeFrame) {
  youtubeFrame.addEventListener('load', () => {
    youtubeActive = true;
    setVideoVisible(true);
    forceVideoReflow();
    setStatus('Vídeo do YouTube pronto.');
  });
}
if (menuButton) menuButton.addEventListener('click', () => {
  window.open('control.html', '_blank');
});
// Removemos o comportamento de modal; controles ficam apenas na outra aba
if (openControlButton) openControlButton.addEventListener('click', () => {
  window.open('control.html', '_blank');
});
if (openControlButton) openControlButton.addEventListener('click', () => {
  window.open('control.html', '_blank');
});

// Oculta botões quando o mouse não está em movimento; mostra ao mover
(function setupHideOnInactivity() {
  const actions = document.getElementById('hudActions');
  if (!actions) return;
  let hideTimer = null;
  const show = () => {
    actions.style.opacity = '1';
    actions.style.pointerEvents = 'auto';
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      actions.style.opacity = '0';
      actions.style.pointerEvents = 'none';
    }, 1200);
  };
  document.addEventListener('mousemove', show, { passive: true });
  document.addEventListener('touchstart', show, { passive: true });
})();

// Comunicação entre abas via BroadcastChannel
const controlChannel = new BroadcastChannel('ar-controls');
controlChannel.addEventListener('message', async (e) => {
  const m = e.data || {};
  try {
    switch (m.type) {
      case 'setBgSource': {
        const sel = document.getElementById('bgSource');
        if (sel) {
          sel.value = m.value;
          sel.dispatchEvent(new Event('change'));
        }
        break;
      }
      case 'toggleSpace': {
        const cb = document.getElementById('toggleSpace');
        if (cb) cb.checked = !!m.value;
        useSpaceBG = !!m.value;
        if (useSpaceBG && starfield.length === 0) initStarfield();
        break;
      }
      case 'useYoutubeUrl': {
        const input = document.getElementById('youtubeUrl');
        const frame = document.getElementById('youtubeFrame');
        if (input && frame) {
          input.value = m.url || '';
          const embed = typeof toEmbedUrl === 'function' ? toEmbedUrl(input.value) : input.value;
          if (!embed) { setStatus('URL do YouTube inválida.', 'error'); break; }
          const currentId = typeof getEmbedVideoId === 'function' ? getEmbedVideoId(frame.src || '') : null;
          const newId = typeof getEmbedVideoId === 'function' ? getEmbedVideoId(embed) : null;
          const sel = document.getElementById('bgSource');
          if (sel) {
            sel.value = 'video';
            sel.dispatchEvent(new Event('change'));
          }
          if (!currentId || currentId !== newId) {
            frame.src = embed;
            setStatus('Vídeo do YouTube carregado como fundo.');
          } else {
            setStatus('Voltando ao vídeo atual sem reiniciar.');
          }
        }
        break;
      }
      case 'setVideoBrightness': {
        const rng = document.getElementById('videoBrightness');
        if (rng) rng.value = String(m.value);
        if (typeof baseVideoBrightness !== 'undefined') baseVideoBrightness = Number(m.value);
        break;
      }
      case 'setDirPathAndUse': {
        const input = document.getElementById('dirPath');
        const btn = document.getElementById('useFolderButton');
        if (input) input.value = m.path || '';
        if (btn) btn.click();
        break;
      }
      case 'setLogoPathAndUse': {
        const input = document.getElementById('logoPath');
        const btn = document.getElementById('useLogoButton');
        if (input) input.value = m.path || '';
        if (btn) btn.click();
        break;
      }
      case 'toggleLogo': {
        const cb = document.getElementById('toggleLogo');
        const val = !!m.value;
        if (cb) cb.checked = val;
        showLogo = val;
        break;
      }
      case 'setLogoSize': {
        const rng = document.getElementById('logoSize');
        if (rng) rng.value = String(m.value);
        if (typeof logoScaleBase !== 'undefined') logoScaleBase = Number(m.value);
        break;
      }
      case 'setLogoOpacity': {
        const rng = document.getElementById('logoOpacity');
        if (rng) rng.value = String(m.value);
        if (typeof logoOpacity !== 'undefined') logoOpacity = Number(m.value);
        break;
      }
      case 'setSpectrumType': {
        const sel = document.getElementById('spectrumType');
        if (sel) sel.value = m.value;
        if (typeof spectrumType !== 'undefined') spectrumType = m.value;
        if (typeof applyLayoutForSpectrumType === 'function') applyLayoutForSpectrumType();
        break;
      }
      case 'setPalette': {
        const sel = document.getElementById('paletteSelect');
        if (sel) sel.value = m.value;
        if (typeof palette !== 'undefined') palette = m.value;
        break;
      }
      case 'setSensitivity': {
        const rng = document.getElementById('sensitivity');
        if (rng) rng.value = String(m.value);
        if (typeof sensMult !== 'undefined') sensMult = Number(m.value);
        break;
      }
      case 'setAutoSwap': {
        const cb = document.getElementById('autoSwap');
        if (cb) cb.checked = !!m.value;
        if (m.value) {
          const rng = document.getElementById('swapInterval');
          const sec = parseInt(rng?.value, 10) || 12;
          startAutoSwap(sec);
        } else {
          stopAutoSwap();
        }
        break;
      }
      case 'setSwapInterval': {
        const rng = document.getElementById('swapInterval');
        if (rng) rng.value = String(m.value);
        const cb = document.getElementById('autoSwap');
        if (cb && cb.checked) {
          const sec = parseInt(String(m.value), 10) || 12;
          startAutoSwap(sec);
        }
        break;
      }
      case 'setBgIntensity': {
        const rng = document.getElementById('bgIntensity');
        if (rng) rng.value = String(m.value);
        if (typeof bgIntensity !== 'undefined') bgIntensity = Number(m.value);
        break;
      }
      default:
        break;
    }
    controlChannel.postMessage({ type: 'ack', message: `OK: ${m.type}` });
  } catch (err) {
    controlChannel.postMessage({ type: 'ack', message: `Erro: ${m.type}` });
  }
});
async function loadLogoFromPath(p) {
  if (!p) { setStatus('Informe o caminho do arquivo de logo.', 'error'); return; }
  try {
    const r = await fetch('/logo/path', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p })
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: 'Erro ao definir logo' }));
      throw new Error(err.detail || 'Erro ao definir logo');
    }
    const img = new Image();
    img.onload = () => {
      overlayImage = img;
      showLogo = true;
      toggleLogo.checked = true;
      setStatus('Logo carregado e ativado.');
    };
    img.crossOrigin = 'anonymous';
    img.src = '/logo';
  } catch (e) {
    setStatus(`Falha ao carregar logo: ${e.message}`, 'error');
  }
}
useLogoButton.addEventListener('click', async () => {
  const p = logoPathInput.value.trim();
  await loadLogoFromPath(p);
});
if (toggleLogo) {
  toggleLogo.checked = true;
  toggleLogo.addEventListener('change', (e) => { showLogo = e.target.checked; });
}

let localFolderActive = false;
let swapTimer = null;

async function setLocalFolder(path) {
  try {
    const res = await fetch('/images/set_dir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || 'Falha ao configurar pasta');
    }
    const data = await res.json();
    localFolderActive = true;
    setStatus(`Pasta configurada (${data.count} imagens encontradas)`);
  } catch (e) {
    console.error(e);
    setStatus('Erro ao configurar pasta. Verifique o caminho.', 'error');
  }
}

async function fetchRandomImageToBackground() {
  try {
    const url = `/images/random?ts=${Date.now()}`;
    const img = new Image();
    img.onload = () => { bgImage = img; setStatus('Imagem local aplicada como fundo.'); };
    img.onerror = () => setStatus('Erro ao carregar imagem local.', 'error');
    img.src = url;
  } catch (e) {
    console.error(e);
    setStatus('Falha ao obter imagem aleatória.', 'error');
  }
}

function startAutoSwap(intervalSec) {
  stopAutoSwap();
  // Usa o valor informado ou lê do controle; aplica fallback seguro
  let sec = Number.isFinite(intervalSec) ? intervalSec : parseInt(swapIntervalRange?.value, 10);
  if (!sec || !Number.isFinite(sec)) sec = 12;
  sec = Math.max(1, sec);
  const delayMs = Math.max(3000, sec * 1000);
  swapTimer = setInterval(() => {
    if (localFolderActive && bgSource === 'images') fetchRandomImageToBackground();
  }, delayMs);
}
function stopAutoSwap() {
  if (swapTimer) { clearInterval(swapTimer); swapTimer = null; }
}

useFolderButton.addEventListener('click', async () => {
  const p = dirPathInput.value.trim();
  if (!p) { setStatus('Informe o caminho da pasta.', 'error'); return; }
  await setLocalFolder(p);
  localFolderActive = true;
  await fetchRandomImageToBackground();
  // Desativa vídeo do YouTube quando usar imagens locais
  youtubeActive = false;
  setVideoVisible(false);
  bgSource = 'images';
  if (bgSourceSelect) bgSourceSelect.value = 'images';
  setStatus('Pasta local ativa. Utilizando imagens como fundo.');
});
autoSwapToggle.addEventListener('change', (e) => {
  const intervalSec = parseInt(swapIntervalRange.value, 10) || 12;
  if (e.target.checked) startAutoSwap(intervalSec); else stopAutoSwap();
});
swapIntervalRange.addEventListener('input', (e) => {
  if (autoSwapToggle.checked) startAutoSwap(parseInt(e.target.value, 10) || 12);
});

function updateLevelsFromAnalyser() {
  if (!analyser || !freqData) return;
  analyser.getFloatFrequencyData(freqData);
  if (freqByte) analyser.getByteFrequencyData(freqByte);
  const binHz = sampleRate / analyser.fftSize; // resolução por bin

  function bandEnergy(lowHz, highHz) {
    const startBin = Math.max(0, Math.floor(lowHz / binHz));
    const endBin = Math.min(freqData.length - 1, Math.floor(highHz / binHz));
    let sum = 0;
    let count = 0;
    for (let i = startBin; i <= endBin; i++) {
      // freqData em dBFS, converte para energia relativa
      const mag = Math.pow(10, freqData[i] / 10);
      sum += mag;
      count++;
    }
    return count > 0 ? sum / count : 0;
  }

  const eLow = bandEnergy(20, 250);
  const eMid = bandEnergy(250, 4000);
  const eHigh = bandEnergy(4000, 20000);
  // Atualiza picos com decaimento (auto-gain)
  peakLow = Math.max(peakLow * 0.995, eLow);
  peakMid = Math.max(peakMid * 0.995, eMid);
  peakHigh = Math.max(peakHigh * 0.995, eHigh);

  // Normaliza [0..1]
  let nLow = eLow / (peakLow + 1e-9);
  let nMid = eMid / (peakMid + 1e-9);
  let nHigh = eHigh / (peakHigh + 1e-9);

  // Gate para ruído baixo
  if (eLow < peakLow * 0.04) nLow = 0;
  if (eMid < peakMid * 0.04) nMid = 0;
  if (eHigh < peakHigh * 0.08) nHigh = 0;

  // Limites e suavização
  nLow = Math.min(1, Math.max(0, nLow));
  nMid = Math.min(1, Math.max(0, nMid));
  nHigh = Math.min(1, Math.max(0, nHigh));

  levels.low = levels.low * (1 - emaAlpha) + nLow * emaAlpha;
  levels.mid = levels.mid * (1 - emaAlpha) + nMid * emaAlpha;
  levels.high = levels.high * (1 - emaAlpha) + nHigh * emaAlpha;
}

function colorFor(i, N, amp) {
  const hueShift = (t * 30) % 360;
  const ratio = i / N;
  let h = 200, s = 80, l = 50;
  if (palette === 'rainbow') {
    h = (ratio * 360 + hueShift) % 360;
    s = 90; l = 45 + amp * 25;
  } else if (palette === 'neon') {
    const hues = [200, 300, 90];
    h = hues[Math.min(hues.length - 1, Math.floor(ratio * hues.length))] + hueShift * 0.4;
    s = 100; l = 50 + amp * 20;
  } else if (palette === 'fire') {
    // 0 -> dark red, 1 -> yellow
    h = 10 + ratio * 50; s = 100; l = 35 + amp * 30;
  } else if (palette === 'cyber') {
    // teal to magenta
    h = 180 + ratio * 120; s = 85; l = 45 + amp * 22;
  }
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

function initStarfield() {
  const w = canvas.width, h = canvas.height;
  const density = 0.00015; // base por área
  let desired = Math.floor(w * h * density * (0.5 + bgIntensity));
  desired = Math.max(120, Math.min(1000, desired));
  starfield = new Array(desired).fill(0).map(() => {
    const angle = Math.random() * Math.PI * 2;
    const r = (Math.random() * 0.08 + 0.02) * Math.min(w, h);
    return {
      x: w / 2 + Math.cos(angle) * r,
      y: h / 2 + Math.sin(angle) * r,
      size: Math.random() * 1.8 + 0.6,
      hue: 200 + Math.random() * 140,
    };
  });
}

function drawStarfield(w, h) {
  const cx = w / 2, cy = h / 2;
  const baseSpeed = 0.8 + bgIntensity * 2.0;
  const speedMult = baseSpeed * (1 + levels.low * 2.0 + levels.mid * 1.0);
  const overlayFactor = (bgSource === 'video') ? 0.65 : 1; // reduz intensidade sobre vídeo
  for (let s of starfield) {
    const dx = s.x - cx;
    const dy = s.y - cy;
    const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const dirX = dx / dist;
    const dirY = dy / dist;
    s.x += dirX * speedMult;
    s.y += dirY * speedMult;
    if (s.x < -40 || s.x > w + 40 || s.y < -40 || s.y > h + 40) {
      const angle = Math.random() * Math.PI * 2;
      const r = (Math.random() * 0.08 + 0.02) * Math.min(w, h);
      s.x = cx + Math.cos(angle) * r;
      s.y = cy + Math.sin(angle) * r;
      s.size = Math.random() * 1.8 + 0.6;
      s.hue = 200 + Math.random() * 140;
    }
    const alpha = overlayFactor * Math.min(1, 0.6 + (levels.high * 0.9));
    ctx.fillStyle = `hsla(${Math.round(s.hue)}, 80%, 60%, ${alpha})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
    ctx.fill();
  }
  // Nebulosa suave no centro
  const R0 = Math.min(w, h) * 0.10;
  const R1 = Math.min(w, h) * 0.50;
  const gradient = ctx.createRadialGradient(cx, cy, R0, cx, cy, R1);
  const glow = overlayFactor * (0.10 + bgIntensity * 0.15 + levels.high * 0.20);
  gradient.addColorStop(0, `rgba(120, 160, 255, ${glow})`);
  gradient.addColorStop(1, 'rgba(10, 12, 24, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

function drawBgImage(w, h) {
  if (!bgImage) return;
  const img = bgImage;
  const ia = img.width / img.height;
  const ca = w / h;
  let drawW, drawH;
  if (ia > ca) { drawH = h; drawW = ia * drawH; } else { drawW = w; drawH = drawW / ia; }
  const zoom = 1 + (levels.low * 0.15 + levels.mid * 0.10) * (0.5 + bgIntensity);
  const offX = (Math.sin(t * 0.7) * levels.mid + (Math.random() - 0.5) * levels.high * 0.02) * 40;
  const offY = (Math.cos(t * 0.6) * levels.mid) * 30;
  const x = (w - drawW * zoom) / 2 + offX;
  const y = (h - drawH * zoom) / 2 + offY;
  const imgBrightness = (baseVideoBrightness + levels.high * 0.25);
  const imgSaturate = (1 + (levels.mid + levels.low) * 0.3);
  ctx.filter = `brightness(${imgBrightness.toFixed(2)}) saturate(${imgSaturate.toFixed(2)})`;
  ctx.drawImage(img, x, y, drawW * zoom, drawH * zoom);
  ctx.filter = 'none';
}

function drawLogo(w, h) {
  if (!overlayImage || !showLogo) return;
  const base = Math.min(w, h) * 0.22 * logoScaleBase;
  const scale = 1 + levels.low * 0.45 * sensMult;
  const rotation = Math.sin(t * 1.4) * levels.mid * 0.7;
  const jitter = levels.high > 0.4 ? (levels.high - 0.4) * 0.06 : 0;
  const img = overlayImage;
  const ia = img.width / img.height;
  const targetW = base * 1.2;
  const drawW = targetW;
  const drawH = targetW / ia;
  const scaledW = drawW * scale;
  const scaledH = drawH * scale;
  const c = Math.cos(rotation), s = Math.sin(rotation);
  // Vetor do centro até o canto superior direito após rotação
  const vx = (scaledW / 2) * c - (scaledH / 2) * s;
  const vy = (scaledW / 2) * s + (scaledH / 2) * c;
  const jxRand = (Math.random() - 0.5) * jitter * base;
  const jyRand = (Math.random() - 0.5) * jitter * base;

  ctx.save();
  if (spectrumType === 'linear' || spectrumType === 'none') {
    // Margens fixas para afastar do topo/direita
    const marginTopPx = 30;
    const marginRightPx = 30;
    const safePad = 16;
    // Posiciona o centro de forma que o canto superior direito respeite a margem
    let cx = w - marginRightPx - vx - safePad;
    let cy = marginTopPx + vy + safePad;
    // Limita jitter para evitar corte no top/direita (só esquerda/baixo)
    const jxSafe = Math.max(-safePad, Math.min(0, jxRand));
    const jySafe = Math.max(0, Math.min(safePad, jyRand));
    ctx.translate(cx + jxSafe, cy + jySafe);
  } else {
    const cx = w / 2, cy = h / 2;
    ctx.translate(cx + jxRand, cy - base * 0.05 + jyRand);
  }
  ctx.rotate(rotation);
  ctx.scale(scale, scale);
  ctx.globalAlpha = logoOpacity;
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

function drawSkull(w, h) {
  const cx = w / 2, cy = h / 2;
  const base = Math.min(w, h) * 0.22;
  const scale = 1 + levels.low * 0.45 * sensMult;
  const rotation = Math.sin(t * 1.4) * levels.mid * 0.7;
  const jitter = levels.high > 0.4 ? (levels.high - 0.4) * 0.06 : 0;
  const jx = (Math.random() - 0.5) * jitter * base;
  const jy = (Math.random() - 0.5) * jitter * base;

  // Skull vetorial
  ctx.save();
  ctx.translate(cx + jx, cy - base * 0.05 + jy);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);
  const col = colorFor(64, 128, Math.min(1, levels.low * sensMult));
  const grad = ctx.createRadialGradient(0, -base * 0.25, base * 0.15, 0, -base * 0.25, base * 0.45);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(1, 'rgba(220,220,220,0.55)');
  ctx.fillStyle = grad;
  ctx.strokeStyle = col;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, -base * 0.25, base * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(240,240,240,0.85)';
  ctx.strokeStyle = 'rgba(80,80,80,0.9)';
  ctx.beginPath();
  ctx.moveTo(-base * 0.32, base * 0.05);
  ctx.quadraticCurveTo(0, base * 0.20, base * 0.32, base * 0.05);
  ctx.lineTo(base * 0.28, base * 0.30);
  ctx.quadraticCurveTo(0, base * 0.40, -base * 0.28, base * 0.30);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = `rgba(20,20,20,${(0.8 + levels.high * 0.3).toFixed(2)})`;
  const eyeR = base * 0.12;
  ctx.beginPath();
  ctx.arc(-base * 0.16, -base * 0.22, eyeR, 0, Math.PI * 2);
  ctx.arc(base * 0.16, -base * 0.22, eyeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(30,30,30,0.85)';
  ctx.beginPath();
  ctx.moveTo(0, -base * 0.08);
  ctx.lineTo(-base * 0.06, base * 0.06);
  ctx.lineTo(base * 0.06, base * 0.06);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,90,90,0.8)';
  ctx.lineWidth = 1.5;
  for (let i = -4; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * base * 0.06, base * 0.12);
    ctx.lineTo(i * base * 0.06, base * 0.28);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.20 + levels.high * 0.45;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(0, -base * 0.22, base * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();

  // Removido: desenho duplicado de overlayImage fora de drawLogo
}

function drawSpectrum(w, h) {
  const N = 128;
  const step = freqByte ? Math.max(1, Math.floor(freqByte.length / N)) : 1;

  if (spectrumType === 'linear') {
    const barW = w / N;
    for (let i = 0; i < N; i++) {
      let m = 0;
      if (freqByte) {
        for (let j = 0; j < step; j++) m += freqByte[i * step + j] || 0;
        m /= step;
      } else {
        // fallback usando níveis
        const ratio = i / N;
        m = 255 * (
          (1 - ratio) * levels.low + Math.abs(0.5 - ratio) * levels.mid + ratio * levels.high
        );
      }
      const amp = Math.min(1, (m / 255) * sensMult);
      const hBar = amp * h * 0.75;
      const x = i * barW;
      const y = h - hBar;
      ctx.fillStyle = colorFor(i, N, amp);
      ctx.fillRect(x, y, barW * 0.9, hBar);
    }
  } else {
    const cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) * 0.28;
    for (let i = 0; i < N; i++) {
      let m = 0;
      if (freqByte) {
        for (let j = 0; j < step; j++) m += freqByte[i * step + j] || 0;
        m /= step;
      } else {
        const ratio = i / N;
        m = 255 * (
          (1 - ratio) * levels.low + Math.abs(0.5 - ratio) * levels.mid + ratio * levels.high
        );
      }
      const amp = Math.min(1, (m / 255) * sensMult);
      const theta = (i / N) * Math.PI * 2;
      const r2 = R + amp * Math.min(w, h) * 0.35;
      const x1 = cx + Math.cos(theta) * R;
      const y1 = cy + Math.sin(theta) * R;
      const x2 = cx + Math.cos(theta) * r2;
      const y2 = cy + Math.sin(theta) * r2;
      ctx.strokeStyle = colorFor(i, N, amp);
      ctx.lineWidth = 1.5 + amp * 3;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }
}
function draw() {
  const w = canvas.width;
  const h = canvas.height;
  // Tempo global
  t += 0.016;

  // Atualiza níveis a partir do WebAudio (se ativo)
  if (!useWSFallback) {
    updateLevelsFromAnalyser();
    if (spectrumType !== 'none') {
      updateBars();
    }
  }

  // Fundo base: se for vídeo, não aplicamos véu escuro; apenas limpamos o canvas
  if (bgSource === 'video') {
    ctx.clearRect(0, 0, w, h);
  } else {
    const alphaBase = 0.08;
    const alphaScale = 0.20;
    const bgAlpha = alphaBase + levels.high * alphaScale;
    ctx.fillStyle = `rgba(12, 14, 28, ${bgAlpha.toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
  }

  // Fundo por fonte + sobreposição opcional de espaço
  if (bgSource === 'images') {
    if (bgImage) {
      drawBgImage(w, h);
      if (useSpaceBG) { if (starfield.length === 0) initStarfield(); drawStarfield(w, h); }
    } else {
      if (localFolderActive) fetchRandomImageToBackground();
      // fallback: sem imagem disponível ainda
      if (useSpaceBG) { if (starfield.length === 0) initStarfield(); drawStarfield(w, h); }
    }
  } else if (bgSource === 'video') {
    // vídeo aparece no videoLayer por trás do canvas
    if (useSpaceBG) { if (starfield.length === 0) initStarfield(); drawStarfield(w, h); }
  }

  // Desenha espectro somente quando não estiver desativado
  if (spectrumType !== 'none') {
    drawSpectrum(w, h);
  }

  // Atualiza transformações do vídeo conforme níveis
  updateVideoTransform();

  // Overlay de logo
  if (showLogo) {
    drawLogo(w, h);
  }

  requestAnimationFrame(draw);
}

draw();

// Mensagem inicial
setStatus('Clique em "Ativar microfone" para conceder permissão.');

// Inicializa com os caminhos padrão do usuário: logo e pasta
(async function initDefaults() {
  try {
    // Preenche campos (caso HTML não tenha valor)
    if (!logoPathInput.value) {
      logoPathInput.value = 'C\\\\Users\\\\PICHAU\\\\Pictures\\\\Lago-E\\\\Logo-E.png';
    }
    if (!dirPathInput.value) {
      dirPathInput.value = 'C\\\\Users\\\\PICHAU\\\\Pictures\\\\Lago-E\\\\ImagensDJ\\\\';
    }
    // Carrega logo automaticamente
    await loadLogoFromPath(logoPathInput.value.trim());
    // Define pasta local automaticamente (e desativa YouTube)
    await setLocalFolder(dirPathInput.value.trim());
    localFolderActive = true;
    await fetchRandomImageToBackground();
    youtubeActive = false;
    setVideoVisible(false);
    bgSource = 'images';
    if (bgSourceSelect) bgSourceSelect.value = 'images';
    setStatus('Logo e pasta local carregados automaticamente.');
  } catch (e) {
    // Em caso de erro (caminhos inexistentes, etc.), mantém app funcional
    console.warn('Init defaults falhou:', e);
  }
})();
// Controle de visibilidade das opções do tipo de espectro (Linear/Radial)
// Quando "Nenhum" estiver ativo, as opções "Linear" e "Radial" desaparecem;
// ao sair de "Nenhum", voltam a aparecer.
// Removido: ocultação dinâmica de opções do tipo de espectro.