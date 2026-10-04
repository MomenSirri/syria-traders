let context;

function getAudioContext() {
  if (!context) {
    context = new window.AudioContext();
  }
  return context;
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
