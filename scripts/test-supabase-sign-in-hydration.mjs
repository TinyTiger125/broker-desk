import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import ts from 'typescript';
const require=createRequire(import.meta.url),React=require('react');
const source=fs.readFileSync('src/components/supabase-sign-in-form.tsx','utf8');
const props={emailLabel:'Email',passwordLabel:'Password',submitLabel:'Login',errorLabel:'Login failed'};
const compiled={exports:{}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:compiled,exports:compiled.exports,require:name=>name==='next/navigation'?{useRouter:()=>({replace(){},refresh(){}})}:name==='@/lib/supabase/client'?{createSupabaseBrowserClient:()=>{throw new Error('SSR must not authenticate');}}:require(name)});
const html=require('react-dom/server').renderToString(React.createElement(compiled.exports.SupabaseSignInForm,props));
assert.match(html,/data-auth-hydrated="false"/);assert.match(html,/<button[^>]*disabled=""/);
if(process.argv.includes('--browser')){
 const {chromium}=await import('/Users/laineyzhu/.npm/_npx/ccaf859227691e24/node_modules/playwright/index.mjs');
 const {webpack}=require('next/dist/compiled/webpack/webpack');const root=fs.mkdtempSync('/tmp/sign-in-hydration-');let browser;
 try{
 const clientSource=source.replace('import { useRouter } from "next/navigation";', 'const useRouter=()=>({replace(){},refresh(){}});').replace('import { createSupabaseBrowserClient } from "@/lib/supabase/client";','const createSupabaseBrowserClient=()=>({auth:{signInWithPassword:async()=>{window.__loginCalls=(window.__loginCalls||0)+1;return {error:null};}}});');
 const entry=ts.transpileModule(clientSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText+'\nimport {hydrateRoot} from "react-dom/client";import {createElement} from "react";hydrateRoot(document.getElementById("root"),createElement(SupabaseSignInForm,'+JSON.stringify(props)+'));';
 await new Promise((done,fail)=>{const compiler=webpack({mode:'development',devtool:false,entry:`data:text/javascript,${encodeURIComponent(entry)}`,output:{path:root,filename:'login-chunk.js'},resolve:{modules:[resolve('node_modules')]}});compiler.run((error,stats)=>compiler.close(()=>error||stats.hasErrors()?fail(new Error('fixture_bundle_failed')):done()));});
 browser=await chromium.launch({headless:true,executablePath:'/Users/laineyzhu/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--disable-background-networking']});const context=await browser.newContext(),page=await context.newPage();let release;const delayed=new Promise(r=>release=r);let pageGets=0;
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!=='https://fixture.invalid')return route.abort();if(url.pathname==='/login-chunk.js'){await delayed;return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(join(root,'login-chunk.js'))});}pageGets++;return route.fulfill({contentType:'text/html',body:`<div id="root">${html}</div><script async src="/login-chunk.js"></script>`});});
 await page.goto('https://fixture.invalid/sign-in',{waitUntil:'domcontentloaded'});assert(await page.locator('button[type=submit]').isDisabled());await page.locator('button[type=submit]').evaluate(button=>button.click());assert.equal(pageGets,1);
 const hydrated=page.locator('form[data-auth-hydrated=true]').waitFor({state:'visible'});release();await hydrated;assert.equal(await page.locator('button[type=submit]').isDisabled(),false);await page.locator('input[type=email]').fill('dummy@example.invalid');await page.locator('input[type=password]').fill('fake-only');await page.locator('button[type=submit]').click();await page.waitForFunction(()=>window.__loginCalls===1);assert.equal(pageGets,1);await context.close();
 console.log(JSON.stringify({pass:true,actualComponentSSRAndHydration:true,delayedChunk:true,preHydrationDisabled:true,normalLoginCalls:1,nativeReloads:0,cloudExecuted:false}));
 }finally{if(browser)await browser.close().catch(()=>{});fs.rmSync(root,{recursive:true,force:true});}
}else console.log(JSON.stringify({pass:true,actualComponentSSR:true,preHydrationDisabled:true,browser:'not_requested'}));
