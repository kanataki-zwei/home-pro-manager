import sharp from 'sharp'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(__dirname, '../public/icons')

const svgSource = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0ea5e9"/>
      <stop offset="100%" stop-color="#38bdf8"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="100" fill="url(#bg)"/>
  <!-- Chimney -->
  <rect x="312" y="128" width="34" height="72" rx="5" fill="white"/>
  <!-- Roof -->
  <polygon points="256,88 408,234 104,234" fill="white"/>
  <!-- House body -->
  <rect x="132" y="234" width="248" height="190" rx="8" fill="white"/>
  <!-- Dollar sign -->
  <text x="256" y="374" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="148" font-weight="900" fill="#0ea5e9">$</text>
</svg>
`

const sizes = [192, 512]

for (const size of sizes) {
    const outPath = resolve(outDir, `icon-${size}.png`)
    await sharp(Buffer.from(svgSource))
        .resize(size, size)
        .png()
        .toFile(outPath)
    console.log(`✓ icon-${size}.png`)
}

console.log('Icons generated in public/icons/')
