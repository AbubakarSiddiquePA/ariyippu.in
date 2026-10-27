import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const context=await browser.newContext();const page=await context.newPage();const other=await context.newPage();const errors=[];for(const p of [page,other])p.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8787/admin');await page.locator('#studio').waitFor({state:'visible'});assert.match(await page.locator('.private-label').textContent(),/simulated login/);await other.goto('http://127.0.0.1:8787/admin');await other.locator('#studio').waitFor({state:'visible'});
 await page.locator('#title').fill('Private unsaved session check');await page.waitForFunction(()=>!!localStorage.getItem('ariyippu-editor-backup-v2'));
 await page.route('**/api/admin/session',r=>r.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'Expired',code:'AUTH_REQUIRED'})}));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.locator('#sessionLock').waitFor({state:'visible'});assert.ok(!await page.locator('#studio').isVisible());assert.ok(await page.evaluate(()=>!!localStorage.getItem('ariyippu-editor-backup-v2')));
 await page.unroute('**/api/admin/session');await page.locator('#resumeSession').click();await page.locator('#studio').waitFor({state:'visible'});assert.equal(await page.locator('#title').inputValue(),'Private unsaved session check');
 page.once('dialog',d=>d.dismiss());await page.locator('#adminSignOut').click();assert.ok(await page.locator('#studio').isVisible());
 page.once('dialog',d=>d.accept());await page.locator('#adminSignOut').click();await page.waitForURL('**/admin-login');assert.match(await page.locator('h1').textContent(),/signed out/);assert.equal(await page.evaluate(()=>localStorage.getItem('ariyippu-editor-backup-v2')),null);
 await other.locator('#sessionLock').waitFor({state:'visible'});assert.equal(await other.locator('#title').inputValue(),'');assert.ok(!await other.locator('#studio').isVisible());
 await page.goBack();await page.locator('#sessionLock').waitFor({state:'visible'});assert.ok(!await page.locator('#studio').isVisible());
 await page.goto('http://127.0.0.1:8787/admin-login');await page.locator('#adminSignIn').click();await page.locator('#studio').waitFor({state:'visible'});assert.equal(await page.locator('#title').inputValue(),'');assert.deepEqual(errors,[]);console.log(JSON.stringify({expiredSessionLocksEditor:true,unsavedTextPreserved:true,resumeWorks:true,cancelSignoutWorks:true,signoutClearsBackup:true,otherTabLocked:true,backDoesNotRevealEditor:true,localLoginLabelledSimulated:true,errors}));
}finally{await browser.close()}
