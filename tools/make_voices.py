"""Makes the voice clips of the soundscapes (audio/fx/*.mp3).

Human voices cannot be synthesised live in the browser with any realism, so
they are rendered once here and shipped as small clips:

  burning-cry-*    English shouts across the river ("Fire!", "Help!")
  hannibal-shout-* soldiers' calls in no real language, echoing in the Alps
  hannibal-army-*  the army murmuring and calling far off
  slave-wail-*     wordless cries for help, carried on the storm
  deluge-sob-*     sobbing
  deluge-murmur-*  sad voices murmuring, too low and far to make out

Words are spoken by espeak-ng (pip package espeakng-loader, see speak.py);
wails and sobs are made with a small formant synthesiser. ffmpeg then gives
every clip distance, room and air, and encodes it.

Run:  pip install --target <dir> espeakng-loader numpy, point speak.py at
it, then  python3 make_voices.py <output dir>
"""
import os
import random
import subprocess
import sys
import tempfile
import wave

import numpy as np

from speak import SR as SPEECH_SR, speak

OUT = sys.argv[1] if len(sys.argv) > 1 else 'audio/fx'
SR = 22050
rng = random.Random(1834)
nrng = np.random.default_rng(1834)


def write_wav(path, a, sr=SR):
    a = np.asarray(a, np.float32)
    peak = np.max(np.abs(a)) or 1.0
    a = a / peak * 0.9
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((a * 32767).astype(np.int16).tobytes())


def encode(a, name, chain, sr=SR):
    """Runs the clip through an ffmpeg filter chain and writes an MP3."""
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        tmp = f.name
    write_wav(tmp, a, sr)
    out = os.path.join(OUT, name + '.mp3')
    chain = f'{chain},loudnorm=I=-20:TP=-2:LRA=11,aresample=22050'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-af', chain, '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '48k', out], check=True)
    os.unlink(tmp)
    print('wrote', out)


def pad(a, before=0.05, after=0.6, sr=SR):
    return np.concatenate([np.zeros(int(before * sr), np.float32), a, np.zeros(int(after * sr), np.float32)])


def mix(parts, sr=SR):
    """parts: (array, start seconds, gain)."""
    n = max(int(s * sr) + len(a) for a, s, _ in parts)
    out = np.zeros(n, np.float32)
    for a, s, g in parts:
        i = int(s * sr)
        out[i:i + len(a)] += a * g
    return out


def say(text, voice, **kw):
    a = speak(text, voice, **kw)
    if SPEECH_SR != SR:
        x = np.arange(0, len(a), SPEECH_SR / SR)
        a = np.interp(x, np.arange(len(a)), a).astype(np.float32)
    return a


# Distance and space, as ffmpeg filter chains.
ACROSS_RIVER = 'highpass=f=260,lowpass=f=3200,acrusher=bits=12:mix=0.15,aecho=0.85:0.6:70|150|260:0.35|0.25|0.15'
MOUNTAINS = 'highpass=f=180,lowpass=f=2600,aecho=0.8:0.7:380|760|1150:0.4|0.25|0.12'
STORM_FAR = 'highpass=f=300,lowpass=f=2400,aecho=0.8:0.55:90|200:0.35|0.2,tremolo=f=0.7:d=0.35'
HUSHED = 'highpass=f=120,lowpass=f=1500,aecho=0.8:0.5:60|140:0.3|0.15'
MURMUR = 'highpass=f=150,lowpass=f=700,aecho=0.8:0.5:70|160:0.3|0.2'

MALE = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7']
FEMALE = ['f1', 'f2', 'f3', 'f4', 'f5']


# ---------------------------------------------------------------------------
# The Burning of the Houses of Lords and Commons: shouts in English.

CRIES = [
    'Fire!', 'Help!', 'Fire! Fire!', 'Water! Bring water!', 'Help us!', 'Get back!', 'The roof!',
    'Over here!', 'Run!', 'Look out!', 'Save them!', 'God help us!', 'It is falling!', 'Quickly!',
]


def burning():
    for i, text in enumerate(CRIES):
        parts = []
        # One caller, sometimes echoed by another voice in the crowd.
        for k in range(1 if i % 3 else 2):
            sex = rng.choice(['m', 'm', 'f'])
            voice = 'en-gb+' + rng.choice(MALE if sex == 'm' else FEMALE)
            a = say(text, voice, rate=rng.randint(150, 185), pitch=rng.randint(68, 92), rng=rng.randint(85, 99))
            parts.append((a, k * rng.uniform(0.15, 0.4), 1.0 if k == 0 else 0.7))
        encode(pad(mix(parts)), f'burning-cry-{i + 1:02d}', ACROSS_RIVER)


# ---------------------------------------------------------------------------
# Hannibal: soldiers calling in no real language, and the army far off.

SYLLABLES = ['ka', 'ro', 'ta', 'mi', 'bal', 'hu', 'ar', 'ken', 'dor', 'sha', 'ga', 'um', 'tar', 'esh', 'mo', 'ral',
             'ba', 'do', 'kha', 'ish', 'na', 'tu', 'gor', 'hel', 'am', 'zi', 'baal', 'ok', 'ru', 'at']


def word(n=None):
    return ''.join(rng.choice(SYLLABLES) for _ in range(n or rng.randint(1, 3)))


def phrase(words=None):
    return ' '.join(word() for _ in range(words or rng.randint(1, 3)))


def hannibal():
    for i in range(10):
        text = phrase() + '!'
        if rng.random() < 0.4:
            text += ' ' + phrase(1) + '!'
        a = say(text, 'la+' + rng.choice(MALE), rate=rng.randint(140, 175), pitch=rng.randint(30, 60), rng=rng.randint(70, 95))
        # Answered by others down the column.
        parts = [(a, 0, 1.0)]
        if i % 2 == 0:
            b = say(word() + '!', 'la+' + rng.choice(MALE), rate=160, pitch=rng.randint(25, 50), rng=80)
            parts.append((b, len(a) / SR + rng.uniform(0.2, 0.6), 0.6))
        encode(pad(mix(parts), after=1.4), f'hannibal-shout-{i + 1:02d}', MOUNTAINS)
    for i in range(3):
        parts = []
        t = 0.0
        while t < 7.0:
            text = phrase()
            a = say(text, 'la+' + rng.choice(MALE), rate=rng.randint(150, 190), pitch=rng.randint(20, 55), rng=60, volume=rng.randint(40, 90))
            parts.append((a, t, rng.uniform(0.3, 0.8)))
            t += rng.uniform(0.15, 0.6)
        a = mix(parts)
        fade = np.minimum(1, np.minimum(np.arange(len(a)) / (0.8 * SR), (len(a) - np.arange(len(a))) / (1.2 * SR)))
        encode(a * fade, f'hannibal-army-{i + 1:02d}', MOUNTAINS + ',lowpass=f=1400')


# ---------------------------------------------------------------------------
# A small formant synthesiser for wordless voices.

VOWELS = {
    'a': (800, 1200, 2500, 3500),
    'o': (500, 850, 2400, 3300),
    'u': (350, 700, 2300, 3200),
    'e': (550, 1800, 2500, 3500),
    'uh': (600, 1050, 2450, 3400),
}


def resonate(x, freqs, bw, sr=SR):
    """Two-pole resonator with a formant frequency that may change per sample."""
    freqs = np.broadcast_to(np.asarray(freqs, np.float64), x.shape)
    r = np.exp(-np.pi * bw / sr)
    a2 = -r * r
    y = np.zeros_like(x)
    y1 = y2 = 0.0
    c = 2 * r * np.cos(2 * np.pi * freqs / sr)
    g = 1 - r
    for i in range(len(x)):
        v = g * x[i] + c[i] * y1 + a2 * y2
        y[i] = v
        y2, y1 = y1, v
    return y


def voice(f0, vowel_track, breath=0.08, sr=SR):
    """f0: Hz per sample. vowel_track: per-sample blend between two vowels
    given as (vowel_a, vowel_b, mix array)."""
    n = len(f0)
    jitter = 1 + nrng.normal(0, 0.012, n).cumsum() * 0.0005
    phase = np.cumsum(f0 * jitter / sr) % 1.0
    open_q = 0.62
    g = np.where(phase < open_q * 0.7, 0.5 * (1 - np.cos(np.pi * phase / (open_q * 0.7))),
                 np.where(phase < open_q, np.cos(0.5 * np.pi * (phase - open_q * 0.7) / (open_q * 0.3)), 0.0))
    src = np.diff(g, prepend=0.0) * 30
    src += nrng.normal(0, breath, n)
    va, vb, m = vowel_track
    out = np.zeros(n)
    for k, bw in enumerate((80, 100, 140, 200)):
        f = VOWELS[va][k] * (1 - m) + VOWELS[vb][k] * m
        out += resonate(src, f, bw) * (1.0, 0.7, 0.35, 0.2)[k]
    return out.astype(np.float32)


def envelope(n, attack, release, sr=SR):
    t = np.arange(n)
    return np.minimum(1, np.minimum(t / (attack * sr), (n - t) / (release * sr))).clip(0, 1)


def slave_ship():
    for i in range(8):
        dur = rng.uniform(1.2, 2.2)
        n = int(dur * SR)
        t = np.arange(n) / SR
        female = i % 2 == 1
        base = rng.uniform(260, 330) if female else rng.uniform(170, 220)
        peak = base * rng.uniform(1.5, 1.9)
        # A cry: up to a peak, a break, and a long fall, shaking with fear.
        rise = rng.uniform(0.2, 0.35) * dur
        f0 = np.where(t < rise, base + (peak - base) * (t / rise) ** 0.6, peak - (peak - base * 0.8) * ((t - rise) / (dur - rise)) ** 1.3)
        f0 *= 1 + 0.035 * np.sin(2 * np.pi * rng.uniform(5.5, 7.5) * t)
        m = np.clip(t / dur * 1.4, 0, 1)
        a = voice(f0, ('a', rng.choice(['o', 'uh']), m), breath=0.12) * envelope(n, 0.08, 0.5)
        if rng.random() < 0.5:
            b = voice(f0 * 0.98, ('o', 'u', m), breath=0.15) * envelope(n, 0.1, 0.5)
            a = mix([(a, 0, 1.0), (b, rng.uniform(0.6, 1.2), 0.6)])
        encode(pad(a, after=1.0), f'slave-wail-{i + 1:02d}', STORM_FAR)


def deluge():
    for i in range(6):
        parts = []
        t0 = 0.0
        female = i % 2 == 0
        base = rng.uniform(250, 300) if female else rng.uniform(140, 175)
        for k in range(rng.randint(2, 4)):
            # A catch of breath, then a broken, falling whimper.
            gasp_n = int(rng.uniform(0.12, 0.2) * SR)
            gasp = nrng.normal(0, 1, gasp_n).astype(np.float32)
            gasp = resonate(gasp, np.linspace(500, 1400, gasp_n), 300) * envelope(gasp_n, 0.03, 0.08) * 0.5
            parts.append((gasp.astype(np.float32), t0, 1.0))
            t0 += gasp_n / SR + rng.uniform(0.02, 0.08)
            dur = rng.uniform(0.35, 0.8)
            n = int(dur * SR)
            tt = np.arange(n) / SR
            f0 = base * (1.15 - 0.35 * tt / dur) * (1 + 0.06 * np.sin(2 * np.pi * 9 * tt) * (tt / dur))
            amp = envelope(n, 0.03, 0.2) * (0.6 + 0.4 * (np.sin(2 * np.pi * rng.uniform(5, 8) * tt) > -0.2))
            v = voice(f0, ('uh', 'u', np.clip(tt / dur, 0, 1)), breath=0.25) * amp
            parts.append((v, t0, 0.8))
            t0 += dur + rng.uniform(0.25, 0.7)
        encode(pad(mix(parts), after=0.8), f'deluge-sob-{i + 1:02d}', HUSHED)
    lines = ['oh no', 'where are they', 'all gone', 'my home', 'the water', 'oh god', 'help me find them',
             'it took everything', 'we have nothing', 'hush now', 'come here', 'they are gone']
    for i in range(3):
        parts = []
        t = 0.0
        while t < 8.0:
            sex = rng.choice(['m', 'f'])
            v = 'en-gb+' + rng.choice(MALE if sex == 'm' else FEMALE)
            a = say(rng.choice(lines), v, rate=rng.randint(110, 140), pitch=rng.randint(20, 45), rng=30, volume=rng.randint(40, 80))
            parts.append((a, t, rng.uniform(0.4, 0.9)))
            t += rng.uniform(0.4, 1.1)
        a = mix(parts)
        a *= envelope(len(a), 1.0, 1.5)
        encode(a, f'deluge-murmur-{i + 1:02d}', MURMUR)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    burning()
    hannibal()
    slave_ship()
    deluge()
