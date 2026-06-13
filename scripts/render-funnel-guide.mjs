import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "outputs", "funnel-guide", "cold-to-convert-funnel-guide.html");
const pdfPath = path.join(root, "outputs", "funnel-guide", "cold-to-convert-funnel-guide.pdf");
const previewDir = path.join(root, "outputs", "funnel-guide", "preview");

await fsResetDir(previewDir);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 900, height: 1100 },
  deviceScaleFactor: 2,
});

await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" });
await page.emulateMedia({ media: "print" });
await page.pdf({
  path: pdfPath,
  width: "8in",
  height: "10in",
  printBackground: true,
  margin: { top: "0", right: "0", bottom: "0", left: "0" },
  preferCSSPageSize: true,
});

await page.emulateMedia({ media: "screen" });
for (const index of [5, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]) {
  await page.locator(".paper").nth(index).screenshot({
    path: path.join(previewDir, `page-${String(index + 1).padStart(2, "0")}.png`),
  });
}

await browser.close();

console.log(pdfPath);

async function fsResetDir(dir) {
  const { mkdir, rm } = await import("node:fs/promises");
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
}
