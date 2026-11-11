import puppeteer from 'puppeteer-core';
import path from 'path';

const ARTIFACT_DIR = 'C:\\Users\\deepa\\.gemini\\antigravity\\brain\\89a57625-fd46-4e3b-bbd1-2705514d590e';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function run() {
  console.log('Launching browser to capture baseline of current UI...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1366,850'],
    defaultViewport: { width: 1366, height: 850 }
  });

  const page = await browser.newPage();

  // 1. Current Home / Dashboard
  console.log('1. Capturing current Home...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'baseline_01_home.png') });

  // 2. Current Sandbox Lab
  console.log('2. Capturing current Sandbox Lab...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Sandbox Lab'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'baseline_02_sandbox_lab.png') });

  // 3. Current Integration Status
  console.log('3. Capturing current Integration Status...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Integration Status'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'baseline_03_integration_status.png') });

  // 4. Current Audit & API Logs
  console.log('4. Capturing current Audit & API Logs...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Audit & API Logs') || b.textContent.includes('Audit Logs'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'baseline_04_audit_logs.png') });

  // 5. Current Settings
  console.log('5. Capturing current Settings...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Settings'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'baseline_05_settings.png') });

  // 6. Current Dispute Detail (if a dispute exists or create one)
  console.log('6. Checking for dispute to capture Dispute Detail...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Dashboard'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  const reviewBtn = await page.$('table tbody tr:first-child button');
  if (reviewBtn) {
    await reviewBtn.click();
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'baseline_06_dispute_detail.png') });
  }

  await browser.close();
  console.log('Baseline screenshots saved successfully.');
}

run().catch(err => {
  console.error('Error taking baseline screenshots:', err);
  process.exit(1);
});

