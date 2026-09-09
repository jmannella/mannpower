import sharp from 'sharp'
import { readFileSync } from 'node:fs'

const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url))
for (const size of [192, 512]) {
  await sharp(svg).resize(size, size).png().toFile(`public/icons/icon-${size}.png`)
  console.log(`wrote icon-${size}.png`)
}
