"use client";

// Felolvasás a böngésző beépített beszédszintetizátorával (Web Speech API), külső szolgáltatás nélkül.
let voicesCache: SpeechSynthesisVoice[] = [];

function loadVoices() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  const v = window.speechSynthesis.getVoices();
  if (v.length) voicesCache = v;
  return voicesCache;
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  loadVoices();
  window.speechSynthesis.addEventListener?.("voiceschanged", loadVoices);
}

export function ttsSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = loadVoices();
  const lower = lang.toLowerCase();
  const base = lower.split("-")[0];
  return (
    voices.find((v) => v.lang.toLowerCase() === lower && v.localService) ||
    voices.find((v) => v.lang.toLowerCase() === lower) ||
    voices.find((v) => v.lang.toLowerCase().replace("_", "-").startsWith(base))
  );
}

export function speak(text: string, lang: string, opts: { rate?: number; volume?: number } = {}) {
  if (!ttsSupported() || !text.trim()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/\s+/g, " ").trim());
  u.lang = lang;
  const voice = pickVoice(lang);
  if (voice) u.voice = voice;
  u.rate = opts.rate ?? 1;
  u.volume = Math.max(0, Math.min(1, (opts.volume ?? 100) / 100));
  synth.speak(u);
}

export function stopSpeaking() {
  if (ttsSupported()) window.speechSynthesis.cancel();
}
