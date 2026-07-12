import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const source = path.join(root, 'public', 'fenacoju-logo.png');
const resDir = path.join(root, 'android', 'app', 'src', 'main', 'res');

const launcherSizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

const foregroundSizes = {
  'mipmap-mdpi': 108,
  'mipmap-hdpi': 162,
  'mipmap-xhdpi': 216,
  'mipmap-xxhdpi': 324,
  'mipmap-xxxhdpi': 432,
};

async function createIcon(size, paddingRatio = 0.12) {
  const padding = Math.round(size * paddingRatio);
  const inner = size - padding * 2;

  const logo = await sharp(source)
    .resize(inner, inner, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: logo, gravity: 'centre' }])
    .png()
    .toBuffer();
}

async function writeIcon(folder, name, size, paddingRatio) {
  const dir = path.join(resDir, folder);
  fs.mkdirSync(dir, { recursive: true });
  const buffer = await createIcon(size, paddingRatio);
  const file = path.join(dir, `${name}.png`);
  fs.writeFileSync(file, buffer);
  console.log(`✅ ${folder}/${name}.png (${size}px)`);
}

async function main() {
  if (!fs.existsSync(source)) {
    console.error('Logo introuvable:', source);
    process.exit(1);
  }

  console.log('Génération des icônes Android depuis fenacoju-logo.png...\n');

  for (const [folder, size] of Object.entries(launcherSizes)) {
    await writeIcon(folder, 'ic_launcher', size, 0.1);
    await writeIcon(folder, 'ic_launcher_round', size, 0.1);
  }

  for (const [folder, size] of Object.entries(foregroundSizes)) {
    await writeIcon(folder, 'ic_launcher_foreground', size, 0.18);
  }

  console.log('\nIcônes générées.');
}

main().catch((err) => {
  console.error('Erreur:', err.message);
  process.exit(1);
});
