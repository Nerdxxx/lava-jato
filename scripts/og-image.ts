// Gera public/og.png (1200x630) com a logo oficial sobre o azul-marinho da marca.
//   npx tsx scripts/og-image.ts
import sharp from "sharp";

const W = 1200;
const H = 630;
const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <radialGradient id="g" cx="80%" cy="10%" r="90%"><stop offset="0" stop-color="#0A2A50"/><stop offset="1" stop-color="#081B33"/></radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <rect y="${H - 10}" width="${W}" height="10" fill="#FFC107"/>
  <text x="70" y="250" font-family="Arial, Helvetica, sans-serif" font-size="68" font-weight="800" fill="#FFFFFF">Lava Jato Capuã</text>
  <text x="70" y="320" font-family="Arial, Helvetica, sans-serif" font-size="34" fill="#00C9F2">Lavagem automotiva</text>
  <text x="70" y="366" font-family="Arial, Helvetica, sans-serif" font-size="34" fill="#00C9F2">em Barra dos Coqueiros — SE</text>
  <rect x="70" y="420" width="300" height="70" rx="14" fill="#FFC107"/>
  <text x="220" y="466" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="800" fill="#081B33">Agende online</text>
</svg>`);
const logo = await sharp("public/branding/logo-ljc.png").resize({ height: 500 }).toBuffer();
await sharp(bg)
  .composite([{ input: logo, left: W - 560, top: 65 }])
  .png({ compressionLevel: 9 })
  .toFile("public/og.png");
console.log("public/og.png gerado");
