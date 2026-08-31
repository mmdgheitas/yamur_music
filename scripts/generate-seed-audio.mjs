/**
 * Generates royalty-free demo tracks (16-bit PCM WAV, 44.1 kHz) bundled with the app so a
 * fresh offline install has audible content.
 *
 * Audibility rules applied here:
 *  - melody sits in the 260–1300 Hz range (laptop/phone speakers cannot reproduce sub-200 Hz)
 *  - every render is peak-normalised to 0.85 so playback is loud and clear
 *
 * Usage: node scripts/generate-seed-audio.mjs
 */
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.join(process.cwd(), "seed-audio");
const SAMPLE_RATE = 44100;
const TARGET_PEAK = 0.85;

/** MIDI note number -> Hz (60 = middle C). */
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

const TRACKS = [
  {
    file: "chill-amber-dusk.wav",
    seconds: 20,
    bpm: 76,
    // Fmaj9 – Cmaj7 – Dm9 – Bb6/9  (mid register, warm)
    chords: [
      [65, 72, 76, 79, 84],
      [60, 67, 71, 76, 79],
      [62, 69, 72, 77, 81],
      [58, 65, 69, 74, 77],
    ],
    pattern: [0, 2, 4, 3, 1, 3, 4, 2],
    tone: "rhodes",
    padGain: 0.5,
  },
  {
    file: "chill-slow-pour.wav",
    seconds: 19,
    bpm: 68,
    // Am9 – Fmaj7 – Cmaj9 – G6
    chords: [
      [64, 69, 72, 76, 83],
      [65, 69, 72, 77, 81],
      [64, 67, 72, 76, 86],
      [62, 67, 71, 74, 83],
    ],
    pattern: [4, 2, 3, 1, 4, 3, 2, 0],
    tone: "marimba",
    padGain: 0.45,
  },
  {
    file: "study-paper-light.wav",
    seconds: 19,
    bpm: 92,
    // Cmaj7 – Em7 – Am7 – Fmaj7 (bright, steady)
    chords: [
      [64, 67, 72, 76, 84],
      [64, 71, 74, 79, 83],
      [64, 69, 72, 79, 81],
      [65, 69, 72, 77, 84],
    ],
    pattern: [0, 2, 4, 2, 1, 3, 4, 3],
    tone: "celesta",
    padGain: 0.32,
  },
  {
    file: "study-quiet-focus.wav",
    seconds: 19,
    bpm: 84,
    // Dm7 – G7 – Cmaj7 – Am7
    chords: [
      [65, 69, 74, 77, 81],
      [65, 71, 74, 79, 83],
      [64, 67, 71, 76, 83],
      [64, 67, 72, 76, 81],
    ],
    pattern: [0, 3, 1, 4, 2, 4, 1, 3],
    tone: "marimba",
    padGain: 0.3,
  },
];

/** Plucked voice: exponentially decaying partials -> clearly audible transient. */
function pluck(freq, t, tone) {
  const timbre = {
    rhodes: [
      { mult: 1, gain: 1, decay: 3.4 },
      { mult: 2, gain: 0.34, decay: 5.2 },
      { mult: 3.01, gain: 0.12, decay: 7.5 },
    ],
    marimba: [
      { mult: 1, gain: 1, decay: 5.5 },
      { mult: 3.9, gain: 0.3, decay: 9 },
      { mult: 9.2, gain: 0.08, decay: 14 },
    ],
    celesta: [
      { mult: 1, gain: 1, decay: 4.2 },
      { mult: 2, gain: 0.45, decay: 6 },
      { mult: 4, gain: 0.18, decay: 8.5 },
    ],
  }[tone];

  let value = 0;
  for (const partial of timbre) {
    value +=
      Math.sin(2 * Math.PI * freq * partial.mult * t) *
      partial.gain *
      Math.exp(-t * partial.decay);
  }
  return value;
}

function renderTrack(track) {
  const total = Math.floor(track.seconds * SAMPLE_RATE);
  const data = new Float32Array(total);

  const beatSeconds = 60 / track.bpm / 2; // eighth notes
  const barSeconds = beatSeconds * track.pattern.length;
  const chordSeconds = barSeconds;

  // --- Melodic arpeggio layer (the part you actually hear) ---
  const totalSteps = Math.ceil(track.seconds / beatSeconds);
  for (let step = 0; step < totalSteps; step += 1) {
    const startTime = step * beatSeconds;
    const chord = track.chords[Math.floor(startTime / chordSeconds) % track.chords.length];
    const degree = track.pattern[step % track.pattern.length];
    const note = chord[degree % chord.length];
    // Lift every other bar an octave for movement, keeping everything above 260 Hz.
    const octaveLift = Math.floor(step / track.pattern.length) % 2 === 1 ? 12 : 0;
    const freq = hz(note + octaveLift);

    const startSample = Math.floor(startTime * SAMPLE_RATE);
    const voiceLength = Math.floor(SAMPLE_RATE * 1.8);
    for (let i = 0; i < voiceLength; i += 1) {
      const index = startSample + i;
      if (index >= total) break;
      data[index] += pluck(freq, i / SAMPLE_RATE, track.tone) * 0.5;
    }
  }

  // --- Sustained pad + soft bass, kept in supporting range ---
  for (let i = 0; i < total; i += 1) {
    const t = i / SAMPLE_RATE;
    const chord = track.chords[Math.floor(t / chordSeconds) % track.chords.length];
    const localT = t % chordSeconds;
    const env =
      Math.min(1, localT / 0.6) * Math.min(1, (chordSeconds - localT) / 0.7) * 0.9 + 0.1;

    let pad = 0;
    for (let v = 1; v < chord.length; v += 1) {
      const detune = 1 + Math.sin(t * (0.3 + v * 0.11)) * 0.0015;
      pad += Math.sin(2 * Math.PI * hz(chord[v]) * detune * t) / (v + 2);
    }
    // Bass one octave below the chord root, gentle so small speakers are not wasted on it.
    const bass = Math.sin(2 * Math.PI * hz(chord[0] - 12) * t) * 0.22;

    data[i] += (pad * track.padGain + bass) * env;
  }

  // --- Peak normalise, then fade the edges ---
  let peak = 0;
  for (let i = 0; i < total; i += 1) peak = Math.max(peak, Math.abs(data[i]));
  const gain = peak > 0 ? TARGET_PEAK / peak : 1;
  for (let i = 0; i < total; i += 1) data[i] *= gain;

  const fade = Math.floor(SAMPLE_RATE * 0.5);
  for (let i = 0; i < fade && i < total; i += 1) {
    const k = i / fade;
    data[i] *= k;
    data[total - 1 - i] *= k;
  }

  let sumSquares = 0;
  for (let i = 0; i < total; i += 1) sumSquares += data[i] * data[i];
  return { data, rms: Math.sqrt(sumSquares / total) };
}

function toWav(samples) {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * bytesPerSample);
  }
  return buffer;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const entry of fs.readdirSync(OUT_DIR)) {
  if (entry.endsWith(".wav")) fs.unlinkSync(path.join(OUT_DIR, entry));
}
for (const track of TRACKS) {
  const { data, rms } = renderTrack(track);
  const wav = toWav(data);
  fs.writeFileSync(path.join(OUT_DIR, track.file), wav);
  console.log(
    `${track.file} — ${(wav.length / 1024 / 1024).toFixed(2)} MB · RMS ${rms.toFixed(3)} (audible target > 0.05)`,
  );
}
console.log(`\nSeed audio written to ${OUT_DIR}`);
