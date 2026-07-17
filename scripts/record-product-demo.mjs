import { chromium } from "playwright";
import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const outputDir = path.join(projectRoot, "public", "demo-video");
const rawDir = path.join(outputDir, "raw");
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const demoUrl = process.env.DEMO_URL ?? "http://127.0.0.1:4182/?productTour=1&autoplay=1&capture=1";

await rm(rawDir, { recursive: true, force: true });
await mkdir(rawDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: chromePath,
  args: [
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--hide-scrollbars",
  ],
});

const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  colorScheme: "light",
  recordVideo: {
    dir: rawDir,
    size: { width: 1920, height: 1080 },
  },
});

const page = await context.newPage();
await page.goto(demoUrl, { waitUntil: "networkidle" });
await page.waitForFunction(() => document.body.dataset.demoComplete === "true", undefined, {
  timeout: 90_000,
});
await page.waitForTimeout(1_800);

await context.close();
await browser.close();

const recordings = await readdir(rawDir);
const recording = recordings.find((file) => file.endsWith(".webm"));
if (!recording) {
  throw new Error("Product demo recording was not created.");
}

const rawVideo = path.join(outputDir, "xiaomeishuo-product-demo-raw.webm");
await copyFile(path.join(rawDir, recording), rawVideo);
console.log(rawVideo);
