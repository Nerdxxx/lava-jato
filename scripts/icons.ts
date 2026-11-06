// Gera os ícones do PWA a partir do logo (npx tsx scripts/icons.ts).
import sharp from "sharp";

const SRC = "public/branding/logo-ljc.png";
const BG = { r: 8, g: 27, b: 51, alpha: 1 }; // navy-950

for (const size of [192, 512]) {
  const inner = Math.round(size * 0.8);
  const logo = await sharp(SRC).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(`public/icons/icon-${size}.png`);
  // maskable: área segura de 60%
  const safe = Math.round(size * 0.6);
  const small = await sharp(SRC).resize(safe, safe, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: small, gravity: "center" }])
    .png()
    .toFile(`public/icons/maskable-${size}.png`);
}
const apple = await sharp(SRC).resize(144, 144, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
await sharp({ create: { width: 180, height: 180, channels: 4, background: BG } })
  .composite([{ input: apple, gravity: "center" }])
  .png()
  .toFile("public/icons/apple-touch-icon.png");
console.log("Ícones gerados em public/icons");
