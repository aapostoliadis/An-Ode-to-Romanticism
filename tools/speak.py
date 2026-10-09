# Minimal espeak-ng wrapper: text to a numpy float array.
import ctypes, sys, os
import numpy as np
LIB = os.environ.get('ESPEAKNG_DIR') or os.path.join(os.path.dirname(__file__), 'espeakng_loader')
lib = ctypes.CDLL(os.path.join(LIB, 'libespeak-ng.so'))
CB = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.c_void_p)
_buf = []
@CB
def _cb(wav, n, events):
    if n > 0 and wav:
        _buf.append(np.ctypeslib.as_array(wav, shape=(n,)).copy())
    return 0
SR = lib.espeak_Initialize(2, 0, os.path.join(LIB, 'espeak-ng-data').encode(), 0)
lib.espeak_SetSynthCallback(_cb)
RATE, VOLUME, PITCH, RANGE = 1, 2, 3, 4

def speak(text, voice='en-gb', rate=170, pitch=50, rng=50, volume=100):
    _buf.clear()
    lib.espeak_SetVoiceByName(voice.encode())
    lib.espeak_SetParameter(RATE, rate, 0)
    lib.espeak_SetParameter(VOLUME, volume, 0)
    lib.espeak_SetParameter(PITCH, pitch, 0)
    lib.espeak_SetParameter(RANGE, rng, 0)
    t = text.encode('utf-8') + b'\0'
    lib.espeak_Synth(t, len(t), 0, 0, 0, 0, None, None)
    lib.espeak_Synchronize()
    a = np.concatenate(_buf).astype(np.float32) / 32768 if _buf else np.zeros(1, np.float32)
    return a

if __name__ == '__main__':
    import wave
    a = speak(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'en-gb')
    with wave.open('test.wav', 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(a, -1, 1) * 32767).astype(np.int16).tobytes())
    print(SR, len(a) / SR)
