// 12 saját, egyszerű geometriai avatar (node scripts/make-avatars.mjs).
import { writeFileSync, mkdirSync } from "node:fs";
mkdirSync("public/avatars", { recursive: true });
const items = [
  ["#0B6E7F", '<circle cx="64" cy="64" r="26" fill="#fff"/>'],
  ["#B54708", '<path d="M64 34 L94 90 H34 Z" fill="#fff"/>'],
  ["#257A3E", '<rect x="40" y="40" width="48" height="48" rx="10" fill="#fff"/>'],
  ["#6C4AB6", '<path d="M64 30 L98 64 L64 98 L30 64 Z" fill="#fff"/>'],
  ["#C02B2B", '<path d="M64 30 l9.9 20.1 22.1 3.2-16 15.6 3.8 22-19.8-10.4-19.8 10.4 3.8-22-16-15.6 22.1-3.2z" fill="#fff"/>'],
  ["#1F6FB2", '<path d="M28 70 q18-22 36 0 t36 0" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M28 50 q18-22 36 0 t36 0" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round" opacity=".6"/>'],
  ["#8A5A00", '<path d="M64 32 L92 48 V80 L64 96 L36 80 V48 Z" fill="#fff"/>'],
  ["#2F7D6D", '<circle cx="64" cy="64" r="26" fill="none" stroke="#fff" stroke-width="12"/>'],
  ["#A23B72", '<path d="M56 34 h16 v22 h22 v16 h-22 v22 h-16 v-22 h-22 v-16 h22 z" fill="#fff"/>'],
  ["#3D7A1F", '<path d="M36 92 C36 56 60 34 94 34 C94 70 72 92 36 92 Z" fill="#fff"/><path d="M40 88 L78 50" stroke="#3D7A1F" stroke-width="5" stroke-linecap="round"/>'],
  ["#34495E", '<path d="M76 32 a32 32 0 1 0 20 52 a26 26 0 1 1 -20 -52 z" fill="#fff"/>'],
  ["#C4661F", '<circle cx="64" cy="64" r="16" fill="#fff"/><g stroke="#fff" stroke-width="7" stroke-linecap="round"><path d="M64 26v10M64 92v10M26 64h10M92 64h10M37 37l7 7M84 84l7 7M37 91l7-7M84 44l7-7"/></g>'],
];
items.forEach(([bg, shape], i) => {
  writeFileSync(
    `public/avatars/a${i + 1}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="64" fill="${bg}"/>${shape}</svg>\n`,
  );
});
console.log("avatarok kész");
