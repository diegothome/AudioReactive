import numpy as np
import sounddevice as sd
import threading


class AudioAnalyzer:
    """
    Captura áudio do microfone e calcula níveis normalizados de
    energia nas bandas: grave, médio e agudo.
    """

    def __init__(self, samplerate: int = 48000, blocksize: int = 1024, channels: int = 1):
        self.samplerate = samplerate
        self.blocksize = blocksize
        self.channels = channels

        self._lock = threading.Lock()
        self._ema_low = 0.0
        self._ema_mid = 0.0
        self._ema_high = 0.0
        self._peak_low = 1e-6
        self._peak_mid = 1e-6
        self._peak_high = 1e-6

        # Bandas padrão (ajustáveis):
        self._low_band = (20, 250)
        self._mid_band = (250, 4000)
        self._high_band = (4000, 20000)

        # Filtro de suavização (EMA) e decaimento de pico
        self._alpha = 0.25  # suavização (quanto maior, mais responsivo)
        self._running = False
        self._stream = None

    def start(self):
        if self._running:
            return
        self._running = True

        last_error = None

        def select_input_device():
            try:
                devs = sd.query_devices()
                # default may be tuple (in, out)
                default_dev = sd.default.device
                in_default = None
                if isinstance(default_dev, (list, tuple)) and len(default_dev) >= 1:
                    in_default = default_dev[0]
                elif isinstance(default_dev, (int, type(None))):
                    in_default = default_dev

                input_indices = [i for i, d in enumerate(devs) if d.get("max_input_channels", 0) > 0]
                device = in_default if in_default is not None else (input_indices[0] if input_indices else None)
                return device, devs
            except Exception:
                return None, []

        device, devs = select_input_device()

        def try_start(sr, dev):
            ch = self.channels
            if dev is not None and devs:
                try:
                    max_in = devs[int(dev)]["max_input_channels"]
                    ch = int(max(1, min(self.channels, max_in)))
                except Exception:
                    ch = self.channels
            s = sd.InputStream(
                samplerate=sr,
                channels=ch,
                blocksize=self.blocksize,
                dtype="float32",
                callback=self._callback,
                device=dev,
            )
            s.start()
            return s

        def prefer_hostapi():
            try:
                has = sd.query_hostapis()
                order = [
                    "Windows WASAPI",
                    "Windows WDM-KS",
                    "Windows DirectSound",
                    "MME",
                ]
                for name in order:
                    for idx, info in enumerate(has):
                        if info.get("name") == name:
                            return idx, info
            except Exception:
                pass
            return None, None

        def select_device_for_hostapi(hidx):
            try:
                if hidx is None:
                    return None
                info = sd.query_hostapis(hidx)
                dev_indices = info.get("devices", [])
                # tenta pegar default do hostapi
                default_in = info.get("default_input_device")
                if default_in is not None:
                    return default_in
                # senão, primeiro com canais de entrada
                for di in dev_indices:
                    d = sd.query_devices(di)
                    if d.get("max_input_channels", 0) > 0:
                        return di
            except Exception:
                pass
            return None

        hidx, _ = prefer_hostapi()
        h_device = select_device_for_hostapi(hidx)

        # Tentativas: samplerate atual com device detectado, fallback para 44100, e sem device explícito
        attempts = []
        # tenta hostapi preferido com seu device
        if hidx is not None:
            try:
                sd.default.hostapi = hidx
            except Exception:
                pass
            attempts.extend([
                (self.samplerate, h_device),
                (44100, h_device),
            ])
        # tenta com device padrão detectado
        attempts.extend([
            (self.samplerate, device),
            (44100, device),
            (44100, None),
        ])

        for sr, dev in attempts:
            try:
                self._stream = try_start(sr, dev)
                self.samplerate = sr  # atualizar caso tenha mudado
                return
            except Exception as e:
                last_error = e

        # Se chegar aqui, falhou todas as tentativas
        self._running = False
        self._stream = None
        raise last_error if last_error else RuntimeError("Falha desconhecida ao iniciar áudio")

    def stop(self):
        self._running = False
        if self._stream is not None:
            self._stream.stop()
            self._stream.close()
            self._stream = None

    def _callback(self, indata, frames, time, status):
        if status:
            # Ignora warnings do driver
            pass

        # Mono: pega o primeiro canal caso múltiplos
        if indata.ndim > 1:
            x = indata[:, 0]
        else:
            x = indata

        # Janela Hann para reduzir vazamento espectral
        win = np.hanning(len(x))
        xw = x * win

        # FFT e espectro de potência
        spectrum = np.fft.rfft(xw)
        mag = np.abs(spectrum)
        power = mag ** 2

        freqs = np.fft.rfftfreq(len(xw), d=1.0 / self.samplerate)

        def band_energy(band):
            low, high = band
            idx = np.where((freqs >= low) & (freqs < high))[0]
            if len(idx) == 0:
                return 0.0
            return float(np.sum(power[idx]) / len(idx))

        e_low = band_energy(self._low_band)
        e_mid = band_energy(self._mid_band)
        e_high = band_energy(self._high_band)

        # Suaviza (EMA)
        a = self._alpha
        self._ema_low = (1 - a) * self._ema_low + a * e_low
        self._ema_mid = (1 - a) * self._ema_mid + a * e_mid
        self._ema_high = (1 - a) * self._ema_high + a * e_high

        # Rastreia picos com decaimento lento (auto-gain)
        self._peak_low = max(self._peak_low * 0.995, self._ema_low)
        self._peak_mid = max(self._peak_mid * 0.995, self._ema_mid)
        self._peak_high = max(self._peak_high * 0.995, self._ema_high)

    def get_levels(self):
        # Retorna níveis normalizados [0..1] com gate para ruído
        with self._lock:
            low = self._ema_low / (self._peak_low + 1e-9)
            mid = self._ema_mid / (self._peak_mid + 1e-9)
            high = self._ema_high / (self._peak_high + 1e-9)

            # Gate de ruído (abaixa níveis abaixo de 3% do pico)
            if self._ema_low < self._peak_low * 0.03:
                low = 0.0
            if self._ema_mid < self._peak_mid * 0.03:
                mid = 0.0
            if self._ema_high < self._peak_high * 0.03:
                high = 0.0

            # Limita 0..1 e retorna
            low = float(np.clip(low, 0.0, 1.0))
            mid = float(np.clip(mid, 0.0, 1.0))
            high = float(np.clip(high, 0.0, 1.0))
            return low, mid, high