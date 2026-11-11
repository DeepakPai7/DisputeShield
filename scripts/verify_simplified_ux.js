import puppeteer from 'puppeteer-core';
import path from 'path';

const ARTIFACT_DIR = 'C:\\Users\\deepa\\.gemini\\antigravity\\brain\\89a57625-fd46-4e3b-bbd1-2705514d590e';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function run() {
  console.log('Launching browser for Simplified UX Verification...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,820'],
    defaultViewport: { width: 1280, height: 820 }
  });

  const page = await browser.newPage();

  // Ensure fresh localStorage for welcome modal test
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
  await page.evaluate(() => localStorage.removeItem('disputeshield_welcome_seen'));
  await page.reload({ waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));

  // 1. Welcome Modal (First-Run)
  console.log('1. Capturing Welcome Modal...');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'simplified_00_welcome_modal.png') });
  console.log('Saved: simplified_00_welcome_modal.png');

  // Click "Show me how it works" -> navigates to "Try it"
  console.log('Clicking "Show me how it works"...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Show me how it works'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  // 2. Try It (Practice Store)
  console.log('2. Capturing Try It practice store...');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'simplified_02_try_it.png') });
  console.log('Saved: simplified_02_try_it.png');

  // Generate a test dispute so Home has a card
  console.log('Creating a test dispute for review demo...');
  try {
    await fetch('http://localhost:5000/api/disputes/create-sandbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productKey: 'jacket', reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED' })
    });
  } catch (e) {
    console.log('Dispute create notice:', e.message);
  }

  // 3. Home: Disputes (The 10-Second Test)
  console.log('3. Navigating to Disputes Home...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('nav button')).find(b => b.textContent.trim() === 'Disputes');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'simplified_01_disputes_home.png') });
  console.log('Saved: simplified_01_disputes_home.png (The 10-Second Test)');

  // 4. Settings Modal
  console.log('4. Opening Settings Modal...');
  await page.evaluate(() => {
    const gearBtn = document.querySelector('button[aria-label="Settings"]');
    if (gearBtn) gearBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'simplified_05_settings_modal.png') });
  console.log('Saved: simplified_05_settings_modal.png');

  // Close Settings modal
  await page.evaluate(() => {
    const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Cancel');
    if (cancelBtn) cancelBtn.click();
  });
  await new Promise(r => setTimeout(r, 800));

  // 5. Open Review on Dispute Card (Click Test: Click 1)
  console.log('5. Clicking Review on dispute card (Click Test: Click 1)...');
  await page.evaluate(() => {
    const reviewBtn = document.querySelector('div.bg-white button');
    if (reviewBtn) reviewBtn.click();
  });
  await new Promise(r => setTimeout(r, 2500));

  // 6. Dispute Review Screen (Single Clean Column, 4 Numbered Sections)
  console.log('6. Capturing Dispute Review...');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'simplified_03_review_dispute.png') });
  console.log('Saved: simplified_03_review_dispute.png');

  // Click Test: Click 2: "Send this reply to PayPal"
  console.log('7. Clicking "Send this reply to PayPal" (Click Test: Click 2)...');
  await page.evaluate(() => {
    const sendBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Send this reply to PayPal'));
    if (sendBtn) sendBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // Click Test: Click 3: Confirm in simplified modal
  console.log('Clicking Confirm in simplified modal (Click Test: Click 3)...');
  await page.evaluate(() => {
    const confirmBtn = Array.from(document.querySelectorAll('div.fixed button')).find(b => b.textContent.trim() === 'Confirm');
    if (confirmBtn) confirmBtn.click();
  });
  await new Promise(r => setTimeout(r, 3000));

  // Capture done state banner
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'simplified_03_review_dispute_submitted.png') });
  console.log('Saved: simplified_03_review_dispute_submitted.png (Confirmed in 3 clicks total!)');

  // 7. Click status dot to open "Under the hood"
  console.log('8. Clicking status dot to open "Under the hood"...');
  await page.evaluate(() => {
    const dotBtn = document.querySelector('button[title="Click to view connection details"]');
    if (dotBtn) dotBtn.click();
  });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'simplified_04_under_the_hood.png') });
  console.log('Saved: simplified_04_under_the_hood.png');

  // Switch to "What the AI did" tab
  console.log('Switching to "What the AI did" tab...');
  await page.evaluate(() => {
    const tabBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'What the AI did');
    if (tabBtn) tabBtn.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  // Expand first trace
  await page.evaluate(() => {
    const expandBtn = Array.from(document.querySelectorAll('button, div')).find(b => b.textContent.includes('Show calls'));
    if (expandBtn) expandBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'simplified_04_under_the_hood_traces.png') });
  console.log('Saved: simplified_04_under_the_hood_traces.png');

  await browser.close();
  console.log('All simplified UX verification screenshots captured successfully!');
}

run().catch(err => {
  console.error('Error during simplified UX verification:', err);
  process.exit(1);
});

