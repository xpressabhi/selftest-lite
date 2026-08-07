// Regenerates the Android launcher icons and splash screens from the app's
// main 512x512 image (android/app/src/main/ic_launcher-playstore.png).
//
// Usage: node scripts/generate-android-assets.mjs
// Requires: npm i -D sharp

import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = join(root, 'android/app/src/main/ic_launcher-playstore.png');
const resDir = join(root, 'android/app/src/main/res');

const SPLASHES = {
	'drawable-port-mdpi': [320, 480],
	'drawable-port-hdpi': [480, 800],
	'drawable-port-xhdpi': [720, 1280],
	'drawable-port-xxhdpi': [960, 1600],
	'drawable-port-xxxhdpi': [1280, 1920],
	'drawable-land-mdpi': [480, 320],
	'drawable-land-hdpi': [800, 480],
	'drawable-land-xhdpi': [1280, 720],
	'drawable-land-xxhdpi': [1600, 960],
	'drawable-land-xxxhdpi': [1920, 1280],
	'drawable': [480, 320],
};

const LEGACY_ICON_SIZES = {
	'mipmap-mdpi': 48,
	'mipmap-hdpi': 72,
	'mipmap-xhdpi': 96,
	'mipmap-xxhdpi': 144,
	'mipmap-xxxhdpi': 192,
};

const SPLASH_LOGO_FRACTION = 0.3;
const ADAPTIVE_FOREGROUND_FRACTION = 0.7;

async function sampleBackgroundColor(image) {
	const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
	const { width, height, channels } = info;
	let r = 0;
	let g = 0;
	let b = 0;
	let count = 0;
	// Average the outermost 2-pixel ring of the source image.
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (x < 2 || y < 2 || x >= width - 2 || y >= height - 2) {
				const i = (y * width + x) * channels;
				r += data[i];
				g += data[i + 1];
				b += data[i + 2];
				count++;
			}
		}
	}
	const hex = (v) => Math.round(v / count).toString(16).padStart(2, '0');
	return `#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase();
}

async function generateSplash(logo, targetDir, [width, height], bg) {
	const logoSize = Math.round(Math.min(width, height) * SPLASH_LOGO_FRACTION);
	const canvas = sharp({
		create: {
			width,
			height,
			channels: 4,
			background: bg,
		},
	});
	const centered = logo
		.resize(logoSize, logoSize, { fit: 'cover' })
		.composite([]);
	const composited = await sharp(
		await canvas.png().toBuffer(),
	).composite([
		{
			input: await centered.png().toBuffer(),
			left: Math.round((width - logoSize) / 2),
			top: Math.round((height - logoSize) / 2),
		},
	]).png().toBuffer();
	writeFileSync(join(resDir, targetDir, 'splash.png'), composited);
	console.log(`  splash ${targetDir} ${width}x${height}`);
}

async function generateLegacyIcon(logo, targetDir, size) {
	const buf = await logo.resize(size, size, { fit: 'cover' }).webp({ quality: 95 }).toBuffer();
	writeFileSync(join(resDir, targetDir, 'ic_launcher.webp'), buf);
	writeFileSync(join(resDir, targetDir, 'ic_launcher_round.webp'), buf);
	console.log(`  icon ${targetDir} ${size}`);
}

async function generateAdaptiveForeground(logo, targetDir, size) {
	const inner = Math.round(size * ADAPTIVE_FOREGROUND_FRACTION);
	const canvas = sharp({
		create: { width: size, height: size, channels: 4, background: '#00000000' },
	});
	const resized = await logo.resize(inner, inner, { fit: 'cover' }).png().toBuffer();
	const buf = await sharp(await canvas.png().toBuffer())
		.composite([
			{
				input: resized,
				left: Math.round((size - inner) / 2),
				top: Math.round((size - inner) / 2),
			},
		])
		.webp({ quality: 95 })
		.toBuffer();
	writeFileSync(join(resDir, targetDir, 'ic_launcher_foreground.webp'), buf);
	console.log(`  foreground ${targetDir} ${size}`);
}

async function main() {
	const logo = sharp(sourcePath);
	const meta = await logo.metadata();
	if (!meta.width || !meta.height) {
		throw new Error(`Cannot read source image: ${sourcePath}`);
	}
	console.log(`Source: ${sourcePath} (${meta.width}x${meta.height})`);
	const bg = await sampleBackgroundColor(logo.clone());
	console.log(`Sampled background: ${bg}`);

	console.log('Splash screens:');
	for (const [dir, size] of Object.entries(SPLASHES)) {
		await generateSplash(logo.clone(), dir, size, bg);
	}

	console.log('Launcher icons:');
	for (const [dir, size] of Object.entries(LEGACY_ICON_SIZES)) {
		await generateLegacyIcon(logo.clone(), dir, size);
		await generateAdaptiveForeground(logo.clone(), dir, size);
	}

	const backgroundXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${bg}</color>
</resources>
`;
	writeFileSync(join(resDir, 'values/ic_launcher_background.xml'), backgroundXml);

	const vectorBackground = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path android:fillColor="${bg}" android:pathData="M0,0h108v108h-108z"/>
</vector>
`;
	writeFileSync(join(resDir, 'drawable/ic_launcher_background.xml'), vectorBackground);
	console.log(`Background color updated to ${bg}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
