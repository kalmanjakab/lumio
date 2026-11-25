"use client";

// Rövid, finom hangeffektek a böngészőben generálva (nincs hangfájl, nincs licenckérdés).
type SoundName = "correct" | "wrong" | "match" | "finish";

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(c: AudioContext, freq: number, start: number, dur: number, vol: number, type: OscillatorType = "sine") {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime + start);
  gain.gain.setValueAtTime(0.0001, c.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), c.currentTime + start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(c.currentTime + start);
  osc.stop(c.currentTime + start + dur + 0.02);
}

export function playSound(name: SoundName, volume: number) {
  if (volume <= 0) return;
  const c = audio();
  if (!c) return;
  const v = (volume / 100) * 0.22;
  switch (name) {
    case "correct":
      tone(c, 660, 0, 0.12, v);
      tone(c, 880, 0.09, 0.18, v);
      break;
    case "wrong":
      tone(c, 220, 0, 0.18, v * 0.8, "triangle");
      tone(c, 185, 0.1, 0.22, v * 0.7, "triangle");
      break;
    case "match":
      tone(c, 740, 0, 0.1, v * 0.8);
      break;
    case "finish":
      tone(c, 523, 0, 0.14, v);
      tone(c, 659, 0.12, 0.14, v);
      tone(c, 784, 0.24, 0.14, v);
      tone(c, 1047, 0.36, 0.3, v);
      break;
  }
}
