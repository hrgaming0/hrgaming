import express from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { Buffer } from 'buffer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 66;
const randomDelay = (min = 500, max = 3000) =>
  new Promise(resolve => setTimeout(resolve, Math.random() * (max - min) + min));

const runPuppeteerScript = async (assetname) => {
  const assetname1 = assetname.replace(/[^A-Z/]/g, '').replace('/', '').replace('OTC', '');
  console.log(`Processed asset name: ${assetname1}`);

  let processedData = null;

  const moveMouseHumanly = async (page, fromX, fromY, toX, toY) => {
    const steps = Math.floor(Math.random() * 15) + 10;
    for (let i = 0; i <= steps; i++) {
      const x = fromX + ((toX - fromX) * i) / steps;
      const y = fromY + ((toY - fromY) * i) / steps;
      await page.mouse.move(x, y);
      await randomDelay(10, 50);
    }
  };

  const humanType = async (page, selector, text) => {
    for (const char of text) {
      await page.type(selector, char);
      await randomDelay(100, 300);
    }
  };

  const sessionFilePath = path.join(__dirname, 'session.json');

  const loadSession = () => {
    if (fs.existsSync(sessionFilePath)) {
      const sessionData = JSON.parse(fs.readFileSync(sessionFilePath, 'utf-8'));
      return sessionData;
    }
    return null;
  };

  const saveSession = sessionData => {
    fs.writeFileSync(sessionFilePath, JSON.stringify(sessionData, null, 4));
  };

  let sessionData = loadSession();
  let browser, page;

  if (sessionData) {
    console.log('Session found, using saved cookies and token...');

    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: [
        '--disable-web-security',
        '--no-sandbox',
        '--aggressive-cache-discard',
        '--disable-cache',
        '--disable-application-cache',
        '--disable-offline-load-stale-cache',
        '--disk-cache-size=0',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--metrics-recording-only',
        '--mute-audio',
        '--safebrowsing-disable-auto-update',
        '--ignore-certificate-errors',
        '--ignore-ssl-errors',
        '--ignore-certificate-errors-spki-list',
        '--disable-features=LeakyPeeker',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
      ],
    });

    page = await browser.newPage();
    await page.setUserAgent(sessionData.user_agent);

    const cookies = sessionData.cookies.split('; ').map(cookieString => {
      const [name, value] = cookieString.split('=');
      return { name, value, domain: '.qxbroker.com' };
    });

    await page.setCookie(...cookies);
    await page.goto('https://qxbroker.com/en/demo-trade', { waitUntil: 'networkidle2' });

    if (await page.url() === 'https://qxbroker.com/en/demo-trade') {
      console.log('Logged in using session successfully.');
    } else {
      console.log('Session expired, proceeding with manual login.');
      sessionData = null;
    }
  }

  if (!sessionData) {
    console.log('No session found or session expired, logging in manually...');

    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: [
        '--disable-web-security',
        '--no-sandbox',
        '--aggressive-cache-discard',
        '--disable-cache',
        '--disable-application-cache',
        '--disable-offline-load-stale-cache',
        '--disk-cache-size=0',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--metrics-recording-only',
        '--mute-audio',
        '--safebrowsing-disable-auto-update',
        '--ignore-certificate-errors',
        '--ignore-ssl-errors',
        '--ignore-certificate-errors-spki-list',
        '--disable-features=LeakyPeeker',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
      ],
    });

    page = await browser.newPage();
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36';
    await page.setUserAgent(userAgent);
    await page.goto('https://qxbroker.com/en/sign-in', { waitUntil: 'networkidle2' });

    await page.evaluate(() => window.scrollBy(0, 200));
    await randomDelay();
    await humanType(page, '.active .modal-sign__input-value[type=email]', 'kdpathokkdpathok34@gmail.com');
    await randomDelay();
    await humanType(page, '.active .modal-sign__input-value[type=password]', 'kdpathokkdpathok34');
    await randomDelay();

    const loginButton = await page.$('.active .modal-sign__block-button');
    const buttonBox = await loginButton.boundingBox();
    await moveMouseHumanly(page, 0, 0, buttonBox.x + buttonBox.width / 2, buttonBox.y + buttonBox.height / 2);
    await loginButton.click();

    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    console.log('Login successful, capturing session data...');

    const cookies = await page.cookies();

    const token = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script[type="text/javascript"]'));
      let token = null;

      scripts.forEach(script => {
        const scriptContent = script.innerText;
        if (scriptContent.includes('window.settings')) {
          const settingsText = scriptContent.replace('window.settings = ', '').replace(';', '').trim();
          try {
            const settings = JSON.parse(settingsText);
            token = settings.token;
          } catch (e) {
            console.error("Error parsing token from settings:", e);
          }
        }
      });

      return token;
    });

    sessionData = {
      cookies: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '),
      token: token || 'Token not found',
      user_agent: userAgent,
    };

    saveSession(sessionData);
    console.log(`Session data saved to ${sessionFilePath}`);
  }

  const client = await page.target().createCDPSession();
  await client.send('Network.enable');
  await client.send('Page.enable');

  async function checkPageLoad(page) {
    await page.waitForFunction(
      () => document.readyState === "complete",
      { timeout: 30000 }
    );
  }

  await checkPageLoad(page);

  let tabIsActive = false;
  tabIsActive = await page.evaluate((assetname) => {
    const activeTab = document.querySelector('.tab.desktop.active .tab__label');
    return activeTab && activeTab.textContent.trim() === assetname;
  }, assetname);

  if (!tabIsActive) {
    await page.waitForSelector('.asset-select__button', { timeout: 5000 });
    await page.click('.asset-select__button');

    await page.waitForSelector('div.assets-table__name', { timeout: 10000 });

    await page.evaluate((assetname) => {
      const divs = document.querySelectorAll('div.assets-table__name span');
      divs.forEach(span => {
        if (span.textContent.trim() === assetname) {
          span.closest('div.assets-table__name').click();
        }
      });
    }, assetname);
  }

  let assetNotFoundCount = 0;
  client.on('Network.webSocketFrameReceived', async (params) => {
    try {
      let payloadData = params.response.payloadData;

      if (params.response.opcode === 2) {
        payloadData = Buffer.from(payloadData, 'base64').toString('utf-8');
      }

      if (payloadData.includes('asset') && payloadData.includes('candles') && payloadData.includes(assetname1)) {
        console.log('Found "assets" in payload data.');

        function decodePayloadData(payload) {
          try {
            let cleanedPayload = payload
              .replace(/\u0004/g, '')
              .replace(/,\s*]/g, ']')
              .replace(/,\s*}/g, '}')
              .replace(/,,+/g, ',')
              .replace(/\[,/g, '[')
              .replace(/{,/g, '{');

            return JSON.parse(cleanedPayload);
          } catch (error) {
            console.error('Error parsing payloadData:', error.message);
            return null;
          }
        }

        function convertTimestamp(timestamp) {
          const date = new Date(timestamp * 1000);
          return date.toLocaleString();
        }

        function formatHistory(history) {
          return history.map(([timestamp, price, volume]) => ({
            timestamp: convertTimestamp(timestamp),
            price,
            volume,
          }));
        }

        function formatCandles(candles) {
          return candles.map(([timestamp, open, close, high, low, volume, last_trade]) => ({
            timestamp: convertTimestamp(timestamp),
            open,
            close,
            high,
            low,
            volume,
            last_trade: convertTimestamp(last_trade),
          }));
        }

        const decoded = decodePayloadData(payloadData);
        if (decoded) {
          processedData = {
            asset: decoded.asset || 'unknown',
            period: decoded.period || 'unknown',
            history: formatHistory(decoded.history || []),
            candles: formatCandles(decoded.candles || []),
          };

          console.log(processedData);
          await browser.close();
        }

      } else {
        assetNotFoundCount++;

        if (assetNotFoundCount >= 33) {
            console.log('Asset not found 33 times, closing the browser.');
            await browser.close();
        }
      }
    } catch (error) {
      console.error('Error processing WebSocket frame:', error);
    }
  });

  // await page.screenshot({ path: 'trader.png' });
  await randomDelay();
  console.log('Process finished.');
  return processedData;
};

// Express route
app.get('/quotex', async (req, res) => {
  const assetname = req.query.assetname || 'USD/BRL (OTC)';
  console.log(`Received request for asset: ${assetname}`);
  
  try {
    const processedData = await runPuppeteerScript(assetname);
    
    if (processedData) {
      console.log('Sending processed data in response');
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(processedData, null, 2));
      // res.json(processedData); 
    } else {
      throw new Error('Processed data is null');
    }
  } catch (error) {
    console.error('Error in /quotex route:', error.message);
    res.status(500).send('Error processing request.');
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
