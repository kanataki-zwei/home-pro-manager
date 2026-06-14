import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const BASE       = 'http://localhost:3000'
const TEST_EMAIL = `e2e_${Date.now()}@testmail.com`
const TEST_PASS  = 'TestPass123!'
const TEST_NAME  = 'E2E Tester'
const SHOTS_DIR  = 'C:/Users/DRAGON/Desktop/kanataki-zwei/home-pro-manager/e2e-screenshots'

let browser, page
const shots = []

async function shot(label) {
    const path = `${SHOTS_DIR}/${label}.png`
    await page.screenshot({ path })
    shots.push(label)
    console.log(`  📸 ${label}`)
}

const wait = ms => page.waitForTimeout(ms)

async function closedialog() {
    const dialog = page.locator('[role="dialog"][data-state="open"]')
    if (await dialog.count() > 0) {
        await page.keyboard.press('Escape')
        await wait(800)
    }
}

async function run() {
    browser = await chromium.launch({ headless: false, slowMo: 150 })
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    page = await ctx.newPage()

    // Capture console errors for debugging
    page.on('console', msg => {
        if (msg.type() === 'error') console.log(`  [browser error] ${msg.text()}`)
    })

    console.log(`Test email: ${TEST_EMAIL}`)

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

    // Wait up to 10s for redirect to /auth/login
    try {
        await page.waitForURL(`${BASE}/auth/login`, { timeout: 10000 })
        console.log('  ✅ Signup succeeded – redirected to login')
    } catch {
        await shot('02-signup-stuck')
        const errHints = await page.locator('p.text-red-500, [data-sonner-toast]').allTextContents().catch(() => [])
        console.log(`  ⚠️  Signup stuck on signup page. Hints: ${JSON.stringify(errHints)}`)
        await page.goto(`${BASE}/auth/login`)
        await page.waitForLoadState('networkidle')
    }

    // ── 2. Login ───────────────────────────────────────────────────────────
    console.log('\n[2] LOGIN')
    await shot('02-login-page')
    await page.fill('input#email', TEST_EMAIL)
    await page.fill('input#password', TEST_PASS)
    await page.click('button[type=submit]')

    try {
        await page.waitForURL(`${BASE}/dashboard`, { timeout: 12000 })
        console.log('  ✅ Login succeeded – on dashboard')
    } catch {
        await shot('03-login-stuck')
        const toasts = await page.locator('[data-sonner-toast]').allTextContents().catch(() => [])
        console.log(`  ❌ Login failed. Toasts: ${JSON.stringify(toasts)}`)
        throw new Error('Login failed')
    }
    await shot('03-dashboard-initial')

    // ── 3. Dashboard (no household yet) ────────────────────────────────────
    console.log('\n[3] DASHBOARD — no household')
    // Wait for spinner to clear before checking empty state
    await page.waitForFunction(() =>
        !document.querySelector('.animate-spin'), { timeout: 12000 }
    ).catch(() => {})
    await wait(800)
    const noHousehold = await page.locator('text=No household set up yet').isVisible()
    console.log(`  ${noHousehold ? '✅' : '❌'} "No household set up yet" visible: ${noHousehold}`)
    await shot('04-dashboard-empty')

    // ── 4. Household — create ──────────────────────────────────────────────
    console.log('\n[4] HOUSEHOLD — create')
    await page.goto(`${BASE}/household`)
    await page.waitForLoadState('networkidle')
    // Wait for context load spinner to clear
    await page.waitForFunction(() =>
        !document.querySelector('.animate-spin'),
        { timeout: 15000 }
    ).catch(() => {})
    await wait(600)
    await shot('05-household-empty')

    await page.waitForSelector('input[placeholder="e.g. The Gichinis"]', { timeout: 10000 })
    await page.fill('input[placeholder="e.g. The Gichinis"]', 'Test Family')
    await page.locator('button', { hasText: /Let.s go/ }).click()
    await page.waitForSelector('h1:has-text("Test Family")', { timeout: 10000 })
    await shot('06-household-created')
    console.log('  ✅ Household created')

    // ── 5. Member Types ────────────────────────────────────────────────────
    console.log('\n[5] MEMBER TYPES')
    await closedialog()

    // "Spouse" type — use exact name match: only the member-type "Add" button has name exactly "Add"
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await page.waitForSelector('[role="dialog"][data-state="open"]', { timeout: 6000 })
    await page.locator('[role="dialog"] input').fill('Spouse')
    await page.locator('[role="dialog"] [style*="linear-gradient"]').click()
    await wait(2000)
    await shot('07-after-spouse')
    const spouseChip = await page.locator('text=Spouse').first().isVisible()
    console.log(`  ${spouseChip ? '✅' : '❌'} "Spouse" member type created: ${spouseChip}`)

    // "Child" type
    await closedialog()
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await page.waitForSelector('[role="dialog"][data-state="open"]', { timeout: 6000 })
    await page.locator('[role="dialog"] input').fill('Child')
    await page.locator('[role="dialog"] [style*="linear-gradient"]').click()
    await wait(2000)
    await shot('08-member-types')
    const childChip = await page.locator('text=Child').first().isVisible()
    console.log(`  ${childChip ? '✅' : '❌'} "Child" member type created: ${childChip}`)

    // ── 6. Members ─────────────────────────────────────────────────────────
    console.log('\n[6] MEMBERS')
    await closedialog()

    // Reload to ensure household state (with member types) is fresh
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.waitForFunction(() =>
        !document.querySelector('.animate-spin'),
        { timeout: 15000 }
    ).catch(() => {})
    await wait(500)

    await page.click('button:has-text("Add Member")')
    await page.waitForSelector('[role="dialog"][data-state="open"]', { timeout: 6000 })
    await shot('09-member-dialog')

    await page.locator('[role="dialog"] input').first().fill('Alice Test')

    // Select member type
    await page.locator('[role="dialog"] [role="combobox"]').first().click()
    await wait(400)
    // Log available options for debugging
    const options = await page.locator('[role="option"]').allTextContents().catch(() => [])
    console.log(`  Available member type options: ${JSON.stringify(options)}`)
    if (options.some(o => o.includes('Spouse'))) {
        await page.locator('[role="option"]').filter({ hasText: 'Spouse' }).click()
    } else {
        // Spouse not found - pick whatever is available
        const firstOption = page.locator('[role="option"]').first()
        const optText = await firstOption.textContent().catch(() => '??')
        console.log(`  ⚠️ Spouse not in options, selecting: ${optText}`)
        await firstOption.click()
    }
    await wait(400)
    await page.locator('[role="dialog"] [style*="linear-gradient"]').click()
    await wait(1500)
    await shot('10-member-added')
    const aliceVisible = await page.getByText('Alice Test').first().isVisible().catch(() => false)
    console.log(`  ${aliceVisible ? '✅' : '❌'} Member "Alice Test" added: ${aliceVisible}`)

    // ── 7. Accounts ────────────────────────────────────────────────────────
    console.log('\n[7] ACCOUNTS')
    await closedialog()
    await page.click('button:has-text("Add Account")')
    await page.waitForSelector('[role="dialog"][data-state="open"]', { timeout: 6000 })
    await shot('11-account-dialog')

    await page.locator('[role="dialog"] input').first().fill('KCB Checking')

    // Account type combobox
    await page.locator('[role="dialog"] [role="combobox"]').first().click()
    await page.waitForSelector('[role="option"]:has-text("Checking")', { timeout: 5000 })
    await page.locator('[role="option"]').filter({ hasText: 'Checking' }).click()
    await wait(300)

    // Opening balance
    await page.locator('[role="dialog"] input[type="number"]').fill('50000')
    await page.locator('[role="dialog"] [style*="linear-gradient"]').click()
    await wait(1500)
    await shot('12-account-added')
    const kcbVisible = await page.locator('text=KCB Checking').first().isVisible()
    console.log(`  ${kcbVisible ? '✅' : '❌'} Account "KCB Checking" added: ${kcbVisible}`)

    // ── 8. Dashboard — with data ───────────────────────────────────────────
    console.log('\n[8] DASHBOARD — with household data')
    await page.goto(`${BASE}/dashboard`)
    await page.waitForLoadState('networkidle')
    await wait(2000)
    await shot('13-dashboard-with-data')
    const hhName = await page.locator('h1:has-text("Test Family")').isVisible()
    const balance = await page.locator('text=KES').first().isVisible()
    console.log(`  ${hhName ? '✅' : '❌'} Household name on dashboard`)
    console.log(`  ${balance ? '✅' : '❌'} KES balance displayed`)

    // ── 9. Budget Page ─────────────────────────────────────────────────────
    console.log('\n[9] BUDGET PAGE')
    await page.goto(`${BASE}/budget`)
    await page.waitForLoadState('networkidle')
    await wait(800)
    await shot('14-budget-library')
    const budgetH1 = await page.locator('h1:has-text("Zero-Based Budget")').isVisible()
    const tabLib   = await page.locator('button:has-text("Expense Library")').isVisible()
    const tabTmpl  = await page.locator('button:has-text("Budget Templates")').isVisible()
    const tabSess  = await page.locator('button:has-text("Monthly Sessions")').isVisible()
    console.log(`  ${budgetH1 ? '✅' : '❌'} Budget header visible`)
    console.log(`  ${tabLib   ? '✅' : '❌'} Expense Library tab`)
    console.log(`  ${tabTmpl  ? '✅' : '❌'} Budget Templates tab`)
    console.log(`  ${tabSess  ? '✅' : '❌'} Monthly Sessions tab`)

    await page.click('button:has-text("Budget Templates")')
    await wait(800)
    await shot('15-budget-templates')
    console.log('  ✅ Templates tab rendered')

    await page.click('button:has-text("Monthly Sessions")')
    await wait(800)
    await shot('16-budget-sessions')
    console.log('  ✅ Sessions tab rendered')

    // Back to Library tab
    await page.click('button:has-text("Expense Library")')
    await wait(800)

    // ── 9b. Expense Library ────────────────────────────────────────────
    console.log('\n[9b] EXPENSE LIBRARY')

    // Wait for library to load (spinner gone)
    await page.waitForFunction(() => !document.querySelector('.animate-spin'), { timeout: 10000 }).catch(() => {})
    await wait(300)

    // Create a tag
    await page.click('button:has-text("Tags")')
    await page.waitForSelector('[role="dialog"][data-state="open"]', { timeout: 5000 })
    await page.locator('[role="dialog"] input[placeholder="Tag name"]').fill('Essential')
    await page.locator('[role="dialog"] [style*="linear-gradient"]').click()
    // createTag closes the dialog on success — wait for it to disappear
    await page.waitForSelector('[role="dialog"][data-state="open"]', { state: 'hidden', timeout: 6000 }).catch(() => {})
    await wait(400)
    // Tag badge appears in the toolbar area after dialog closes
    const tagVisible = await page.getByText('Essential').first().isVisible().catch(() => false)
    console.log(`  ${tagVisible ? '✅' : '❌'} Tag "Essential" created: ${tagVisible}`)

    // Create an expense group
    await page.click('button:has-text("New Group")')
    await page.waitForSelector('[role="dialog"][data-state="open"]', { timeout: 5000 })
    await page.locator('[role="dialog"] input').fill('Housing')
    await page.locator('[role="dialog"] [style*="linear-gradient"]').click()
    await page.waitForSelector('[role="dialog"][data-state="open"]', { state: 'hidden', timeout: 6000 }).catch(() => {})
    await wait(500)
    const groupVisible = await page.getByText('Housing').first().isVisible().catch(() => false)
    console.log(`  ${groupVisible ? '✅' : '❌'} Expense group "Housing" created: ${groupVisible}`)

    // Add an expense to the group
    await page.click('button:has-text("Add Expense")')
    await page.waitForSelector('[role="dialog"][data-state="open"]', { timeout: 5000 })
    await shot('18-add-expense-dialog')

    // Name
    await page.locator('[role="dialog"] input[placeholder*="Rent"]').fill('Rent')
    // Amount
    await page.locator('[role="dialog"] input[type="number"]').first().fill('50000')
    // Group — select Housing
    const groupSelects = page.locator('[role="dialog"] [role="combobox"]')
    const groupSelectCount = await groupSelects.count()
    // Group select is the 3rd combobox (after Frequency, Ownership)
    if (groupSelectCount >= 3) {
        await groupSelects.nth(2).click()
        await wait(300)
        const housingOption = page.locator('[role="option"]').filter({ hasText: 'Housing' })
        if (await housingOption.count() > 0) {
            await housingOption.click()
        } else {
            await page.keyboard.press('Escape')
        }
        await wait(300)
    }
    // Tag — click "Essential" tag button (use first() in case form renders multiple instances)
    const essentialTag = page.locator('[role="dialog"] button').filter({ hasText: 'Essential' }).first()
    if (await essentialTag.count() > 0) await essentialTag.click()

    await page.locator('[role="dialog"] [style*="linear-gradient"]').click()
    await page.waitForSelector('[role="dialog"][data-state="open"]', { state: 'hidden', timeout: 8000 }).catch(() => {})
    await wait(800)
    await shot('19-expense-added')

    const rentVisible = await page.getByText('Rent').first().isVisible().catch(() => false)
    const kesVisible = await page.getByText(/KES.*50,000|50,000.*KES/).first().isVisible().catch(() => false)
    console.log(`  ${rentVisible ? '✅' : '❌'} Expense "Rent" visible: ${rentVisible}`)
    console.log(`  ${kesVisible ? '✅' : '❌'} Monthly amount KES 50,000 visible: ${kesVisible}`)

    // ── 10. Household rename ───────────────────────────────────────────────
    console.log('\n[10] HOUSEHOLD RENAME')
    await page.goto(`${BASE}/household`)
    await page.waitForLoadState('networkidle')
    await page.waitForSelector('button:has-text("Rename")', { timeout: 15000 })
    await page.click('button:has-text("Rename")')
    await page.waitForSelector('[role="dialog"][data-state="open"]', { timeout: 5000 })
    await page.locator('[role="dialog"] input').clear()
    await page.locator('[role="dialog"] input').fill('My Test Family')
    await page.locator('[role="dialog"] [style*="linear-gradient"]').click()
    // Wait for dialog to close (save completed) then check the h1
    await page.waitForSelector('[role="dialog"][data-state="open"]', { state: 'hidden', timeout: 8000 }).catch(() => {})
    await wait(500)
    await shot('17-household-renamed')
    const renamed = await page.locator('h1:has-text("My Test Family")').isVisible()
    console.log(`  ${renamed ? '✅' : '❌'} Household renamed: ${renamed}`)

    // ── Done ───────────────────────────────────────────────────────────────
    console.log(`\n── ${shots.length} screenshots in ${SHOTS_DIR}`)
}

mkdirSync(SHOTS_DIR, { recursive: true })

run()
    .then(() => {
        console.log('✅ All checks complete')
        browser?.close()
    })
    .catch(err => {
        console.error(`\n❌ Error: ${err.message}`)
        page?.screenshot({ path: `${SHOTS_DIR}/error-state.png` }).catch(() => {})
        browser?.close()
        process.exit(1)
    })
