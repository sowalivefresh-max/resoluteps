const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('PAGE ERROR LOG:', msg.text());
    } else {
      console.log('PAGE LOG:', msg.text());
    }
  });

  page.on('pageerror', error => {
    console.log('PAGE ERROR EVENT:', error.message);
  });

  try {
    await page.goto('http://localhost:5000/DeveloperDashboard.html', { waitUntil: 'domcontentloaded', timeout: 5000 });
  } catch (e) {
    console.log('Navigation Error:', e.message);
  }

  // Wait just a bit to capture any async errors
  await new Promise(r => setTimeout(r, 2000));
  
  await browser.close();
})();
