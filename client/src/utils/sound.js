let context;

function getAudioContext() {
  if (!context) {
    const Context = window.AudioContext || window.webkitAudioContext;
    context = new Context();
  }
  return context;
}

// Browsers keep audio muted until the page is touched or a key is pressed;
// a TV remote's first button press wakes it up.
export function unlockAudio() {
  try {
    const audioContext = getAudioContext();
    if (audioContext.state === "suspended") audioContext.resume();
  } catch (_error) {
    // No Web Audio: the game stays silent.
  }
}

export function playUiSound(kind = "tap") {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const audioContext = getAudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    const presets = {
      tap: { frequency: 420, duration: 0.05 },
      build: { frequency: 520, duration: 0.07 },
      success: { frequency: 640, duration: 0.09 },
    };

    const preset = presets[kind] || presets.tap;

    oscillator.type = "triangle";
    oscillator.frequency.value = preset.frequency;
    gain.gain.value = 0.08;

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + preset.duration);
  } catch (_error) {
    // Browsers can block autoplay before the first user interaction.
  }
}

// Table sounds are synthesized here, so there are no audio files to load.
function tone(audioContext, { freq, at = 0, dur = 0.15, type = "triangle", vol = 0.12, to }) {
  const start = audioContext.currentTime + at;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(freq, start);
  if (to) oscillator.frequency.exponentialRampToValueAtTime(to, start + dur);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(vol, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + dur + 0.02);
}

function noise(audioContext, { at = 0, dur = 0.06, vol = 0.2, freq = 2400, filter = "bandpass" }) {
  const start = audioContext.currentTime + at;
  const length = Math.max(1, Math.floor(audioContext.sampleRate * dur));
  const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  const shape = audioContext.createBiquadFilter();
  shape.type = filter;
  shape.frequency.value = freq;
  const gain = audioContext.createGain();
  gain.gain.value = vol;
  source.connect(shape);
  shape.connect(gain);
  gain.connect(audioContext.destination);
  source.start(start);
}

const notes = (audioContext, list, options = {}) =>
  list.forEach(([freq, at, dur]) => tone(audioContext, { freq, at, dur, ...options }));

const SOUNDS = {
  // Dice clattering on a wooden table.
  dice: (c) => {
    for (let i = 0; i < 7; i++)
      noise(c, {
        at: i * 0.055 + Math.random() * 0.02,
        dur: 0.04,
        freq: 1800 + i * 260,
        vol: 0.35,
      });
    noise(c, { at: 0.42, dur: 0.07, freq: 900, vol: 0.4 });
  },
  // Coins for a payout.
  coins: (c) =>
    notes(
      c,
      [
        [1319, 0, 0.12],
        [1760, 0.07, 0.18],
        [2093, 0.14, 0.22],
      ],
      { type: "sine", vol: 0.08 },
    ),
  // A seven: the bandit's low growl.
  seven: (c) => {
    tone(c, { freq: 147, dur: 0.7, type: "sawtooth", vol: 0.07, to: 98 });
    tone(c, { freq: 220, at: 0.05, dur: 0.6, type: "square", vol: 0.03, to: 110 });
  },
  build: (c) => {
    tone(c, { freq: 180, dur: 0.12, type: "square", vol: 0.06, to: 90 });
    noise(c, { dur: 0.05, freq: 600, filter: "lowpass", vol: 0.5 });
    tone(c, { freq: 660, at: 0.1, dur: 0.12, type: "triangle", vol: 0.06 });
  },
  // A deal: two rising notes.
  trade: (c) =>
    notes(
      c,
      [
        [523, 0, 0.14],
        [784, 0.12, 0.22],
      ],
      { vol: 0.1 },
    ),
  // A sneaky slide, then a cheeky "ha-ha".
  steal: (c) => {
    tone(c, { freq: 1200, dur: 0.3, type: "sine", vol: 0.07, to: 300 });
    notes(
      c,
      [
        [392, 0.34, 0.1],
        [330, 0.47, 0.14],
      ],
      { type: "square", vol: 0.05 },
    );
  },
  card: (c) => {
    noise(c, { dur: 0.12, freq: 3500, filter: "highpass", vol: 0.25 });
    tone(c, { freq: 880, at: 0.08, dur: 0.12, type: "sine", vol: 0.06 });
  },
  // A Knight's horn call.
  knight: (c) =>
    notes(
      c,
      [
        [392, 0, 0.16],
        [523, 0.14, 0.16],
        [659, 0.28, 0.32],
      ],
      { type: "sawtooth", vol: 0.05 },
    ),
  award: (c) =>
    notes(
      c,
      [
        [523, 0, 0.14],
        [659, 0.1, 0.14],
        [784, 0.2, 0.14],
        [1047, 0.3, 0.4],
      ],
      { vol: 0.09 },
    ),
  win: (c) =>
    notes(
      c,
      [
        [523, 0, 0.18],
        [659, 0.16, 0.18],
        [784, 0.32, 0.18],
        [1047, 0.5, 0.3],
        [784, 0.82, 0.16],
        [1047, 1.0, 0.7],
      ],
      { type: "square", vol: 0.06 },
    ),
  // Gentle bell when a new turn starts.
  turn: (c) => tone(c, { freq: 988, dur: 0.5, type: "sine", vol: 0.07 }),
  // A reaction pops up.
  pop: (c) => tone(c, { freq: 520, dur: 0.1, type: "sine", vol: 0.1, to: 1040 }),
};

export function playTableSound(name, delay = 0) {
  if (typeof window === "undefined" || !SOUNDS[name]) return;
  const play = () => {
    try {
      const audioContext = getAudioContext();
      if (audioContext.state === "suspended") return;
      SOUNDS[name](audioContext);
    } catch (_error) {
      // Old or muted browsers: no sound.
    }
  };
  if (delay) setTimeout(play, delay);
  else play();
}
