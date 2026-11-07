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
  <!-- House roof -->
  <polygon points="256,112 388,232 124,232" fill="white"/>
  <!-- House body -->
  <rect x="156" y="232" width="200" height="168" rx="6" fill="white"/>
  <!-- Door -->
  <rect x="216" y="300" width="80" height="100" rx="8" fill="#0ea5e9"/>
  <!-- Chimney -->
  <rect x="314" y="140" width="30" height="60" rx="4" fill="white"/>
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
