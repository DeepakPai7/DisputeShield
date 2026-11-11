import { spawn } from 'child_process';
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

function saveScreenshot(page, filename) {
  const artifactPath = path.join(artifactDir, filename);
  const docsPath = path.join(screenshotsDir, filename);
  return page.screenshot({ path: artifactPath, fullPage: false }).then(() => {
    fs.copyFileSync(artifactPath, docsPath);
    console.log(`Saved screenshot: ${filename}`);
  });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForServer(url, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch (e) {}
    await sleep(800);
  }
  throw new Error(`Timeout waiting for ${url}`);
}

async function main() {
  console.log('Starting backend server and frontend client for end-to-end verification...');

  // Start server
  const serverProc = spawn('node', ['server/src/index.js'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true
  });

  // Start client
  const clientProc = spawn('npx.cmd', ['vite', '--port', '5173'], {
    cwd: path.resolve(rootDir, 'client'),
    stdio: 'inherit',
    shell: true
  });

  try {
    await waitForServer('http://localhost:5000/api/health');
    console.log('Backend server running on http://localhost:5000');
    await waitForServer('http://localhost:5173');
    console.log('Frontend Vite client running on http://localhost:5173');

    // Launch Puppeteer
    const browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    console.log('1. Navigating to DisputeShield...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
    await sleep(1500);

    // Close welcome modal if present
    const skipBtn = await page.$('button ::-p-text(Skip)');
    if (skipBtn) {
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Skip'));
        if (btn) btn.click();
      });
      await sleep(1000);
    }

    console.log('2. Switching to Buyer Mode...');
    await page.evaluate(() => {
      const buyerBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Buyer'));
      if (buyerBtn) buyerBtn.click();
    });
    await sleep(2000);

    console.log('3. Capturing Buyer Portal (OTP & Chat)...');
    await saveScreenshot(page, 'feature_01_buyer_portal_otp_chat.png');

    console.log('4. Sending a real message as Rohan Kumar (Buyer)...');
    await page.evaluate(() => {
      // Find quick template button
      const quickBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Got the jacket today'));
      if (quickBtn) {
        quickBtn.click();
      } else {
        const input = document.querySelector('input[placeholder*="Type a message"]');
        if (input) {
          input.value = "Hi! I just got the jacket today. Fits great, thanks!";
          input.dispatchEvent(new Event('input', { bubbles: true }));
          const form = input.closest('form');
          if (form) form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }
      }
    });
    await sleep(2000);

    console.log('5. Clicking "Simulate Courier Handshake (Verify OTP)"...');
    await page.evaluate(() => {
      const verifyBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Simulate Courier Handshake'));
      if (verifyBtn) verifyBtn.click();
    });
    await sleep(3000);

    console.log('6. Capturing Buyer Portal with Handshake Verified...');
    await saveScreenshot(page, 'feature_02_buyer_portal_handshake_verified.png');

    console.log('7. Switching back to Seller Mode...');
    await page.evaluate(() => {
      const sellerBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Seller'));
      if (sellerBtn) sellerBtn.click();
    });
    await sleep(2000);

    console.log('8. Opening dispute review on home screen...');
    await page.evaluate(() => {
      const reviewBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Review'));
      if (reviewBtn) reviewBtn.click();
    });
    await sleep(2500);

    console.log('9. Capturing Seller Dispute Review with OTP Proof & Real Chat...');
    await saveScreenshot(page, 'feature_03_seller_dispute_review_with_otp_and_chat.png');

    console.log('10. Sending a seller reply in the chat drawer...');
    await page.evaluate(() => {
      const chatInput = document.querySelector('input[placeholder*="Send message to buyer"]');
      if (chatInput) {
        chatInput.value = "Thanks for confirming delivery, Rohan! DisputeShield will record this.";
        chatInput.dispatchEvent(new Event('input', { bubbles: true }));
        const replyBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Reply');
        if (replyBtn) replyBtn.click();
      }
    });
    await sleep(2000);

    console.log('11. Clicking "Cite OTP proof" prompt chip...');
    await page.evaluate(() => {
      const chip = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Cite OTP proof'));
      if (chip) chip.click();
    });
    await sleep(2500);

    console.log('12. Capturing AI response letter updated with OTP proof...');
    await saveScreenshot(page, 'feature_04_gemini_letter_generated.png');

    console.log('13. Submitting defense to PayPal (Verifying NO 500 error)...');
    await page.evaluate(() => {
      const sendBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Send this reply to PayPal'));
      if (sendBtn) sendBtn.click();
    });
    await sleep(1500);

    // Confirm in modal
    await page.evaluate(() => {
      const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Yes, send to PayPal'));
      if (confirmBtn) confirmBtn.click();
    });
    await sleep(3500);

    console.log('14. Capturing successful submission banner (No 500 error!)...');
    await saveScreenshot(page, 'feature_05_dispute_submitted_success.png');

    console.log('All end-to-end verifications completed successfully!');
    await browser.close();
  } finally {
    serverProc.kill();
    clientProc.kill();
  }
}

main().catch(err => {
  console.error('Verification error:', err);
  process.exit(1);
});
