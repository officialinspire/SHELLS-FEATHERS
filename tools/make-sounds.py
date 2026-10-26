#!/usr/bin/env python3
"""Synthesizes the game's original sound effects into sounds/*.wav.

Every sound here is made from scratch: sine tones, decaying resonances and
filtered noise, with a fixed random seed, so running this again gives the
same files. Nothing is sampled or copied. See docs/assets.md.

    python3 tools/make-sounds.py          # needs numpy

Output: 22,050 Hz, mono, 16-bit WAV. The sounds are short and quiet on
purpose (peaks well below full scale); the game sets the final level with
the sound-effects volume.
"""
import os
import wave

import numpy as np

SR = 22050
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'sounds')
rng = np.random.default_rng(20261024)


def silence(seconds):
    return np.zeros(int(seconds * SR))


def resonance(freq, seconds, decay, amp=1.0, attack=0.002):
    """A struck, decaying sine (one mode of a wooden or metal body)."""
    t = np.arange(int(seconds * SR)) / SR
    env = np.exp(-t / decay) * np.minimum(1, t / attack)
    return amp * env * np.sin(2 * np.pi * freq * t)


def bell(freq, seconds, decay=0.4, amp=1.0):
    """A soft mallet bell: a fundamental with quieter, faster upper partials."""
    return (resonance(freq, seconds, decay, amp, attack=0.006)
            + resonance(freq * 2.0, seconds, decay * 0.5, amp * 0.18, attack=0.006)
            + resonance(freq * 3.0, seconds, decay * 0.3, amp * 0.05, attack=0.006))


def biquad(x, kind, freq, q):
    """RBJ cookbook band-pass or low-pass filter, run sample by sample."""
    w = 2 * np.pi * freq / SR
    alpha = np.sin(w) / (2 * q)
    cos = np.cos(w)
    if kind == 'band':
        b = [alpha, 0, -alpha]
    else:
        b = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2]
    a = [1 + alpha, -2 * cos, 1 - alpha]
    b = [v / a[0] for v in b]
    a = [v / a[0] for v in a]
    y = np.zeros_like(x)
    x1 = x2 = y1 = y2 = 0.0
    for i, v in enumerate(x):
        out = b[0] * v + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2
        x2, x1, y2, y1 = x1, v, y1, out
        y[i] = out
    return y


def noise(seconds):
    return rng.uniform(-1, 1, int(seconds * SR))


def place(sound, at, length):
    """`sound` placed `at` seconds into a buffer `length` seconds long."""
    out = silence(length)
    start = int(at * SR)
    end = min(len(out), start + len(sound))
    out[start:end] += sound[:end - start]
    return out


def finish(sound, peak):
    """Normalizes to `peak`, with 3 ms fades at both ends (no clicks)."""
    sound = sound / np.abs(sound).max() * peak
    fade = int(0.003 * SR)
    sound[:fade] *= np.linspace(0, 1, fade)
    sound[-fade:] *= np.linspace(1, 0, fade)
    return sound


def wood_tap(pitch=1.0, length=0.16):
    """A wooden piece set down on a wooden board: a short click and three
    quickly fading body resonances."""
    click = biquad(noise(0.006), 'band', 1800 * pitch, 1.4)
    body = (resonance(410 * pitch, length, 0.045)
            + resonance(1090 * pitch, length, 0.028, 0.5)
            + resonance(1650 * pitch, length, 0.018, 0.25))
    return place(click * 3, 0, length) + body


def write(name, sound):
    path = os.path.join(OUT, f'{name}.wav')
    data = (np.clip(sound, -1, 1) * 32767).astype('<i2')
    with wave.open(path, 'wb') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes(data.tobytes())
    print(f'{path}: {len(sound) / SR:.2f} s, {os.path.getsize(path) // 1024} KB')


def main():
    os.makedirs(OUT, exist_ok=True)

    # Acorns & Leaves: your piece moves (a clear tap), the other side's (lower, softer).
    write('piece-move', finish(wood_tap(1.0), 0.45))
    write('piece-move-other', finish(wood_tap(0.82), 0.32))

    # A capture: the jumping piece lands, and the taken piece is lifted off
    # with a soft low knock.
    length = 0.32
    capture = (place(wood_tap(1.1, 0.16), 0, length)
               + place(wood_tap(0.78, 0.2) * 0.8, 0.075, length)
               + place(resonance(150, 0.2, 0.06, 0.7), 0.075, length))
    write('capture', finish(capture, 0.45))

    # Crowned: three rising mallet-bell notes (D5, A5, D6).
    length = 1.0
    crown = sum(place(bell(f, 0.75, 0.32), at, length) for f, at in [(587.33, 0), (880.0, 0.11), (1174.66, 0.22)])
    write('crown', finish(crown, 0.32))

    # A hidden piece revealed (Fog of War): a short breath of air that
    # brightens as it rises, and one high note.
    length = 0.75
    air = noise(0.6)
    env = np.concatenate([np.linspace(0, 1, int(0.25 * SR)) ** 2, np.linspace(1, 0, int(0.35 * SR)) ** 1.5])
    blocks = []
    for i, start in enumerate(range(0, len(air), 512)):
        centre = 500 + 1800 * min(1, start / (0.4 * SR))
        blocks.append(biquad(air[start:start + 512], 'band', centre, 2.0))
    breath = np.concatenate(blocks)[:len(env)] * env
    reveal = place(breath, 0, length) + place(bell(1318.5, 0.5, 0.25, 0.12), 0.24, length)
    write('reveal', finish(reveal, 0.3))

    # Results. A draw: two notes a fifth apart that settle together (G4, D5).
    length = 1.3
    draw = place(bell(392.0, 1.1, 0.5), 0, length) + place(bell(587.33, 1.0, 0.45, 0.8), 0.14, length)
    write('result-draw', finish(draw, 0.3))

    # A loss: a gentle falling step (A4 to E4), soft rather than sad.
    length = 1.3
    loss = place(bell(440.0, 0.9, 0.4), 0, length) + place(bell(329.63, 1.0, 0.5, 0.9), 0.22, length)
    write('result-loss', finish(loss, 0.28))

    # Picking up a piece: a light shell click (short, high, quiet).
    length = 0.09
    click = biquad(noise(0.004), 'band', 3400, 1.6)
    shell = (resonance(1980, length, 0.012)
             + resonance(2970, length, 0.008, 0.45)
             + resonance(4100, length, 0.005, 0.2))
    write('select', finish(place(click * 2, 0, length) + shell, 0.26))

    # A refused move: a soft rustle of leaves, quiet and brief, never an alarm.
    length = 0.2
    rustle = biquad(noise(length), 'band', 2600, 0.9)
    t = np.arange(len(rustle)) / SR
    env = np.minimum(1, t / 0.015) * np.exp(-t / 0.06) * (0.75 + 0.25 * np.sin(2 * np.pi * 38 * t))
    write('invalid', finish(rustle * env, 0.16))

    # A multi-jump finished: a short two-note chirp (G5, D6), like a bird.
    length = 0.36
    chirp = place(bell(783.99, 0.22, 0.07), 0, length) + place(bell(1174.66, 0.26, 0.08, 0.85), 0.07, length)
    write('multi', finish(chirp, 0.24))

    # An achievement: two quick bright notes (E5, B5).
    length = 0.8
    achievement = place(bell(659.25, 0.6, 0.25), 0, length) + place(bell(987.77, 0.65, 0.3), 0.09, length)
    write('achievement', finish(achievement, 0.3))


if __name__ == '__main__':
    main()
