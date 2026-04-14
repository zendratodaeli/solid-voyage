/**
 * postinstall script — Patches html2canvas to support modern CSS color functions
 *
 * html2canvas v1.x cannot parse oklch/oklab/lab/lch/color() functions
 * used by Tailwind CSS v4. This script adds them as supported color
 * functions that return transparent (0x00000000).
 *
 * This runs automatically after `npm install`.
 */

const fs = require("fs");
const path = require("path");

const PATCH_MARKER = "/* PATCHED: modern-css-colors */";

const filesToPatch = [
  path.join(__dirname, "..", "node_modules", "html2canvas", "dist", "html2canvas.js"),
  path.join(__dirname, "..", "node_modules", "html2canvas", "dist", "html2canvas.esm.js"),
];

const OLD_PATTERN = /var SUPPORTED_COLOR_FUNCTIONS = \{\s*hsl: hsl,\s*hsla: hsl,\s*rgb: rgb,\s*rgba: rgb\s*\};/;

const NEW_CODE = `var _transparentColor = function () { return 0x00000000; };
var SUPPORTED_COLOR_FUNCTIONS = {
    hsl: hsl,
    hsla: hsl,
    rgb: rgb,
    rgba: rgb,
    lab: _transparentColor,
    oklab: _transparentColor,
    oklch: _transparentColor,
    lch: _transparentColor,
    color: _transparentColor
}; ${PATCH_MARKER}`;

let patchedCount = 0;

for (const filePath of filesToPatch) {
  if (!fs.existsSync(filePath)) {
    console.log(`[html2canvas-patch] File not found, skipping: ${filePath}`);
    continue;
  }

  let content = fs.readFileSync(filePath, "utf-8");

  if (content.includes(PATCH_MARKER)) {
    console.log(`[html2canvas-patch] Already patched: ${path.basename(filePath)}`);
    continue;
  }

  if (OLD_PATTERN.test(content)) {
    content = content.replace(OLD_PATTERN, NEW_CODE);
    fs.writeFileSync(filePath, content, "utf-8");
    console.log(`[html2canvas-patch] ✓ Patched: ${path.basename(filePath)}`);
    patchedCount++;
  } else {
    console.log(`[html2canvas-patch] Pattern not found in: ${path.basename(filePath)}`);
  }
}

if (patchedCount > 0) {
  console.log(`[html2canvas-patch] Done. Patched ${patchedCount} file(s) to support lab/oklab/oklch colors.`);
} else {
  console.log(`[html2canvas-patch] No files needed patching.`);
}
