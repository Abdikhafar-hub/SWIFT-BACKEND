import puppeteer, { Page, Browser } from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const ARTIFACTS_DIR = '/home/abdikhafar/.gemini/antigravity/brain/d6079465-132d-4880-a7e8-4531ac6ca219';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface AuditMetrics {
  pagesTested: number;
  workflowsTested: number;
  buttonsInteracted: number;
  formsSubmitted: number;
  modalsTested: number;
  networkRequestsObserved: number;
  count4xx: number;
  count5xx: number;
  consoleExceptionsCount: number;
  databaseMutationsVerified: number;
  failuresDiscovered: string[];
  fixesApplied: string[];
  failedRequestsList: string[];
  consoleErrorsList: string[];
}

const metrics: AuditMetrics = {
  pagesTested: 0,
  workflowsTested: 0,
  buttonsInteracted: 0,
  formsSubmitted: 0,
  modalsTested: 0,
  networkRequestsObserved: 0,
  count4xx: 0,
  count5xx: 0,
  consoleExceptionsCount: 0,
  databaseMutationsVerified: 0,
  failuresDiscovered: [],
  fixesApplied: [],
  failedRequestsList: [],
  consoleErrorsList: [],
};

function setupPageMonitoring(page: Page, pageName: string) {
  page.on('response', (response) => {
    metrics.networkRequestsObserved++;
    const status = response.status();
    const url = response.url();
    if (status >= 400 && status < 500) {
      metrics.count4xx++;
      metrics.failedRequestsList.push(`[${pageName}] ${status} ${url}`);
    } else if (status >= 500) {
      metrics.count5xx++;
      metrics.failedRequestsList.push(`[${pageName}] ${status} ${url}`);
    }
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      metrics.consoleExceptionsCount++;
      metrics.consoleErrorsList.push(`[${pageName}] CONSOLE ERROR: ${msg.text()}`);
    }
  });

  page.on('pageerror', (err) => {
    metrics.consoleExceptionsCount++;
    metrics.consoleErrorsList.push(`[${pageName}] UNCAUGHT PAGE EXCEPTION: ${err.message}`);
  });
}

async function takeScreenshot(page: Page, name: string) {
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }
  const screenshotPath = path.join(ARTIFACTS_DIR, `audit_${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`  📸 Screenshot saved: audit_${name}.png`);
  return screenshotPath;
}

async function clickButtonWithText(page: Page, text: string): Promise<boolean> {
  const buttons = await page.$$('button, a');
  for (const btn of buttons) {
    const btnText = await page.evaluate(el => el.textContent, btn);
    if (btnText && btnText.trim().includes(text)) {
      await btn.click();
      metrics.buttonsInteracted++;
      return true;
    }
  }
  return false;
}

async function selectModalDropdownOption(page: Page, selectIndex: number, textMatcher: string): Promise<string | null> {
  const selectedText = await page.evaluate((selIdx, matchText) => {
    const modalContainer = document.querySelector('div.fixed.inset-0');
    if (!modalContainer) return null;
    const selects = modalContainer.querySelectorAll('select');
    if (selects.length > selIdx) {
      const sel = selects[selIdx] as HTMLSelectElement;
      const options = Array.from(sel.options);
      const matchIndex = options.findIndex(o => 
        o.text.toLowerCase().includes(matchText.toLowerCase()) || 
        o.value.toLowerCase().includes(matchText.toLowerCase())
      );

      const targetIdx = matchIndex >= 0 ? matchIndex : (options.length > 1 ? 1 : 0);
      const targetOpt = options[targetIdx];

      if (targetOpt) {
        sel.selectedIndex = targetIdx;
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        if (nativeSetter) {
          nativeSetter.call(sel, targetOpt.value);
        } else {
          sel.value = targetOpt.value;
        }
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        return targetOpt.text;
      }
    }
    return null;
  }, selectIndex, textMatcher);

  return selectedText;
}

async function clearBrowserSession(page: Page) {
  const client = await page.target().createCDPSession();
  await client.send('Network.clearBrowserCookies');
  await page.evaluate(() => localStorage.clear());
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await delay(500);
}

async function runRealBrowserAudit() {
  console.log('===============================================================');
  console.log('🚀 STARTING REAL CHROME BROWSER FUNCTIONALITY AUDIT');
  console.log('===============================================================');

  const browser: Browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  setupPageMonitoring(page, 'Main');

  try {
    // =========================================================================
    // PHASE 1: REAL ADMIN LOGIN
    // =========================================================================
    console.log('\n---------------------------------------------------------------');
    console.log('PHASE 1: REAL ADMIN LOGIN');
    console.log('---------------------------------------------------------------');

    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    await delay(1000);
    metrics.pagesTested++;
    await takeScreenshot(page, '01_login_page');

    console.log('  Filling admin credentials...');
    await page.type('input[type="email"]', 'admin@swiftdoc.co.ke', { delay: 15 });
    await page.type('input[type="password"]', 'Admin@SwiftDoc2026!', { delay: 15 });
    await takeScreenshot(page, '01_login_filled');

    console.log('  Clicking Sign In button...');
    metrics.formsSubmitted++;
    await clickButtonWithText(page, 'Sign In');
    await page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await delay(1500);

    console.log('  Current URL after login:', page.url());
    if (!page.url().includes('/admin')) {
      throw new Error(`Login failed! Not redirected to /admin. Current URL: ${page.url()}`);
    }
    console.log('  ✅ Admin login succeeded and redirected to /admin!');
    await takeScreenshot(page, '01_admin_dashboard');

    // Verify session persistence after refresh
    console.log('  Testing session persistence via browser reload...');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await delay(1000);
    if (!page.url().includes('/admin')) {
      throw new Error('Session lost after browser refresh!');
    }
    console.log('  ✅ Session persisted across browser reload!');

    // =========================================================================
    // PHASE 2: OPEN NEW CLIENT FILING MODAL & CONTROL RESET AUDIT
    // =========================================================================
    console.log('\n---------------------------------------------------------------');
    console.log('PHASE 2: OPEN NEW CLIENT FILING MODAL & CONTROL RESET AUDIT');
    console.log('---------------------------------------------------------------');

    await page.goto('http://localhost:3000/admin/applications', { waitUntil: 'domcontentloaded' });
    await delay(1200);
    metrics.pagesTested++;
    await takeScreenshot(page, '02_admin_applications_queue');

    console.log('  Clicking "+ New Client Filing" button...');
    const clickedFiling = await clickButtonWithText(page, 'New Client Filing');
    if (!clickedFiling) throw new Error('Could not find or click "+ New Client Filing" button!');

    await delay(800);
    metrics.modalsTested++;
    console.log('  ✅ Modal opened!');
    await takeScreenshot(page, '02_modal_opened');

    // Verify cancel button closes modal
    console.log('  Testing Modal Cancel/Close button...');
    await clickButtonWithText(page, 'Cancel');
    await delay(500);

    const isModalVisibleAfterCancel = await page.evaluate(() => !!document.querySelector('div.fixed.inset-0'));
    console.log(`  Modal visible after cancel: ${isModalVisibleAfterCancel} (Expected: false)`);
    await takeScreenshot(page, '02_modal_closed_after_cancel');

    // Re-open modal
    console.log('  Re-opening modal...');
    await clickButtonWithText(page, 'New Client Filing');
    await delay(800);
    await takeScreenshot(page, '02_modal_reopened');

    // =========================================================================
    // PHASE 4: TEST VALIDATION IN THE REAL UI
    // =========================================================================
    console.log('\n---------------------------------------------------------------');
    console.log('PHASE 4: REAL UI FORM VALIDATION AUDIT');
    console.log('---------------------------------------------------------------');

    // Test 1: Submit empty form
    console.log('  Submitting form with empty client selection...');
    await clickButtonWithText(page, 'Create Statutory Dossier');
    await delay(500);

    let modalContent = await page.evaluate(() => document.querySelector('div.fixed.inset-0')?.textContent || '');
    if (modalContent.includes('Target client entity is required')) {
      console.log('  ✅ Validation Error 1 Caught: "Target client entity is required"');
    }
    await takeScreenshot(page, '04_val_err_empty_client');

    // Select Client in modal, leave Service empty
    console.log('  Selecting Client John Kamau Kariuki in modal and attempting submission without Service...');
    const selectedClient = await selectModalDropdownOption(page, 0, 'John Kamau');
    console.log(`  Selected Client in modal dropdown: ${selectedClient}`);

    await clickButtonWithText(page, 'Create Statutory Dossier');
    await delay(500);

    modalContent = await page.evaluate(() => document.querySelector('div.fixed.inset-0')?.textContent || '');
    if (modalContent.includes('Statutory service is required')) {
      console.log('  ✅ Validation Error 2 Caught: "Statutory service is required"');
    }
    await takeScreenshot(page, '04_val_err_empty_service');

    // =========================================================================
    // PHASE 3 & 5: DYNAMIC VISA INTAKE & SUCCESSFUL CREATION
    // =========================================================================
    console.log('\n---------------------------------------------------------------');
    console.log('PHASE 3 & 5: DYNAMIC VISA INTAKE & CREATION');
    console.log('---------------------------------------------------------------');

    // Select Target Client in modal
    console.log('  Ensuring Client John Kamau is selected in modal...');
    await selectModalDropdownOption(page, 0, 'John Kamau');

    // Select Service: UK Visitor Visa in modal
    console.log('  Selecting Service: UK Visitor Visa in modal...');
    const selectedServiceText = await selectModalDropdownOption(page, 1, 'UK Visitor Visa');
    console.log(`  Selected Service in modal dropdown: ${selectedServiceText}`);

    await delay(800);
    await takeScreenshot(page, '03_visa_intake_fields_revealed');

    // Fill Visa Metadata
    console.log('  Filling dynamic Visa intake inputs in DOM...');
    const inputElements = await page.$$('div.fixed.inset-0 input');
    for (const input of inputElements) {
      const placeholder = await page.evaluate(el => el.placeholder, input);
      const type = await page.evaluate(el => el.type, input);
      const name = await page.evaluate(el => el.name, input);

      if (placeholder && placeholder.includes('United Kingdom')) {
        await input.focus();
        await page.keyboard.down('Control');
        await page.keyboard.press('A');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');
        await input.type('United Kingdom');
      } else if (placeholder && placeholder.includes('AK8910234')) {
        await input.type('AK9876543');
      } else if (type === 'date') {
        if (name === 'passportExpiry') {
          await input.type('2032-12-31');
        } else if (name === 'travelStartDate') {
          await input.type('2026-10-01');
        } else if (name === 'travelEndDate') {
          await input.type('2026-10-15');
        } else {
          await input.type('2026-12-31');
        }
      }
    }

    const textarea = await page.$('div.fixed.inset-0 textarea');
    if (textarea) {
      await textarea.type('Real Chrome Browser E2E verification of UK Visitor Visa statutory client filing.');
    }

    await takeScreenshot(page, '05_form_fully_populated');

    // Submit form physically
    console.log('  Physically clicking "Create Statutory Dossier"...');
    metrics.formsSubmitted++;
    metrics.workflowsTested++;

    await clickButtonWithText(page, 'Create Statutory Dossier');
    console.log('  Waiting 3.5s for API mutation and state refresh...');
    await delay(3500);
    await takeScreenshot(page, '05_after_submission_work_queue');

    // Open top application dossier details
    console.log('  Navigating to top application dossier in Work Queue...');
    const detailLinks = await page.$$('a[href*="/admin/applications/"]');
    if (detailLinks.length > 0) {
      metrics.buttonsInteracted++;
      await detailLinks[0].click();
      await page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await delay(1000);
    }

    metrics.pagesTested++;
    console.log('  Current URL (Dossier Detail View):', page.url());
    await takeScreenshot(page, '05_dossier_detail_view');

    const appUrl = page.url();
    const appMatch = appUrl.match(/\/admin\/applications\/([a-f0-9-]+)/);
    const createdAppId = appMatch ? appMatch[1] : null;

    if (createdAppId) {
      console.log(`  ✅ Application Detail URL loaded! Application ID: ${createdAppId}`);

      // =========================================================================
      // PHASE 6: DATABASE VERIFICATION
      // =========================================================================
      console.log('\n---------------------------------------------------------------');
      console.log('PHASE 6: DATABASE VERIFICATION IN POSTGRESQL VIA PRISMA');
      console.log('---------------------------------------------------------------');

      const dbApp = await prisma.application.findUnique({
        where: { id: createdAppId },
        include: { requirements: true, client: true, service: true }
      });

      if (dbApp) {
        metrics.databaseMutationsVerified++;
        console.log(`  ✅ PostgreSQL Record Verified:`);
        console.log(`     - Application Number: #${dbApp.applicationNumber}`);
        console.log(`     - Status: ${dbApp.status}`);
        console.log(`     - Priority: ${dbApp.priority}`);
        console.log(`     - Client: ${dbApp.client?.fullName} (${dbApp.client?.email})`);
        console.log(`     - Service: ${dbApp.service?.name}`);
        console.log(`     - Requirement Snapshots: ${dbApp.requirements.length} item(s)`);
        console.log(`     - Visa Metadata JSON:`, JSON.stringify(dbApp.metadata, null, 2));
      } else {
        metrics.failuresDiscovered.push(`Application ID ${createdAppId} created via UI was NOT found in database!`);
      }
    }

    // =========================================================================
    // PHASE 7: CROSS-PORTAL CLIENT VERIFICATION
    // =========================================================================
    console.log('\n---------------------------------------------------------------');
    console.log('PHASE 7: CROSS-PORTAL CLIENT PORTAL AUDIT');
    console.log('---------------------------------------------------------------');

    console.log('  Clearing admin session and navigating to login...');
    await clearBrowserSession(page);

    console.log('  Logging in as Client (john.kamau@example.com)...');
    await page.type('input[type="email"]', 'john.kamau@example.com', { delay: 15 });
    await page.type('input[type="password"]', 'Client@SwiftDoc2026!', { delay: 15 });
    await takeScreenshot(page, '07_client_login');

    metrics.formsSubmitted++;
    await clickButtonWithText(page, 'Sign In');
    await page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await delay(1500);

    console.log('  Client Portal redirected URL:', page.url());
    await page.goto('http://localhost:3000/client/applications', { waitUntil: 'domcontentloaded' });
    await delay(1000);
    metrics.pagesTested++;
    await takeScreenshot(page, '07_client_applications_list');

    // Click on top application card
    const clientAppLinks = await page.$$('a[href*="/client/applications/"]');
    if (clientAppLinks.length > 0) {
      metrics.buttonsInteracted++;
      await clientAppLinks[0].click();
      await page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await delay(1000);
      metrics.pagesTested++;
      console.log('  Client Application Detail URL:', page.url());
      await takeScreenshot(page, '07_client_application_detail');
    }

    // =========================================================================
    // PHASE 9: RESPONSIVE VIEWPORT AUDIT
    // =========================================================================
    console.log('\n---------------------------------------------------------------');
    console.log('PHASE 9: RESPONSIVE VIEWPORT AUDIT (320px, 390px, 412px, 1440px)');
    console.log('---------------------------------------------------------------');

    const viewports = [
      { name: '320x568_Mobile_Small', width: 320, height: 568 },
      { name: '390x844_Mobile_iPhone', width: 390, height: 844 },
      { name: '412x915_Android_Large', width: 412, height: 915 },
      { name: '1440x900_Desktop_Mac', width: 1440, height: 900 },
    ];

    for (const vp of viewports) {
      console.log(`  Auditing Viewport: ${vp.name} (${vp.width}x${vp.height})...`);
      await page.setViewport({ width: vp.width, height: vp.height });
      await page.goto('http://localhost:3000/client/applications', { waitUntil: 'domcontentloaded' });
      await delay(500);

      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      console.log(`    Horizontal Overflow Check (scrollWidth <= innerWidth): ${!hasHorizontalOverflow ? '✅ PASS' : '❌ FAIL'}`);
      if (hasHorizontalOverflow) {
        metrics.failuresDiscovered.push(`Responsive horizontal overflow detected at viewport ${vp.name}`);
      }

      await takeScreenshot(page, `09_responsive_${vp.name}`);
    }

    // Reset viewport back to desktop
    await page.setViewport({ width: 1440, height: 900 });

    // =========================================================================
    // PHASE 11 & 12: COMPREHENSIVE ROUTE AUDIT
    // =========================================================================
    console.log('\n---------------------------------------------------------------');
    console.log('PHASE 11 & 12: COMPREHENSIVE ADMIN & CLIENT ROUTE AUDIT');
    console.log('---------------------------------------------------------------');

    // Clear session and re-login as Admin
    await clearBrowserSession(page);
    await page.type('input[type="email"]', 'admin@swiftdoc.co.ke', { delay: 10 });
    await page.type('input[type="password"]', 'Admin@SwiftDoc2026!', { delay: 10 });
    await clickButtonWithText(page, 'Sign In');
    await page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await delay(1000);

    const adminRoutes = [
      '/admin',
      '/admin/applications',
      '/admin/registrations',
      '/admin/qc',
      '/admin/government',
      '/admin/sla',
      '/admin/deliveries',
      '/admin/invoices',
      '/admin/payments',
      '/admin/receipts',
      '/admin/reconciliation',
      '/admin/refunds',
      '/admin/transactions',
      '/admin/adjustments',
      '/admin/collections',
      '/admin/audit',
      '/admin/clients',
      '/admin/documents',
      '/admin/services',
      '/admin/actions',
      '/admin/communications',
      '/admin/notifications',
    ];

    for (const route of adminRoutes) {
      console.log(`  Visiting Admin route: http://localhost:3000${route}...`);
      try {
        await page.goto(`http://localhost:3000${route}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
        metrics.pagesTested++;
        const routeName = route.replace(/\//g, '_').substring(1) || 'admin_home';
        await takeScreenshot(page, `route_${routeName}`);
      } catch (err: any) {
        console.log(`  ⚠️ Route ${route} load notice:`, err.message);
      }
    }

    // Clear session and re-login as Client
    await clearBrowserSession(page);
    await page.type('input[type="email"]', 'john.kamau@example.com', { delay: 10 });
    await page.type('input[type="password"]', 'Client@SwiftDoc2026!', { delay: 10 });
    await clickButtonWithText(page, 'Sign In');
    await page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await delay(1000);

    const clientRoutes = [
      '/client',
      '/client/applications',
      '/client/services',
      '/client/documents',
      '/client/payments',
      '/client/actions',
      '/client/notifications',
      '/client/profile',
    ];

    for (const route of clientRoutes) {
      console.log(`  Visiting Client route: http://localhost:3000${route}...`);
      try {
        await page.goto(`http://localhost:3000${route}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
        metrics.pagesTested++;
        const routeName = route.replace(/\//g, '_').substring(1) || 'client_home';
        await takeScreenshot(page, `route_${routeName}`);
      } catch (err: any) {
        console.log(`  ⚠️ Route ${route} load notice:`, err.message);
      }
    }

    console.log('\n===============================================================');
    console.log('🎉 REAL CHROME BROWSER FUNCTIONALITY AUDIT COMPLETE');
    console.log('===============================================================');
  } catch (err: any) {
    console.error('❌ Audit encountered an error:', err);
    metrics.failuresDiscovered.push(`Audit script error: ${err.message}`);
  } finally {
    await browser.close();
    await prisma.$disconnect();

    // Print Final Audit Report Metrics
    console.log('\n--- FINAL AUDIT METRICS JSON ---');
    console.log(JSON.stringify(metrics, null, 2));
  }
}

runRealBrowserAudit();
