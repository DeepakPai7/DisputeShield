import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const artifactDir = 'C:\\Users\\deepa\\.gemini\\antigravity\\brain\\89a57625-fd46-4e3b-bbd1-2705514d590e';
const screenshotsDir = path.resolve(rootDir, 'docs/screenshots');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

async function saveScreenshot(page, filename) {
  const artifactPath = path.join(artifactDir, filename);
  const docsPath = path.join(screenshotsDir, filename);
  await page.screenshot({ path: artifactPath, fullPage: false });
  fs.copyFileSync(artifactPath, docsPath);
  console.log(`Saved screenshot: ${filename}`);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('Launching Chrome to verify Channel3 Shop & PayPal Sandbox...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,920']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 920 });

    console.log('1. Navigating to DisputeShield...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
    await sleep(2000);

    // Close welcome modal if present
    try {
      const skipBtn = await page.$('button ::-p-text(Skip)');
      if (skipBtn) {
        await skipBtn.click();
        await sleep(1000);
      }
    } catch (e) {}

    // Navigate to "Try it" tab
    console.log('2. Opening "Try it" Shop...');
    const tryItNav = await page.$('button ::-p-text(Try it)');
    if (tryItNav) {
      await tryItNav.click();
      await sleep(4000); // Wait for Channel3 search & AI pick
    }

    // Capture View 1: Shop with Channel3 products & AI pick
    await saveScreenshot(page, 'channel3_01_shop_search_and_products.png');

    // Click "Buy with PayPal" on first product card
    console.log('3. Clicking "Buy with PayPal" to open modal...');
    const buyBtns = await page.$$('button ::-p-text(Buy with PayPal)');
    if (buyBtns.length > 0) {
      await buyBtns[0].click();
      await sleep(1500);
      await saveScreenshot(page, 'channel3_02_checkout_modal_with_retailer_link.png');

      // Close modal
      const closeBtn = await page.$('button svg.lucide-x');
      if (closeBtn) {
        await closeBtn.click();
      } else {
        await page.keyboard.press('Escape');
      }
      await sleep(1000);
    }

    // Navigate to "Under the hood" -> Connections
    console.log('4. Opening "Under the hood" -> Connections...');
    const underTheHoodNav = await page.$('button ::-p-text(Under the hood)');
    if (underTheHoodNav) {
      await underTheHoodNav.click();
      await page.waitForFunction(() => !document.body.innerText.includes('Checking connection health...'), { timeout: 15000 }).catch(() => {});
      await sleep(1500);
      await saveScreenshot(page, 'channel3_03_under_the_hood_channel3_connected.png');

      // Switch to Activity Log tab
      console.log('5. Switching to Raw API Activity Log tab...');
      const logsTab = await page.$('button ::-p-text(PayPal activity log)');
      if (logsTab) {
        await logsTab.click();
        await sleep(1500);
        await saveScreenshot(page, 'channel3_04_activity_log_channel3_calls.png');
      }
    }

    // Navigate back to Disputes (home)
    console.log('6. Navigating to Disputes (home)...');
    const disputesNav = await page.$('button ::-p-text(Disputes)');
    if (disputesNav) {
      await disputesNav.click();
      await sleep(1500);
      await saveScreenshot(page, 'channel3_05_disputes_home_with_product_snapshot.png');
    }

    console.log('All Channel3 verification screenshots captured successfully!');
  } catch (err) {
    console.error('Error during screenshot capture:', err);
  } finally {
    await browser.close();
  }
}

main();
