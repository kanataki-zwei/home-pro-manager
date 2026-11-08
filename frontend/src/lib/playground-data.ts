// Module-level flag — set synchronously during PlaygroundProvider render so it's
// active before any useEffect API calls go out.
let _active = false
export const setPlaygroundActive = (v: boolean) => { _active = v }
export const isPlaygroundActive = () => _active

// ─── Mock IDs ─────────────────────────────────────────────────────────────────
const HH_ID   = 'ffffffff-demo-0000-0000-000000000001'
const MT_PRI  = 'ffffffff-demo-0000-0000-000000000011'
const MT_SPO  = 'ffffffff-demo-0000-0000-000000000012'
const MT_CHD  = 'ffffffff-demo-0000-0000-000000000013'
const MB_A    = 'ffffffff-demo-0000-0000-000000000021'
const MB_B    = 'ffffffff-demo-0000-0000-000000000022'
const MB_C    = 'ffffffff-demo-0000-0000-000000000023'
const AC_EQ   = 'ffffffff-demo-0000-0000-000000000031'
const AC_NC   = 'ffffffff-demo-0000-0000-000000000032'
const AC_MP   = 'ffffffff-demo-0000-0000-000000000033'
const AC_CIC  = 'ffffffff-demo-0000-0000-000000000034'
const AC_NSE  = 'ffffffff-demo-0000-0000-000000000035'
const AC_NSSF = 'ffffffff-demo-0000-0000-000000000036'

// ─── Mock household ───────────────────────────────────────────────────────────
const MOCK_HOUSEHOLD = {
    id: HH_ID,
    name: 'The Kamau Family',
    created_by: 'ffffffff-demo-0000-0000-000000000099',
    financial_start_month: '2024-01-01',
    pay_day: 25,
    pay_day_grace_period: 2,
    member_types: [
        { id: MT_PRI, name: 'Primary',  bg_color: '#dbeafe', text_color: '#1d4ed8' },
        { id: MT_SPO, name: 'Spouse',   bg_color: '#fce7f3', text_color: '#9d174d' },
        { id: MT_CHD, name: 'Child',    bg_color: '#d1fae5', text_color: '#065f46' },
    ],
}

// ─── Mock members ─────────────────────────────────────────────────────────────
const MOCK_MEMBERS = [
    {
        id: MB_A, name: 'Daniel Kamau', date_of_birth: '1988-03-15',
        is_active: true, user_id: null,
        member_type: { id: MT_PRI, name: 'Primary', bg_color: '#dbeafe', text_color: '#1d4ed8' },
        contributes_income: true, income_amount: 185000, income_currency: 'KES', income_cadence: 'monthly',
    },
    {
        id: MB_B, name: 'Grace Kamau', date_of_birth: '1990-07-22',
        is_active: true, user_id: null,
        member_type: { id: MT_SPO, name: 'Spouse', bg_color: '#fce7f3', text_color: '#9d174d' },
        contributes_income: true, income_amount: 110000, income_currency: 'KES', income_cadence: 'monthly',
    },
    {
        id: MB_C, name: 'Noah Kamau', date_of_birth: '2016-09-10',
        is_active: true, user_id: null,
        member_type: { id: MT_CHD, name: 'Child', bg_color: '#d1fae5', text_color: '#065f46' },
        contributes_income: false, income_amount: null, income_currency: null, income_cadence: null,
    },
]

// ─── Mock accounts ────────────────────────────────────────────────────────────
const MOCK_ACCOUNTS = [
    {
        id: AC_EQ, name: 'Equity Bank Savings', account_type: 'savings',
        institution_type: 'bank', ownership: 'joint',
        current_balance: 923450, currency: 'KES', is_active: true,
        household_member_id: null, contributes_to_net_worth: true,
        contributes_to_liquid_cash: true, target_amount: 1000000,
    },
    {
        id: AC_NC, name: 'NCBA Current Account', account_type: 'checking',
        institution_type: 'bank', ownership: 'joint',
        current_balance: 234890, currency: 'KES', is_active: true,
        household_member_id: null, contributes_to_net_worth: true,
        contributes_to_liquid_cash: true, target_amount: null,
    },
    {
        id: AC_MP, name: 'M-Pesa (Daniel)', account_type: 'savings',
        institution_type: 'mobile_money', ownership: 'personal',
        current_balance: 48230, currency: 'KES', is_active: true,
        household_member_id: MB_A, contributes_to_net_worth: true,
        contributes_to_liquid_cash: true, target_amount: null,
    },
    {
        id: AC_CIC, name: 'CIC Money Market', account_type: 'investment',
        institution_type: 'money_market', ownership: 'personal',
        current_balance: 587000, currency: 'KES', is_active: true,
        household_member_id: MB_A, contributes_to_net_worth: true,
        contributes_to_liquid_cash: false, target_amount: 750000,
    },
    {
        id: AC_NSE, name: 'NSE Portfolio', account_type: 'investment',
        institution_type: 'stocks_shares', ownership: 'joint',
        current_balance: 1245000, currency: 'KES', is_active: true,
        household_member_id: null, contributes_to_net_worth: true,
        contributes_to_liquid_cash: false, target_amount: 2000000,
    },
    {
        id: AC_NSSF, name: 'NSSF (Grace)', account_type: 'investment',
        institution_type: 'direct_pay', ownership: 'personal',
        current_balance: 312500, currency: 'KES', is_active: true,
        household_member_id: MB_B, contributes_to_net_worth: false,
        contributes_to_liquid_cash: false, target_amount: null,
    },
]

// ─── Mock FX rates ────────────────────────────────────────────────────────────
const MOCK_FX_RATES = [
    { id: 'ffffffff-demo-0000-0000-000000000041', currency: 'USD', rate_to_kes: '130.5', updated_at: '2026-11-01T00:00:00Z' },
]

// ─── Mock budget stats (for dashboard) ───────────────────────────────────────
const MOCK_BUDGET_STATS = {
    total_income: 295000,
    monthly_history: [
        { session_id: 'ffffffff-demo-0000-0000-000000000051', month: '2026-09', status: 'closed', total_budgeted: 295000, item_count: 18, paid_count: 17, paid_amount: 227000, na_count: 1, extra_income_total: 0,     savings_amount: 68000, savings_rate: 23.1, salary_savings_rate: 23.1, extra_savings_rate: 0 },
        { session_id: 'ffffffff-demo-0000-0000-000000000052', month: '2026-10', status: 'closed', total_budgeted: 295000, item_count: 18, paid_count: 16, paid_amount: 223000, na_count: 2, extra_income_total: 0,     savings_amount: 72000, savings_rate: 24.4, salary_savings_rate: 24.4, extra_savings_rate: 0 },
        { session_id: 'ffffffff-demo-0000-0000-000000000053', month: '2026-11', status: 'active', total_budgeted: 295000, item_count: 18, paid_count: 10, paid_amount: 142000, na_count: 0, extra_income_total: 25000, savings_amount: 178000, savings_rate: 60.3, salary_savings_rate: 51.9, extra_savings_rate: 8.5 },
    ],
    current_session: { session_id: 'ffffffff-demo-0000-0000-000000000053', month: '2026-11', status: 'active', total_budgeted: 295000, item_count: 18, paid_count: 10, paid_amount: 142000, na_count: 0, extra_income_total: 25000, savings_amount: 178000, savings_rate: 60.3, salary_savings_rate: 51.9, extra_savings_rate: 8.5 },
}

// ─── Mock transactions (for net worth trajectory) ─────────────────────────────
// Two transactions per month on the equity bank account (salary credit + expenses debit).
// Net per month produces the trajectory shown below.
function tx(n: number, account: string, amount: string, type: 'credit'|'debit', narration: string, date: string, sessId?: string) {
    return {
        id: `ffffffff-demo-${String(n).padStart(4,'0')}-0000-000000000000`,
        account_id: account, household_id: HH_ID,
        amount, narration, transaction_type: type,
        session_item_id: sessId ?? null, created_at: date,
    }
}

const MOCK_TRANSACTIONS = [
    // Dec 2025: net +78K
    tx( 1, AC_EQ, '295000', 'credit', 'Monthly salary', '2025-12-25T10:00:00Z'),
    tx( 2, AC_EQ, '217000', 'debit',  'Monthly expenses', '2025-12-01T08:00:00Z'),
    // Jan 2026: net +55K
    tx( 3, AC_EQ, '295000', 'credit', 'Monthly salary', '2026-01-25T10:00:00Z'),
    tx( 4, AC_EQ, '240000', 'debit',  'Monthly expenses', '2026-01-02T08:00:00Z'),
    // Feb 2026: net +42K (school fees)
    tx( 5, AC_EQ, '295000', 'credit', 'Monthly salary', '2026-02-25T10:00:00Z'),
    tx( 6, AC_EQ, '253000', 'debit',  'Monthly expenses + school fees', '2026-02-02T08:00:00Z'),
    // Mar 2026: net +70K
    tx( 7, AC_EQ, '295000', 'credit', 'Monthly salary', '2026-03-25T10:00:00Z'),
    tx( 8, AC_EQ, '225000', 'debit',  'Monthly expenses', '2026-03-03T08:00:00Z'),
    // Apr 2026: net +65K
    tx( 9, AC_EQ, '295000', 'credit', 'Monthly salary', '2026-04-25T10:00:00Z'),
    tx(10, AC_EQ, '230000', 'debit',  'Monthly expenses', '2026-04-02T08:00:00Z'),
    // May 2026: net +88K
    tx(11, AC_EQ, '295000', 'credit', 'Monthly salary', '2026-05-25T10:00:00Z'),
    tx(12, AC_EQ, '207000', 'debit',  'Monthly expenses', '2026-05-02T08:00:00Z'),
    // Jun 2026: net +55K
    tx(13, AC_EQ, '295000', 'credit', 'Monthly salary', '2026-06-25T10:00:00Z'),
    tx(14, AC_EQ, '240000', 'debit',  'Monthly expenses', '2026-06-03T08:00:00Z'),
    // Jul 2026: net +80K
    tx(15, AC_EQ, '295000', 'credit', 'Monthly salary', '2026-07-25T10:00:00Z'),
    tx(16, AC_EQ, '215000', 'debit',  'Monthly expenses', '2026-07-02T08:00:00Z'),
    // Aug 2026: net +75K
    tx(17, AC_EQ, '295000', 'credit', 'Monthly salary', '2026-08-25T10:00:00Z'),
    tx(18, AC_EQ, '220000', 'debit',  'Monthly expenses', '2026-08-01T08:00:00Z'),
    // Sep 2026: net +68K
    tx(19, AC_EQ, '295000', 'credit', 'Monthly salary', '2026-09-25T10:00:00Z'),
    tx(20, AC_EQ, '227000', 'debit',  'Monthly expenses', '2026-09-02T08:00:00Z'),
    // Oct 2026: net +72K
    tx(21, AC_EQ, '295000', 'credit', 'Monthly salary', '2026-10-25T10:00:00Z'),
    tx(22, AC_EQ, '223000', 'debit',  'Monthly expenses', '2026-10-02T08:00:00Z'),
    // Nov 2026: net +35K (partial month in progress)
    tx(23, AC_EQ, '295000', 'credit', 'Monthly salary', '2026-11-25T10:00:00Z'),
    tx(24, AC_EQ, '260000', 'debit',  'Monthly expenses', '2026-11-01T08:00:00Z'),
    // A few manual entries for variety
    tx(25, AC_NSE, '45000', 'credit', 'NSE dividend — June', '2026-06-15T12:00:00Z'),
    tx(26, AC_NSE, '45000', 'credit', 'NSE dividend — Sep', '2026-09-15T12:00:00Z'),
    tx(27, AC_CIC, '8750',  'credit', 'Money market interest', '2026-10-31T00:00:00Z'),
    tx(28, AC_CIC, '8750',  'credit', 'Money market interest', '2026-11-30T00:00:00Z'),
]

// ─── Mock admin household accounts ───────────────────────────────────────────
const MOCK_ADMIN_ACCOUNTS = [
    {
        member_id: MB_A, member_name: 'Daniel Kamau',
        member_type_name: 'Primary', member_type_bg_color: '#dbeafe', member_type_text_color: '#1d4ed8',
        user_id: 'ffffffff-demo-0000-0000-000000000099', email: 'demo@example.com', is_self: true,
    },
]

const MOCK_ADMIN_DEVICES: unknown[] = []
const MOCK_WEBAUTHN_CREDS: unknown[] = []

// ─── URL matcher ─────────────────────────────────────────────────────────────
export function getMockResponse(url: string): unknown {
    if (url === '/api/households/mine')                                                      return MOCK_HOUSEHOLD
    if (url.match(/\/api\/households\/[^/]+\/members$/)?.length)                            return MOCK_MEMBERS
    if (url.match(/\/api\/households\/[^/]+\/accounts$/)?.length)                           return MOCK_ACCOUNTS
    if (url.match(/\/api\/households\/[^/]+\/fx-rates$/)?.length)                           return MOCK_FX_RATES
    if (url.match(/\/api\/households\/[^/]+\/budget\/stats$/)?.length)                      return MOCK_BUDGET_STATS
    if (url.match(/\/api\/households\/[^/]+\/transactions$/)?.length)                       return MOCK_TRANSACTIONS
    if (url.match(/\/api\/households\/[^/]+\/budget\/library$/)?.length)                    return []
    if (url.match(/\/api\/households\/[^/]+\/budget\/sessions/)?.length)                    return []
    if (url.match(/\/api\/households\/[^/]+\/budget\/templates/)?.length)                   return []
    if (url.match(/\/api\/households\/[^/]+\/members\/[^/]+\/income-history/)?.length)      return []
    if (url.match(/\/api\/households\/[^/]+$/)?.length)                                     return MOCK_HOUSEHOLD
    if (url.match(/\/api\/admin\/household-accounts/)?.length)                              return MOCK_ADMIN_ACCOUNTS
    if (url.match(/\/api\/admin\/devices/)?.length)                                         return MOCK_ADMIN_DEVICES
    if (url.match(/\/api\/auth\/webauthn\/credentials/)?.length)                            return MOCK_WEBAUTHN_CREDS
    // Safe default for any unrecognised GET in playground mode
    return []
}

// URLs that must pass through to the real backend even in playground mode
export function isPlaygroundPassthrough(url: string): boolean {
    return (
        url.startsWith('/api/auth/') ||
        url.startsWith('/api/admin/playground/') ||
        url === '/api/users/me' ||
        url.startsWith('/api/users/me')
    )
}
