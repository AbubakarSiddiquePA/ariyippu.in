import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
const page=await browser.newPage({viewport:{width:1500,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
await page.goto('http://127.0.0.1:8787/admin');await page.locator('#studio').waitFor({state:'visible'});
await page.locator('#title').fill('Welcome to our website.');
await page.locator('[data-preview-lang="ml"]').click();await page.locator('#status').filter({hasText:'Translated to Malayalam.'}).waitFor({timeout:60000});
const frame=page.frameLocator('#preview');await frame.locator('h1').filter({hasText:/[\u0d00-\u0d7f]/}).waitFor();
await page.locator('#editPreviewLanguage').click();assert.match(await page.locator('#title').inputValue(),/[\u0d00-\u0d7f]/);
// Explicit retranslation allows editing in either direction while preserving user control.
await page.locator('#translate').click();await page.locator('#status').filter({hasText:'Translated to English.'}).waitFor({timeout:60000});await frame.locator('h1').filter({hasText:/Welcome/i}).waitFor();
await page.locator('[data-lang="en"]').click();await page.locator('#title').fill('Preview changes immediately');await frame.locator('h1').filter({hasText:'Preview changes immediately'}).waitFor();
await page.locator('[data-add="paragraph"]').click();await page.locator('#blocks textarea').fill('A paragraph that appears in real time.');await frame.locator('.paragraph').filter({hasText:'A paragraph that appears in real time.'}).waitFor();
await page.locator('[data-add="table"]').click();await page.locator('#blocks textarea').last().fill('Item | Price\nLaptop | 55000\nPhone | 25000');await frame.locator('table tr').nth(2).waitFor();assert.equal(await frame.locator('table tr').count(),3);
await page.locator('#size').selectOption('375px');await page.screenshot({path:'admin-desktop-check.png',fullPage:true});
// Fail a translation deliberately; neither the source nor existing target may be replaced.
const targetBefore=await page.locator('#title').inputValue();await page.route('**/api/admin/translate',route=>route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'Translation service is busy. Please try later.'})}));await page.locator('#translate').click();await page.locator('#status').filter({hasText:'Translation service is busy.'}).waitFor();assert.equal(await page.locator('#title').inputValue(),targetBefore);assert.ok(await page.locator('#translate').isEnabled());
// Browser recovery works after an accidental refresh.
await page.waitForFunction(()=>!!localStorage.getItem('ariyippu-editor-backup-v2'));await page.reload();await page.locator('#restore').click();assert.equal(await page.locator('#title').inputValue(),'Preview changes immediately');assert.equal(await page.locator('#blocks textarea').count(),2);
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'admin-mobile-check.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
console.log(JSON.stringify({livePreview:true,tableRows:3,englishToMalayalam:true,malayalamToEnglish:true,translationFailurePreservesText:true,browserRecovery:true,mobileOverflow:false,browserErrors:errors}));
}finally{await browser.close();}
