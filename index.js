const puppeteer = require("puppeteer");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const USER_DATA_DIR = path.join(__dirname, "puppeteer_cache");

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

const pages = 104;
const loadContentDelay = 1000;

const downloadImage = async (url, filepath) => {
  const response = await axios({
    url,
    responseType: "stream",
  });
  return new Promise((resolve, reject) => {
    response.data
      .pipe(fs.createWriteStream(filepath))
      .on("finish", () => resolve())
      .on("error", (e) => reject(e));
  });
};

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      var totalHeight = 0;
      var distance = 200;
      var timer = setInterval(() => {
        var scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}

const scrapePage = async (pageNumber) => {
  const url = `https://coinmarketcap.com/?page=${pageNumber}`;
  console.log(`Parse page ${pageNumber} / ${pages}: ${url}`);

  const browser = await puppeteer.launch({
    headless: true,
    // headless: false,
    userDataDir: USER_DATA_DIR, // Папка для кэширования
  });
  const page = await browser.newPage();

  // await page.setRequestInterception(true);
  // page.on('request', (req) => {
  //     const resourceType = req.resourceType();
  //     if (['image', 'stylesheet', 'font'].includes(resourceType) && !req.url().includes('coin-logo')) {
  //         req.abort();
  //     } else {
  //         req.continue();
  //     }
  // });

  await page.goto(url, { timeout: 120000, waitUntil: "networkidle2" });
  await page.setViewport({
    width: 1200,
    height: 800,
  });

  await autoScroll(page);

  // await autoScroll(page);    // const browser = await puppeteer.launch({ headless: true });
  // const browser = await puppeteer.launch({ headless: false });
  // const page = await browser.newPage();
  // await page.goto(url);

  // Промотка страницы до конца
  // await page.evaluate(() => {
  //     window.scrollTo(0, document.body.scrollHeight);
  // });
  // await page.waitForTimeout(2000); // Ожидание загрузки контента
  await sleep(loadContentDelay);

  // Парсинг таблицы
  const coins = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("tr"));
    return rows
      .map((row) => {
        const imgElement = row.querySelector("img.coin-logo");
        const symbolElement = row.querySelector("p.coin-item-symbol");

        if (imgElement && symbolElement) {
          const imgSrc = imgElement.getAttribute("src");
          const coinName = symbolElement.textContent;
          const extension = imgSrc.split(".").pop();
          return { imgSrc, coinName, extension };
        }
        return null;
      })
      .filter(Boolean);
  });

  await browser.close();

  return coins.filter((item) => {
    // check if a file exists in folder 'data'
    if (!item?.coinName || !item?.extension) return false;

    const coinName = item.coinName.toLowerCase();
    const filepath = `./data/${coinName}.${item.extension}`;

    return !fs.existsSync(filepath || "");
  });
};

const saveIcons = async (coins) => {
  const dataDir = path.join(__dirname, "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }

  for (const coin of coins) {
    const imageUrl = coin.imgSrc;
    const coinName = coin.coinName?.toLowerCase().replace("/", "-");
    const fileExtension = path.extname(imageUrl).split("?")[0]; // Получаем расширение файла
    const filepath = path.join(dataDir, `${coinName}${fileExtension}`);

    try {
      console.log(`Download ${coinName} from ${imageUrl}`);
      await downloadImage(imageUrl, filepath);
    } catch (err) {
      console.error(`Error while downloading ${coinName}: ${err}`);
    }
  }
};

const scrapeAllPages = async () => {
  for (let i = 1; i < pages; i++) {
    const coins = await scrapePage(i);
    if (coins.length === 0) {
      console.log(`No new data on the page ${i}`);
      // break;
    } else {
      await saveIcons(coins);
    }
  }
};

scrapeAllPages().then(() => console.log("Parsing is done"));
