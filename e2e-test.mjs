import { chromium } from 'playwright'

const BASE = 'http://localhost:3000'
const TEST_EMAIL = `test_${Date.now()}@e2e.test`
const TEST_PASS  = 'TestPass123!'
const TEST_NAME  = 'E2E Tester'

let browser, page
const shots = []

async function shot(label) {
    const path = `C:/Users/DRAGON/Desktop/kanataki-zwei/home-pro-manager/e2e-screenshots/${label}.png`
    await page.screenshot({ path, fullPage: false })
    shots.push({ label, path })
    console.log(`  📸 ${label}`)
}

async function wait(ms) { await page.waitForTimeout(ms) }

async function run() {
    browser = await chromium.launch({ headless: false, slowMo: 300 })
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    page = await ctx.newPage()

    // ── 1. Signup ──────────────────────────────────────────────────────────
    console.log('\n[1] SIGNUP')
    await page.goto(`${BASE}/auth/signup`)
    await page.waitForLoadState('networkidle')
    await shot('01-signup-page')

    await page.fill('input#name', TEST_NAME)
    await page.fill('input#email', TEST_EMAIL)
    await page.fill('input#password', TEST_PASS)
    await page.fill('input#confirmPassword', TEST_PASS)
    await shot('01b-signup-filled')
    await page.click('button[type=submit]')

    // Should redirect to login after success toast
    await page.waitForURL(`${BASE}/auth/login`, { timeout: 15000 })
    await shot('02-redirected-to-login')
    console.log('  ✅ Signup succeeded – redirected to login')

    // ── 2. Login ───────────────────────────────────────────────────────────
    console.log('\n[2] LOGIN')
    await page.waitForLoadState('networkidle')
    await page.fill('input#email', TEST_EMAIL)
    await page.fill('input#password', TEST_PASS)
    await shot('03-login-filled')
    await page.click('button[type=submit]')

    await page.waitForURL(`${BASE}/dashboard`, { timeout: 15000 })
    await shot('04-dashboard-initial')
    console.log('  ✅ Login succeeded – on dashboard')

    // ── 3. Dashboard (no household yet) ────────────────────────────────────
    console.log('\n[3] DASHBOARD — no household')
    const noHousehold = await page.locator('text=No household set up yet').isVisible()
    console.log(`  ${noHousehold ? '✅' : '❌'} "No household set up yet" prompt visible: ${noHousehold}`)

    // ── 4. Household — create ──────────────────────────────────────────────
    console.log('\n[4] HOUSEHOLD — create')
    await page.goto(`${BASE}/household`)
    await page.waitForLoadState('networkidle')
    await shot('05-household-empty')

    await page.fill('input[placeholder="e.g. The Gichinis"]', 'Test Family')
    await page.click('button:has-text("Let\'s go")')
    await page.waitForSelector('h1:has-text("Test Family")', { timeout: 10000 })
    await shot('06-household-created')
    console.log('  ✅ Household created')

    // ── 5. Member Types ────────────────────────────────────────────────────
    console.log('\n[5] MEMBER TYPES')
    await page.click('button:has-text("Add"):near(h2:has-text("Member Types"))')
    await page.waitForSelector('input[placeholder*="Guardian"]')
    await page.fill('input[placeholder*="Guardian"]', 'Spouse')
    await page.click('button:has-text("Add"):not(:has-text("Member")):not(:has-text("Account"))')
    await wait(800)
    const spouseChip = await page.locator('text=Spouse').isVisible()
    console.log(`  ${spouseChip ? '✅' : '❌'} "Spouse" member type created: ${spouseChip}`)

    // Add second type
    await page.click('button:has-text("Add"):near(h2:has-text("Member Types"))')
    await page.waitForSelector('input[placeholder*="Guardian"]')
    await page.fill('input[placeholder*="Guardian"]', 'Child')
    await page.click('button:has-text("Add"):not(:has-text("Member")):not(:has-text("Account"))')
    await wait(800)
    await shot('07-member-types')
    const childChip = await page.locator('text=Child').isVisible()
    console.log(`  ${childChip ? '✅' : '❌'} "Child" member type created: ${childChip}`)

    // ── 6. Members ─────────────────────────────────────────────────────────
    console.log('\n[6] MEMBERS')
    await page.click('button:has-text("Add Member")')
    await page.waitForSelector('input[placeholder="e.g. Jane Doe"]')
    await page.fill('input[placeholder="e.g. Jane Doe"]', 'Alice Test')
    // Select member type
    await page.locator('div[data-radix-popper-content-wrapper]').waitFor({ state: 'detached' }).catch(() => {})
    const memberTypeSelect = page.locator('[role="combobox"]').first()
    await memberTypeSelect.click()
    await page.waitForSelector('[role="option"]:has-text("Spouse")')
    await page.click('[role="option"]:has-text("Spouse")')
    await wait(300)
    await page.click('button:has-text("Add Member"):not(:has-text("Type"))')
    await wait(1000)
    const aliceVisible = await page.locator('text=Alice Test').isVisible()
    console.log(`  ${aliceVisible ? '✅' : '❌'} Member "Alice Test" added: ${aliceVisible}`)
    await shot('08-member-added')

    // ── 7. Accounts ────────────────────────────────────────────────────────
    console.log('\n[7] ACCOUNTS')
    await page.click('button:has-text("Add Account")')
    await page.waitForSelector('input[placeholder="e.g. KCB Joint Account"]')
    await page.fill('input[placeholder="e.g. KCB Joint Account"]', 'KCB Checking')

    // Select account type
    const accountTypeSelect = page.locator('[role="combobox"]').nth(0)
    await accountTypeSelect.click()
    await page.waitForSelector('[role="option"]:has-text("Checking")')
    await page.click('[role="option"]:has-text("Checking")')
    await wait(300)

    // Opening balance
    await page.fill('input[type="number"]', '50000')
    await page.click('button:has-text("Add Account"):not(:has-text("+"))')
    await wait(1000)
    const kcbVisible = await page.locator('text=KCB Checking').isVisible()
    console.log(`  ${kcbVisible ? '✅' : '❌'} Account "KCB Checking" added: ${kcbVisible}`)
    await shot('09-account-added')

    // ── 8. Dashboard — now with data ───────────────────────────────────────
    console.log('\n[8] DASHBOARD — with household data')
    await page.goto(`${BASE}/dashboard`)
    await page.waitForLoadState('networkidle')
    await wait(1500)
    await shot('10-dashboard-with-data')
    const householdName = await page.locator('h1:has-text("Test Family")').isVisible()
    const balanceVisible = await page.locator('text=KES').first().isVisible()
    console.log(`  ${householdName ? '✅' : '❌'} Household name on dashboard: ${householdName}`)
    console.log(`  ${balanceVisible ? '✅' : '❌'} Balance (KES) on dashboard: ${balanceVisible}`)

    // ── 9. Budget Page ─────────────────────────────────────────────────────
    console.log('\n[9] BUDGET PAGE')
    await page.goto(`${BASE}/budget`)
    await page.waitForLoadState('networkidle')
    await wait(1000)
    await shot('11-budget-library')
    const budgetHeader = await page.locator('h1:has-text("Zero-Based Budget")').isVisible()
    console.log(`  ${budgetHeader ? '✅' : '❌'} Budget page header visible: ${budgetHeader}`)

    const libraryTab = await page.locator('button:has-text("Expense Library")').isVisible()
    const templatesTab = await page.locator('button:has-text("Budget Templates")').isVisible()
    const sessionsTab = await page.locator('button:has-text("Monthly Sessions")').isVisible()
    console.log(`  ${libraryTab ? '✅' : '❌'} Expense Library tab: ${libraryTab}`)
    console.log(`  ${templatesTab ? '✅' : '❌'} Budget Templates tab: ${templatesTab}`)
    console.log(`  ${sessionsTab ? '✅' : '❌'} Monthly Sessions tab: ${sessionsTab}`)

    // Click Templates tab
    await page.click('button:has-text("Budget Templates")')
    await wait(800)
    await shot('12-budget-templates')
    console.log('  ✅ Templates tab rendered')

    // Click Sessions tab
    await page.click('button:has-text("Monthly Sessions")')
    await wait(800)
    await shot('13-budget-sessions')
    console.log('  ✅ Sessions tab rendered')

    // ── 10. Household edit ─────────────────────────────────────────────────
    console.log('\n[10] HOUSEHOLD RENAME')
    await page.goto(`${BASE}/household`)
    await page.waitForLoadState('networkidle')
    await page.click('button:has-text("Rename")')
    await page.waitForSelector('dialog input, [role="dialog"] input')
    await page.fill('[role="dialog"] input', 'My Test Family')
    await page.click('[role="dialog"] button:has-text("Save")')
    await wait(1000)
    const renamed = await page.locator('h1:has-text("My Test Family")').isVisible()
    console.log(`  ${renamed ? '✅' : '❌'} Household renamed: ${renamed}`)
    await shot('14-household-renamed')

    // ── Done ───────────────────────────────────────────────────────────────
    console.log('\n── Screenshots saved:')
    shots.forEach(s => console.log(`   ${s.path}`))
}

// Ensure screenshot dir exists
import { mkdirSync } from 'fs'
mkdirSync('C:/Users/DRAGON/Desktop/kanataki-zwei/home-pro-manager/e2e-screenshots', { recursive: true })

run()
    .then(() => { console.log('\n✅ All checks complete'); browser?.close() })
    .catch(err => { console.error('\n❌ Error:', err.message); browser?.close(); process.exit(1) })
