import puppeteer from 'puppeteer-core';
import path from 'path';

const ARTIFACT_DIR = 'C:\\Users\\deepa\\.gemini\\antigravity\\brain\\89a57625-fd46-4e3b-bbd1-2705514d590e';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function run() {
  console.log('Launching Chrome via Puppeteer-core...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1366,850'],
    defaultViewport: { width: 1366, height: 850 }
  });

  const page = await browser.newPage();

  // 1. Dashboard (Honest Empty State)
  console.log('1. Navigating to Dashboard (http://localhost:5173)...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
  await page.waitForSelector('h1', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 2000));
  const dashPath = path.join(ARTIFACT_DIR, '01_dashboard.png');
  await page.screenshot({ path: dashPath, fullPage: false });
  console.log('Dashboard screenshot captured:', dashPath);

  // 2. Integration Status Page
  console.log('2. Navigating to Integration Status...');
  await page.evaluate(() => {
    const navButtons = Array.from(document.querySelectorAll('nav button, header button'));
    const statusNav = navButtons.find(b => b.textContent.includes('Integration Status'));
    if (statusNav) statusNav.click();
  });
  await new Promise(r => setTimeout(r, 3000));
  const statusPath = path.join(ARTIFACT_DIR, '03_integration_status.png');
  await page.screenshot({ path: statusPath, fullPage: false });
  console.log('Integration Status screenshot captured:', statusPath);

  // 3. Sandbox Lab Page (Storefront & PayPal Buttons)
  console.log('3. Navigating to Sandbox Lab...');
  await page.evaluate(() => {
    const navButtons = Array.from(document.querySelectorAll('nav button, header button'));
    const labNav = navButtons.find(b => b.textContent.includes('Sandbox Lab'));
    if (labNav) labNav.click();
  });
  await new Promise(r => setTimeout(r, 3000));
  const labPath = path.join(ARTIFACT_DIR, '02_sandbox_lab.png');
  await page.screenshot({ path: labPath, fullPage: false });
  console.log('Sandbox Lab screenshot captured:', labPath);

  // 4. Trigger a Sandbox Order & Dispute to evaluate with AI Agent
  console.log('4. Generating Sandbox Order & Dispute for Alpine Technical Jacket...');
  let createdDisputeId = null;
  try {
    const res = await fetch('http://localhost:5000/api/disputes/create-sandbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productKey: 'jacket',
        reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED'
      })
    });
    const data = await res.json();
    createdDisputeId = data.disputeRecord?.id;
    console.log('Sandbox dispute created:', createdDisputeId);
  } catch (err) {
    console.log('API dispute creation notice:', err.message);
  }

  // 5. Open Dispute Detail
  console.log('5. Navigating to Dispute Detail...');
  await page.evaluate(() => {
    const navButtons = Array.from(document.querySelectorAll('nav button, header button'));
    const dashNav = navButtons.find(b => b.textContent.includes('Dashboard'));
    if (dashNav) dashNav.click();
  });
  await new Promise(r => setTimeout(r, 2000));

  const reviewBtn = await page.$('table tbody tr:first-child button');
  if (reviewBtn) {
    await reviewBtn.click();
  } else {
    // If no row in table, navigate directly if id exists
    if (createdDisputeId) {
      await page.evaluate((id) => {
        window.history.pushState({}, '', `/?tab=detail&id=${id}`);
      }, createdDisputeId);
    }
  }

  await new Promise(r => setTimeout(r, 3000));
  // Expand agent trace if present
  try {
    const traceBtn = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(b => b.textContent.includes('Agent Tool Call Trace'));
    });
    if (traceBtn) await traceBtn.click();
  } catch (e) {}

  await new Promise(r => setTimeout(r, 1000));
  const detailPath = path.join(ARTIFACT_DIR, '02_dispute_detail_hero.png');
  await page.screenshot({ path: detailPath, fullPage: false });
  console.log('Dispute Detail screenshot captured:', detailPath);

  // 6. Submit to PayPal Modal Preview
  console.log('6. Opening Submit to PayPal Modal...');
  try {
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent.includes('Submit to PayPal'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 1500));
    const submitModalPath = path.join(ARTIFACT_DIR, '03_submit_modal_preview.png');
    await page.screenshot({ path: submitModalPath, fullPage: false });
    console.log('Submit Modal screenshot captured:', submitModalPath);

    // Close modal
    await page.evaluate(() => {
      const closeBtn = document.querySelector('.fixed.inset-0 button');
      if (closeBtn) closeBtn.click();
    });
    await new Promise(r => setTimeout(r, 500));
  } catch (err) {
    console.log('Submit modal notice:', err.message);
  }

  // 7. Audit Log (Cryptographic Hash Chain)
  console.log('7. Navigating to Audit Log (Hash Chain)...');
  await page.evaluate(() => {
    const navButtons = Array.from(document.querySelectorAll('nav button, header button'));
    const actNav = navButtons.find(b => b.textContent.includes('Audit & API Logs') || b.textContent.includes('Audit Logs'));
    if (actNav) actNav.click();
  });
  await new Promise(r => setTimeout(r, 2000));

  // Expand first row to show hashes
  const firstRow = await page.$('.divide-y > div:first-child');
  if (firstRow) await firstRow.click();
  await new Promise(r => setTimeout(r, 1000));

  const auditPath = path.join(ARTIFACT_DIR, '06_audit_log.png');
  await page.screenshot({ path: auditPath, fullPage: false });
  console.log('Audit Log screenshot captured:', auditPath);

  // 8. PayPal API Telemetry Log Tab
  console.log('8. Switching to PayPal API Telemetry Log Tab...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const pplBtn = buttons.find(b => b.textContent.includes('PayPal API Logs'));
    if (pplBtn) pplBtn.click();
  });
  await new Promise(r => setTimeout(r, 2000));
  const apiLogPath = path.join(ARTIFACT_DIR, '04_simulator.png'); // reuse slot for telemetry
  await page.screenshot({ path: apiLogPath, fullPage: false });
  console.log('PayPal API Log screenshot captured:', apiLogPath);

  await browser.close();
  console.log('All verification screenshots captured successfully!');
}

run().catch(err => {
  console.error('Browser verification failed:', err);
  process.exit(1);
});
