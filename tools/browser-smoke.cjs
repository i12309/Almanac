/* Developer verification only; viewers do not need Node or Playwright. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
let playwright;
try { playwright = require('playwright'); }
catch (error) {
  if (!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) throw new Error('Install developer dependencies: npm install; npx playwright install chromium');
  playwright = require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright'));
}
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'artifacts');
fs.mkdirSync(out, {recursive:true});
const expected = require('../assets/js/labs.js');
const chapters = ['bch-demo','trains-demo','research-demo'];
const tabs = ['story','charts','gallery','lab','code','sources'];
const fileURL = pathToFileURL(path.join(root, 'index.html')).href;
const mime = {'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.svg':'image/svg+xml','.csv':'text/csv;charset=utf-8','.txt':'text/plain;charset=utf-8','.png':'image/png'};
const server = http.createServer((request,response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch (_) { response.writeHead(400).end(); return; }
  if (!pathname.startsWith('/Almanac/')) { response.writeHead(404).end(); return; }
  let relative = pathname.slice('/Almanac/'.length) || 'index.html';
  const filename = path.resolve(root, relative);
  if (!filename.startsWith(root + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) { response.writeHead(404).end(); return; }
  response.writeHead(200, {'Content-Type':mime[path.extname(filename)] || 'text/plain;charset=utf-8'});
  response.end(fs.readFileSync(filename));
});

(async () => {
  const executablePath = process.env.ALMANAC_CHROMIUM_EXECUTABLE || undefined;
  const browser = await playwright.chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const errors = [], externalRequests = [], checks = [];
  try {
    const context = await browser.newContext({viewport:{width:1440,height:980},colorScheme:'light',reducedMotion:'reduce',offline:true,acceptDownloads:true});
    const page = await context.newPage();
    const capture = async filename => {
      await page.evaluate(() => window.scrollTo({top:0,behavior:'instant'}));
      await page.waitForFunction(() => window.scrollY === 0);
      await page.screenshot({path:path.join(out,filename),fullPage:true});
    };
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url())) externalRequests.push(request.url()); });
    await page.goto(fileURL);
    await page.locator('.work-card').first().waitFor();
    assert.equal(await page.locator('.work-card').count(), 3);
    await page.locator('#catalog-search').fill('БЧХ');
    assert.equal(await page.locator('.work-card').count(), 1);
    await page.locator('#catalog-search').fill('нет-такой-работы');
    assert.equal(await page.locator('.work-card').count(), 0);
    await page.locator('#catalog-search').fill('');
    await page.locator('[data-mode="grid"]').click();
    assert.equal(await page.locator('.catalog-grid .work-card').count(),3);
    await page.locator('[data-mode="list"]').click();
    await capture('overview-desktop.png');
    checks.push('catalog search, empty state, two layouts');

    for (const width of [1440,360]) {
      await page.setViewportSize({width,height:980});
      for (const chapter of chapters) for (const tab of tabs) {
        await page.goto(`${fileURL}#work/${chapter}/${tab}`);
        await page.locator('.view-tabs a[aria-current="page"]').waitFor();
        await page.waitForFunction(expectedTab => document.querySelector('.view-tabs a[aria-current="page"]')?.getAttribute('href').endsWith('/'+expectedTab),tab);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        assert.equal(overflow,false,`${chapter}/${tab} overflows at ${width}px`);
        const broken = await page.locator('img').evaluateAll(images => images.filter(image => image.getAttribute('src') && image.complete && !image.naturalWidth).map(image=>image.getAttribute('src')));
        assert.deepEqual(broken,[],`broken images: ${chapter}/${tab}`);
      }
    }
    checks.push('36 file:// chapter/view/width combinations, no horizontal page overflow');
    await page.goto(`${fileURL}#work/bch-demo/lab`);
    await page.locator('#bch-clear').click();
    assert.deepEqual(await Promise.all([1,2,3,4].map(index=>page.locator('#bch-s'+index).textContent())),['0','0','0','0']);
    await page.locator('#bch-two').click();
    assert.deepEqual(await Promise.all([1,2,3,4].map(index=>page.locator('#bch-s'+index).textContent())),['α¹¹','α⁷','α⁴','α¹⁴']);
    await page.locator('#bch-five').click();
    assert.match(await page.locator('#bch-status').textContent(),/другое допустимое/);
    await page.locator('#bch-message').fill('120');
    assert.equal(await page.locator('#bch-message').getAttribute('aria-invalid'),'true');
    await page.locator('#bch-message').fill('0000000');
    assert.equal(await page.locator('#bch-original').textContent(),'000000000000000');
    await page.locator('[data-bit="14"]').click();
    assert.match(await page.locator('#bch-status').textContent(),/Ненулевой синдром/);
    await capture('bch-mobile.png');
    checks.push('BCH edits, known two-error vector, undetected five changes, invalid input');

    await page.goto(`${fileURL}#work/trains-demo/lab`);
    await page.locator('#train-years').fill('10');
    const result = expected.trains.calculate({...expected.trains.defaults,years:10});
    assert.equal((await page.locator('#train-total-a').textContent()).replace(/\s/g,''),new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(result.totals.a).replace(/\s/g,''));
    await page.locator('#train-reset').click();
    assert.equal(await page.locator('#train-years').inputValue(),'20');
    const downloadCSV = page.waitForEvent('download');
    await page.locator('[data-chart-action="csv"]').click();
    await (await downloadCSV).saveAs(path.join(out,'scenario.csv'));
    assert.match(fs.readFileSync(path.join(out,'scenario.csv'),'utf8'),/289\.486/);
    const downloadSVG = page.waitForEvent('download');
    await page.locator('[data-chart-action="svg"]').click();
    await (await downloadSVG).saveAs(path.join(out,'scenario.svg'));
    const svg = fs.readFileSync(path.join(out,'scenario.svg'),'utf8');
    assert.match(svg,/<svg/); assert.match(svg,/Учебная модель/);
    await page.locator('.data-details summary').click();
    assert.equal(await page.locator('.data-details tbody tr').count(),21);
    await page.setViewportSize({width:1440,height:980});
    await page.locator('.data-details summary').click();
    await capture('trains-desktop.png');
    await page.locator('#theme-toggle').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    await capture('trains-dark.png');
    checks.push('train sliders, reset, exact CSV, standalone SVG, table, dark theme');

    await page.goto(`${fileURL}#work/research-demo/lab`);
    await page.locator('#response-gain').fill('2');
    assert.equal(await page.locator('#response-gain-value').textContent(),'2');
    await page.locator('#response-reset').click();
    assert.equal(await page.locator('#response-gain').inputValue(),'1');
    await page.goto(`${fileURL}#work/bch-demo/gallery`);
    await page.locator('[data-image="0"]').click();
    assert.equal(await page.locator('#image-dialog').evaluate(el=>el.open),true);
    const imageTitle=await page.locator('#image-title').textContent();
    await page.locator('#image-zoom-in').click();
    assert.equal(await page.locator('#image-zoom-label').textContent(),'150%');
    await page.locator('#image-next').click();
    assert.notEqual(await page.locator('#image-title').textContent(),imageTitle);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#image-dialog').evaluate(el=>el.open),false);
    await page.goto(`${fileURL}#work/bch-demo/code`);
    await page.locator('[data-code-highlight="0"]').click();
    assert.ok(await page.locator('.code-lines li.is-highlighted').count()>0);
    await page.locator('[data-action="copy-code"]').click();
    await page.locator('#toast').waitFor({state:'visible'});
    await page.locator('.skip-link').focus();
    await page.keyboard.press('Enter');
    assert.match(page.url(),/#work\/bch-demo\/code$/);
    assert.equal(await page.locator('#main-content').evaluate(el=>el===document.activeElement),true);
    checks.push('research sliders, gallery zoom/paging/Escape, code selection/copy, skip link');

    await page.setViewportSize({width:360,height:900});
    await page.goto(`${fileURL}#work/bch-demo/story`);
    await page.locator('#menu-toggle').click();
    await page.locator('#chapter-nav a').last().click();
    assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'),'false');
    await page.goto(fileURL+'#work/nonexistent/story');
    assert.match(await page.locator('h1').textContent(),/не найдена/);
    await page.locator('a[href="#library"]').last().click();
    await page.locator('.work-card').first().waitFor();
    assert.equal(await page.locator('.work-card').count(),3);
    checks.push('mobile menu and section navigation, unknown chapter recovery');
    assert.deepEqual(externalRequests,[],'file edition made an external request');

    const noJS = await browser.newContext({javaScriptEnabled:false,offline:true,viewport:{width:900,height:800}});
    const readPage = await noJS.newPage();
    await readPage.goto(pathToFileURL(path.join(root,'read/bch-demo.html')).href);
    assert.match(await readPage.locator('h1').textContent(),/БЧХ/);
    assert.ok(await readPage.locator('pre code').count()>0);
    assert.ok(await readPage.locator('table tbody tr').count()>0);
    await noJS.close();
    checks.push('readable chapter, table and source code with JavaScript disabled');

    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin=`http://127.0.0.1:${server.address().port}`;
    const httpContext=await browser.newContext({viewport:{width:1280,height:900}});
    const httpPage=await httpContext.newPage();
    httpPage.on('pageerror',error=>errors.push(error.message));
    const badResponses=[];
    httpPage.on('response',response=>{if(response.status()>=400)badResponses.push(response.url());});
    await httpPage.goto(`${origin}/Almanac/index.html#work/trains-demo/lab`);
    await httpPage.locator('#train-total-a').waitFor();
    await httpPage.goto(`${origin}/Almanac/index.html#work/bch-demo/gallery`);
    await httpPage.locator('[data-image="0"] img').waitFor();
    await httpPage.locator('[data-image="0"]').click();
    await httpPage.waitForFunction(()=>document.querySelector('#image-full').naturalWidth>0);
    assert.deepEqual(badResponses,[]);
    await httpContext.close();
    checks.push('HTTP hosting in /Almanac/ prefix: scripts, styles, charts and images');
    assert.deepEqual(errors,[]);
    const report={browser:await browser.version(),checks,externalRequests:[],pageErrors:[],result:'passed'};
    fs.writeFileSync(path.join(out,'browser-smoke.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report,null,2));
  } finally {
    await browser.close();
    if(server.listening) await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
