import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

(async () => {
  console.log('🚀 Launching system Google Chrome via puppeteer-core...');
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  console.log('✅ Browser launched successfully!');
  const page = await browser.newPage();
  await page.goto('http://localhost:3000');
  const title = await page.title();
  console.log('📄 Page Title:', title);

  const artifactsDir = '/home/abdikhafar/.gemini/antigravity/brain/d6079465-132d-4880-a7e8-4531ac6ca219';
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }

  const screenshotPath = path.join(artifactsDir, 'test-home-page.png');
  await page.screenshot({ path: screenshotPath });
  console.log('📸 Screenshot saved to:', screenshotPath);
  await browser.close();
})();
