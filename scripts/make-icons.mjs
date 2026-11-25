// Ikonok legenerálása a saját SVG logóból (egyszer kell futtatni: node scripts/make-icons.mjs).
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";

mkdirSync("public/icons", { recursive: true });
const logo = readFileSync("assets/logo.svg");
const mask = readFileSync("assets/logo-maskable.svg");
const out = async (svg, size, file) => sharp(svg, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toFile(file);

await out(logo, 192, "public/icons/icon-192.png");
await out(logo, 512, "public/icons/icon-512.png");
await out(mask, 192, "public/icons/maskable-192.png");
await out(mask, 512, "public/icons/maskable-512.png");
await out(mask, 180, "public/icons/apple-touch-icon.png");
copyFileSync("assets/logo.svg", "public/icons/icon.svg");

// favicon.ico: ICO tároló egy 32x32-es PNG-vel.
const png = await sharp(logo, { density: 384 }).resize(32, 32).png().toBuffer();
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry.writeUInt8(32, 0);
entry.writeUInt8(32, 1);
entry.writeUInt8(0, 2);
entry.writeUInt8(0, 3);
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(22, 12);
writeFileSync("public/favicon.ico", Buffer.concat([header, entry, png]));
console.log("ikonok kész");
