#!/usr/bin/env node
/**
 * Web-ready image pipeline for the RADI roadmap site.
 *
 *   node scripts/optimize-images.mjs                          (npm run images:build)
 *   node scripts/optimize-images.mjs --tones=brand,gold,white --icons=gold
 *   node scripts/optimize-images.mjs --tones=gold --out=/tmp/preview   (no repo writes)
 *
 * Source : assets/radi-coin-source.jfif
 * Output : public/brand/radi-coin-{384,256,128,64}.{webp,png}            ("brand" tone)
 *          public/brand/radi-coin-<tone>-{384,256,128,64}.{webp,png}    (extra tones)
 *          public/favicon-32.png, public/apple-touch-icon.png
 *
 * Recolouring: add an entry to the TONES table below (or use an existing one) and
 * list it in --tones. `hue`/`saturation`/`brightness` go through sharp's modulate()
 * (hue in degrees, the others are multipliers); `tint` repaints the emblem in one
 * exact colour while keeping the keyed alpha and the luminance ramp, so the facets
 * inside the mark stay readable. Extra tones are opt-in, because every tone set
 * costs ~175 KB of WebP + ~100 KB of PNG in the repo.
 *
 * Why this exists: the source is a 1408x768 JPEG (JFIF) screenshot of the brand
 * emblem rendered on the transparency checkerboard, 637 KB, with a C2PA manifest
 * baked in. The site needs a transparent, metadata-free, small asset in exactly
 * the sizes the browser renders.
 *
 * Background removal is a two-term key on the raw pixels:
 *   - neutral term : dark greys (checkerboard squares, JPEG noise) -> transparent
 *   - colour term  : only strongly saturated pixels survive on their own
 * so the mark stays crisp on the black page as well as on lighter surfaces.
 * A 3x3 median pass kills single-pixel JPEG speckles before the soft 3x3 blur.
 *
 * If you get a transparent PNG later, drop it in assets/ under the same name and
 * re-run; the key is a no-op for pixels that are already transparent.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(root, "assets", "radi-coin-source.jfif");
const OUT_DIR = path.join(root, "public", "brand");
const PUBLIC_DIR = path.join(root, "public");
const SIZES = [384, 256, 128, 64];

/** Key thresholds, measured from the source (see README). */
const KEY = { neutralMax: 118, neutralSpan: 58, chromaMin: 88, chromaSpan: 70 };
/** Transparent margin kept around the emblem (fraction of its bounding box). */
const MARGIN = 0.04;

/**
 * Optional recolours, selected with `--tones=`. `null` keeps the keyed colours
 * (the mark as it comes out of the source).
 *
 *   hue/saturation/brightness -> sharp modulate(); hue is degrees, the rest are
 *                                multipliers (measured against the cyan source).
 *   tint                      -> flat recolour: one exact colour, alpha and the
 *                                luminance ramp preserved (hex, so brand colours
 *                                can be matched exactly).
 */
const TONES = {
  brand: null,
  gold: { hue: 205, saturation: 1.25, brightness: 1.08 },
  blue: { hue: 40, saturation: 1.1 },
  violet: { hue: 95, saturation: 1.15 },
  emerald: { hue: -65, saturation: 1.1 },
  crimson: { hue: -95, saturation: 1.15 },
  white: { tint: "#ffffff" },
  graphite: { tint: "#94a3b8" }
};
/** Luminance floor for `tint` tones: the darkest facet keeps this much of the tone. */
const TINT_FLOOR = 0.34;

const SIZES_LABEL = "384,256,128,64";

function parseArgs(argv) {
  const tones = [];
  let icons = null;
  let out = null;

  for (const arg of argv) {
    const [flag, value] = arg.split("=");
    if (flag === "--tones" && value) tones.push(...value.split(",").map((tone) => tone.trim()).filter(Boolean));
    else if (flag === "--icons" && value) icons = value.trim();
    else if (flag === "--out" && value) out = path.resolve(value);
    else {
      console.error(`unknown argument: ${arg}`);
      console.error(`usage: node scripts/optimize-images.mjs [--tones=brand,gold] [--icons=brand] [--out=dir]`);
      console.error(`tones: ${Object.keys(TONES).join(", ")}`);
      process.exit(1);
    }
  }

  if (!tones.length) tones.push("brand");
  const unknown = tones.filter((tone) => !(tone in TONES));
  if (unknown.length) {
    console.error(`unknown tone(s): ${unknown.join(", ")} — available: ${Object.keys(TONES).join(", ")}`);
    process.exit(1);
  }

  const iconTone = icons ?? tones[0];
  if (!(iconTone in TONES)) {
    console.error(`unknown --icons tone: ${iconTone} — available: ${Object.keys(TONES).join(", ")}`);
    process.exit(1);
  }

  return { tones: [...new Set(tones)], iconTone, out };
}

function buildAlpha(data, channels, width, height) {
  const alpha = Buffer.alloc(width * height);

  for (let i = 0, p = 0; i < alpha.length; i += 1, p += channels) {
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const value = Math.max(r, g, b);
    const chroma = value - Math.min(r, g, b);
    const neutral = (value - KEY.neutralMax) / KEY.neutralSpan;
    const coloured = (chroma - KEY.chromaMin) / KEY.chromaSpan;
    const score = Math.max(neutral, coloured);
    alpha[i] = Math.round(Math.max(0, Math.min(1, score)) * 255);
  }

  return alpha;
}

/** 3x3 median (speckle removal) followed by a soft weighted 3x3 blur (edge smoothing). */
function medianAndSoften(source, width, height) {
  const sorted = new Int32Array(9);
  const median = Buffer.alloc(source.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = Math.min(height - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = Math.min(width - 1, Math.max(0, x + dx));
          sorted[n] = source[yy * width + xx];
          n += 1;
        }
      }
      for (let i = 1; i < 9; i += 1) {
        const value = sorted[i];
        let j = i - 1;
        while (j >= 0 && sorted[j] > value) {
          sorted[j + 1] = sorted[j];
          j -= 1;
        }
        sorted[j + 1] = value;
      }
      median[y * width + x] = sorted[4];
    }
  }

  const softened = Buffer.alloc(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = Math.min(height - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = Math.min(width - 1, Math.max(0, x + dx));
          const weight = dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1;
          sum += median[yy * width + xx] * weight;
        }
      }
      softened[y * width + x] = Math.round(sum / 16);
    }
  }

  return softened;
}

function alphaBounds(alpha, width, height, threshold = 128) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alpha[y * width + x] < threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) return { left: 0, top: 0, width, height };
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** File base name for a tone: `radi-coin` for the default set, `radi-coin-<tone>` otherwise. */
function toneBaseName(tone) {
  return tone === "brand" ? "radi-coin" : `radi-coin-${tone}`;
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  };
}

/**
 * Applies a TONES entry to the squared, transparent emblem; the `brand` tone (null)
 * is returned untouched so the default set stays byte-for-byte the keyed source.
 */
async function applyTone(square, tone) {
  const recipe = TONES[tone];
  if (!recipe) return square;

  if (recipe.tint) {
    const { r: tintR, g: tintG, b: tintB } = hexToRgb(recipe.tint);
    const { data, info } = await sharp(square).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = info;
    const pixels = width * height;
    const rgb = Buffer.alloc(pixels * 3);
    const alpha = Buffer.alloc(pixels);

    for (let i = 0; i < pixels; i += 1) {
      const p = i * 4;
      const luma = (0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]) / 255;
      const gain = TINT_FLOOR + (1 - TINT_FLOOR) * luma;
      rgb[i * 3] = Math.round(tintR * gain);
      rgb[i * 3 + 1] = Math.round(tintG * gain);
      rgb[i * 3 + 2] = Math.round(tintB * gain);
      alpha[i] = data[p + 3];
    }

    return sharp(rgb, { raw: { width, height, channels: 3 } })
      .joinChannel(alpha, { raw: { width, height, channels: 1 } })
      .png()
      .toBuffer();
  }

  return sharp(square)
    .modulate({
      hue: recipe.hue ?? 0,
      saturation: recipe.saturation ?? 1,
      brightness: recipe.brightness ?? 1
    })
    .png()
    .toBuffer();
}

async function main() {
  const { tones, iconTone, out } = parseArgs(process.argv.slice(2));
  const outDir = out ?? OUT_DIR;

  if (!fs.existsSync(SOURCE)) {
    console.error(`missing source image: ${SOURCE}`);
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });
  if (out) console.log(`out: ${outDir} (custom --out, nothing written into public/brand)`);

  const { data, info } = await sharp(SOURCE).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  console.log(
    `source: ${path.relative(root, SOURCE)} ${width}x${height}, ${channels} channels, ${(fs.statSync(SOURCE).size / 1024).toFixed(0)} KB`
  );

  const soft = medianAndSoften(buildAlpha(data, channels, width, height), width, height);
  const bounds = alphaBounds(soft, width, height);
  console.log(`emblem bounds: ${bounds.width}x${bounds.height} @ ${bounds.left},${bounds.top}`);

  const keyed = await sharp(data, { raw: { width, height, channels } })
    .joinChannel(soft, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();

  const canvas = Math.round(Math.max(bounds.width, bounds.height) * (1 + MARGIN * 2));
  const square = await sharp(keyed)
    .extract(bounds)
    .resize({ width: canvas, height: canvas, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const variants = new Map();
  for (const tone of tones) variants.set(tone, await applyTone(square, tone));

  let webpTotal = 0;
  let pngTotal = 0;

  for (const [tone, toneSquare] of variants) {
    const base = toneBaseName(tone);
    let toneWebp = 0;
    let tonePng = 0;

    for (const size of SIZES) {
      const resized = sharp(toneSquare).resize({ width: size, height: size, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });
      const webp = await resized.clone().webp({ quality: 84, alphaQuality: 100, effort: 6 }).toBuffer();
      const png = await resized.clone().png({ compressionLevel: 9, palette: true, colours: 256, dither: 1 }).toBuffer();

      fs.writeFileSync(path.join(outDir, `${base}-${size}.webp`), webp);
      fs.writeFileSync(path.join(outDir, `${base}-${size}.png`), png);
      toneWebp += webp.length;
      tonePng += png.length;
      console.log(`  ${base}-${size} → webp ${(webp.length / 1024).toFixed(1)} KB | png ${(png.length / 1024).toFixed(1)} KB`);
    }

    webpTotal += toneWebp;
    pngTotal += tonePng;
    console.log(`  tone "${tone}": webp ${(toneWebp / 1024).toFixed(0)} KB | png ${(tonePng / 1024).toFixed(0)} KB`);
  }

  const iconSquare = variants.get(iconTone);
  const favicon = await sharp(iconSquare).resize(32, 32).png({ compressionLevel: 9, palette: true, colours: 128 }).toBuffer();
  const touch = await sharp(iconSquare).resize(180, 180).png({ compressionLevel: 9, palette: true, colours: 256 }).toBuffer();
  fs.writeFileSync(path.join(PUBLIC_DIR, "favicon-32.png"), favicon);
  fs.writeFileSync(path.join(PUBLIC_DIR, "apple-touch-icon.png"), touch);
  console.log(
    `  favicon-32.png ${(favicon.length / 1024).toFixed(1)} KB | apple-touch-icon.png ${(touch.length / 1024).toFixed(1)} KB (tone "${iconTone}")`
  );
  console.log(
    `done: tones [${tones.join(", ")}] · sizes ${SIZES_LABEL} · webp ${(webpTotal / 1024).toFixed(0)} KB, png ${(pngTotal / 1024).toFixed(0)} KB (source was ${(fs.statSync(SOURCE).size / 1024).toFixed(0)} KB)`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
