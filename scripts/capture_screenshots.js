const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = 3831;
const PACKAGE_PATH = path.resolve(__dirname, '..', 'dummy_showcase_package');
const CHROME_PATH = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
].find(p => fs.existsSync(p));

console.log(`Using browser binary: ${CHROME_PATH}`);

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function capture() {
  console.log(`Starting background server on port ${PORT}...`);
  const server = spawn(process.execPath, [
    path.join(__dirname, '..', 'server.js'),
    '--package', PACKAGE_PATH,
    '--port', String(PORT)
  ], {
    stdio: 'inherit'
  });

  await wait(2500);

  console.log(`Launching Puppeteer with viewport 1440x960...`);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    defaultViewport: {
      width: 1440,
      height: 960,
      deviceScaleFactor: 2 // Ultra-sharp 2x resolution
    },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();

  try {
    console.log(`Navigating to http://localhost:${PORT}...`);
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle0' });
    await wait(1500);

    // Select general-chat
    console.log(`Selecting channel general-chat...`);
    const channelItems = await page.$$('.channel-item');
    for (const item of channelItems) {
      const text = await page.evaluate(el => el.textContent, item);
      if (text.includes('general-chat')) {
        await item.click();
        break;
      }
    }
    await wait(1200);

    // Scroll to top of message feed
    await page.evaluate(() => {
      const feed = document.getElementById('message-feed');
      if (feed) feed.scrollTop = 0;
    });
    await wait(800);

    // 1. Capture Main Chat Explorer View (preview_chat.png)
    console.log(`Capturing preview_chat.png...`);
    const chatPath = path.resolve(__dirname, '..', 'preview_chat.png');
    await page.screenshot({ path: chatPath, type: 'png' });
    console.log(`✅ Saved: ${chatPath}`);

    // Update docs/preview.png
    const docsPath = path.resolve(__dirname, '..', 'docs', 'preview.png');
    await page.screenshot({ path: docsPath, type: 'png' });
    console.log(`✅ Saved: ${docsPath}`);

    // 2. Open Analytics Studio modal and resize viewport to frame the complete modal beautifully
    console.log(`Opening Analytics Studio modal...`);
    await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 2 });
    await page.evaluate(() => {
      document.getElementById('btn-stats').click();
    });
    await wait(2000);

    console.log(`Capturing preview_stats.png...`);
    const statsPath = path.resolve(__dirname, '..', 'preview_stats.png');
    await page.screenshot({ path: statsPath, type: 'png' });
    console.log(`✅ Saved: ${statsPath}`);

    // Close analytics modal
    await page.evaluate(() => {
      const closeBtn = document.getElementById('modal-stats-close');
      if (closeBtn) closeBtn.click();
    });
    await wait(500);

    // Reset viewport back to 1440x960
    await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 2 });

    // 3. Switch to Midnight (AMOLED) Theme
    console.log(`Applying Midnight AMOLED theme...`);
    await page.evaluate(() => {
      const app = document.getElementById('app');
      app.className = 'theme-midnight density-cozy';
      localStorage.setItem('discord_export_theme', 'theme-midnight');
    });
    await wait(1000);
    console.log(`Capturing preview_theme_midnight.png...`);
    const midnightPath = path.resolve(__dirname, '..', 'preview_theme_midnight.png');
    await page.screenshot({ path: midnightPath, type: 'png' });
    console.log(`✅ Saved: ${midnightPath}`);

    // 4. Switch to Light Theme
    console.log(`Applying Light theme...`);
    await page.evaluate(() => {
      const app = document.getElementById('app');
      app.className = 'theme-light density-cozy';
      localStorage.setItem('discord_export_theme', 'theme-light');
    });
    await wait(1000);
    console.log(`Capturing preview_theme_light.png...`);
    const lightPath = path.resolve(__dirname, '..', 'preview_theme_light.png');
    await page.screenshot({ path: lightPath, type: 'png' });
    console.log(`✅ Saved: ${lightPath}`);

    // 5. Switch to Cyberpunk Theme
    console.log(`Applying Cyberpunk theme...`);
    await page.evaluate(() => {
      const app = document.getElementById('app');
      app.className = 'theme-cyberpunk density-cozy';
      localStorage.setItem('discord_export_theme', 'theme-cyberpunk');
    });
    await wait(1000);
    console.log(`Capturing preview_theme_cyberpunk.png...`);
    const cyberpunkPath = path.resolve(__dirname, '..', 'preview_theme_cyberpunk.png');
    await page.screenshot({ path: cyberpunkPath, type: 'png' });
    console.log(`✅ Saved: ${cyberpunkPath}`);

    // 6. Switch to Sakura Theme
    console.log(`Applying Sakura theme...`);
    await page.evaluate(() => {
      const app = document.getElementById('app');
      app.className = 'theme-sakura density-cozy';
      localStorage.setItem('discord_export_theme', 'theme-sakura');
    });
    await wait(1000);
    console.log(`Capturing preview_theme_sakura.png...`);
    const sakuraPath = path.resolve(__dirname, '..', 'preview_theme_sakura.png');
    await page.screenshot({ path: sakuraPath, type: 'png' });
    console.log(`✅ Saved: ${sakuraPath}`);

  } catch (err) {
    console.error('Error during screenshot capture:', err);
  } finally {
    await browser.close();
    server.kill();
    console.log(`Server stopped. Screenshot generation complete!`);
  }
}

capture().catch(console.error);
