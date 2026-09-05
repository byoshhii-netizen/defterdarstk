const router = require('express').Router();
const crypto = require('crypto');
const { getDb } = process.env.RAILWAY_ENVIRONMENT || process.env.PORT
  ? require('./database-web')
  : require('./database');

const FUND_CODES = ['zekat', 'fitre', 'fidye', 'sadaka', 'su_kuyusu', 'mescit', 'yetimhane', 'genel_bagis', 'kurban', 'adak', 'akika'];
const FUND_DEFAULTS = {
  zekat: { income: ['donation'], expenses: ['beneficiary_aid'], beneficiaries: ['family', 'student'] },
  fitre: { income: ['donation'], expenses: ['beneficiary_aid'], beneficiaries: ['family', 'student'] },
  fidye: { income: ['donation'], expenses: ['beneficiary_aid'], beneficiaries: ['family', 'student'] },
  sadaka: { income: ['donation'], expenses: ['beneficiary_aid', 'project', 'general'], beneficiaries: ['family', 'student'] },
  su_kuyusu: { income: ['donation'], expenses: ['project'], beneficiaries: [] },
  mescit: { income: ['donation'], expenses: ['project'], beneficiaries: [] },
  yetimhane: { income: ['donation'], expenses: ['project', 'beneficiary_aid'], beneficiaries: ['family'] },
  genel_bagis: { income: ['donation'], expenses: ['general', 'project', 'beneficiary_aid'], beneficiaries: [] },
  kurban: { income: ['donation'], expenses: ['sacrifice'], beneficiaries: [] },
  adak: { income: ['donation'], expenses: ['sacrifice'], beneficiaries: [] },
  akika: { income: ['donation'], expenses: ['sacrifice'], beneficiaries: [] }
};

function auth(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ hata: 'Giris yapmaniz gerekiyor' });
  next();
}

function requestId(req) {
  return req.headers['x-request-id'] || crypto.randomUUID();
}

function getOrganization(db, userId, organizationId) {
  if (organizationId) {
    return db.prepare('SELECT * FROM organizations WHERE id=? AND owner_user_id=?').get(organizationId, userId);
  }
  let org = db.prepare('SELECT * FROM organizations WHERE owner_user_id=? ORDER BY id LIMIT 1').get(userId);
  if (!org) {
    const result = db.prepare('INSERT INTO organizations (name, owner_user_id) VALUES (?, ?)').run(`Kurulus ${userId}`, userId);
    org = db.prepare('SELECT * FROM organizations WHERE id=?').get(result.lastInsertRowid);
  }
  return org;
}

function audit(db, req, orgId, action, entity, entityId, before, after) {
  db.prepare(`INSERT INTO audit_logs (organization_id, actor_user_id, action, entity, entity_id, before_json, after_json, request_id, ip)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(orgId, req.session.userId, action, entity, String(entityId || ''), before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, requestId(req), req.ip || null);
}

function parseJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch (error) { return fallback; }
}

router.use(auth);
router.use(async (req, res, next) => {
  try {
    const db = await getDb();
    req.uhreviDb = db;
    req.organization = getOrganization(db, req.session.userId, req.body?.organization_id || req.query?.organization_id);
    if (!req.organization) return res.status(403).json({ hata: 'Kurulus kapsami bulunamadi' });
    next();
  } catch (error) { next(error); }
});

router.get('/organizations/current', (req, res) => res.json(req.organization));

router.get('/funds', (req, res) => {
  const rows = req.uhreviDb.prepare(`SELECT f.*, p.allowed_income_types, p.allowed_expense_categories, p.allowed_beneficiary_types,
    p.currency, p.transferable, p.approval_level FROM fund_types f LEFT JOIN fund_policies p ON p.fund_type_id=f.id
    WHERE f.organization_id=? AND f.active=1 ORDER BY f.code`).all(req.organization.id);
  res.json(rows.map(row => ({ ...row, allowed_income_types: parseJson(row.allowed_income_types, []), allowed_expense_categories: parseJson(row.allowed_expense_categories, []), allowed_beneficiary_types: parseJson(row.allowed_beneficiary_types, []) })));
});

router.post('/funds', (req, res) => {
  const { code, name, currency = 'TRY' } = req.body;
  const normalized = String(code || '').trim().toLowerCase();
  if (!FUND_CODES.includes(normalized)) return res.status(400).json({ hata: 'Gecersiz fon kodu' });
  const defaults = FUND_DEFAULTS[normalized];
  try {
    const result = req.uhreviDb.prepare('INSERT INTO fund_types (organization_id, code, name) VALUES (?,?,?)').run(req.organization.id, normalized, name || normalized);
    req.uhreviDb.prepare(`INSERT INTO fund_policies (fund_type_id, allowed_income_types, allowed_expense_categories, allowed_beneficiary_types, currency)
      VALUES (?,?,?,?,?)`).run(result.lastInsertRowid, JSON.stringify(defaults.income), JSON.stringify(defaults.expenses), JSON.stringify(defaults.beneficiaries), currency);
    audit(req.uhreviDb, req, req.organization.id, 'create', 'fund_type', result.lastInsertRowid, null, { code: normalized });
    res.status(201).json({ id: result.lastInsertRowid, code: normalized });
  } catch (error) { res.status(409).json({ hata: 'Fon zaten mevcut veya olusturulamadi' }); }
});

router.get('/accounts', (req, res) => res.json(req.uhreviDb.prepare('SELECT * FROM finance_accounts WHERE organization_id=? AND active=1 ORDER BY name').all(req.organization.id)));
router.post('/accounts', (req, res) => {
  const { name, account_type = 'cash', currency = 'TRY' } = req.body;
  if (!name) return res.status(400).json({ hata: 'Hesap adi zorunlu' });
  const result = req.uhreviDb.prepare('INSERT INTO finance_accounts (organization_id, name, account_type, currency) VALUES (?,?,?,?)').run(req.organization.id, name, account_type, currency);
  audit(req.uhreviDb, req, req.organization.id, 'create', 'finance_account', result.lastInsertRowid, null, { name });
  res.status(201).json({ id: result.lastInsertRowid });
});

router.post('/donations', (req, res) => {
  const { fund_type_id, amount, currency = 'TRY', donor, idempotency_key } = req.body;
  if (!fund_type_id || Number(amount) <= 0 || !idempotency_key) return res.status(400).json({ hata: 'Fon, pozitif tutar ve idempotency_key zorunlu' });
  const db = req.uhreviDb;
  const existing = db.prepare('SELECT * FROM donations WHERE organization_id=? AND idempotency_key=?').get(req.organization.id, idempotency_key);
  if (existing) return res.status(200).json({ ...existing, replayed: true });
  const fund = db.prepare('SELECT * FROM fund_types WHERE id=? AND organization_id=? AND active=1').get(fund_type_id, req.organization.id);
  if (!fund) return res.status(404).json({ hata: 'Fon bulunamadi' });
  let donorId = null;
  if (donor?.name) donorId = db.prepare('INSERT INTO donors (organization_id, name, phone, email) VALUES (?,?,?,?)').run(req.organization.id, donor.name, donor.phone || null, donor.email || null).lastInsertRowid;
  const donationId = db.prepare(`INSERT INTO donations (organization_id, donor_id, fund_type_id, amount, currency, status, idempotency_key, created_by)
    VALUES (?,?,?,?,?,?,?,?)`).run(req.organization.id, donorId, fund.id, Number(amount), currency, 'received', idempotency_key, req.session.userId).lastInsertRowid;
  audit(db, req, req.organization.id, 'create', 'donation', donationId, null, { amount: Number(amount), fund_type_id: fund.id });
  res.status(201).json({ id: donationId, status: 'received' });
});

router.post('/ledger/post', (req, res) => {
  const { transaction_id, fund_type_id, account_id, lines, description } = req.body;
  if (!transaction_id || !fund_type_id || !account_id || !Array.isArray(lines) || lines.length < 2) return res.status(400).json({ hata: 'Dengeli ledger satirlari zorunlu' });
  const debit = lines.filter(line => line.entry_type === 'debit').reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const credit = lines.filter(line => line.entry_type === 'credit').reduce((sum, line) => sum + Number(line.amount || 0), 0);
  if (debit <= 0 || Math.abs(debit - credit) > 0.000001) return res.status(400).json({ hata: 'Ledger borc/alacak dengesi bozuk' });
  const db = req.uhreviDb;
  if (db.prepare('SELECT id FROM finance_ledger_entries WHERE organization_id=? AND transaction_id=?').get(req.organization.id, transaction_id)) return res.status(409).json({ hata: 'Transaction zaten post edilmis' });
  db.exec('BEGIN');
  try {
    const ids = lines.map(line => db.prepare(`INSERT INTO finance_ledger_entries (organization_id, transaction_id, fund_type_id, account_id, entry_type, amount, category, description, created_by)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(req.organization.id, transaction_id, fund_type_id, account_id, line.entry_type, Number(line.amount), line.category || null, description || null, req.session.userId).lastInsertRowid);
    db.exec('COMMIT');
    audit(db, req, req.organization.id, 'post', 'ledger_transaction', transaction_id, null, { ids });
    res.status(201).json({ transaction_id, ids });
  } catch (error) { try { db.exec('ROLLBACK'); } catch (rollbackError) {} res.status(400).json({ hata: 'Ledger post edilemedi' }); }
});

router.post('/ledger/:id/reverse', (req, res) => {
  const db = req.uhreviDb;
  const original = db.prepare('SELECT * FROM finance_ledger_entries WHERE id=? AND organization_id=?').get(req.params.id, req.organization.id);
  if (!original || original.reversal_of) return res.status(404).json({ hata: 'Ters kayit icin hareket bulunamadi' });
  const reversalId = db.prepare(`INSERT INTO finance_ledger_entries (organization_id, transaction_id, fund_type_id, account_id, entry_type, amount, category, reversal_of, description, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(req.organization.id, `reversal-${original.transaction_id}-${Date.now()}`, original.fund_type_id, original.account_id, original.entry_type === 'debit' ? 'credit' : 'debit', original.amount, original.category, original.id, req.body.reason || 'Reversal', req.session.userId).lastInsertRowid;
  audit(db, req, req.organization.id, 'reverse', 'ledger_entry', original.id, original, { reversalId });
  res.status(201).json({ id: reversalId, reversal_of: original.id });
});

router.get('/ledger/balance/:fundTypeId', (req, res) => {
  const row = req.uhreviDb.prepare(`SELECT COALESCE(SUM(CASE WHEN entry_type='credit' THEN amount ELSE -amount END), 0) AS balance
    FROM finance_ledger_entries WHERE organization_id=? AND fund_type_id=?`).get(req.organization.id, req.params.fundTypeId);
  res.json({ balance: Number(row?.balance || 0) });
});

router.post('/zakat/calculate', (req, res) => {
  const { method = 'gold', rate = 0.025, nisab, inputs = {}, exchange_snapshot = {} } = req.body;
  const base = Object.entries(inputs).reduce((sum, [key, value]) => sum + (key.startsWith('debt_') ? -Number(value || 0) : Number(value || 0)), 0);
  const result = Math.max(0, base - Number(nisab || 0)) * Number(rate);
  const id = req.uhreviDb.prepare(`INSERT INTO zakat_calculations (organization_id, user_id, method, rate, exchange_snapshot_json, inputs_json, nisab, base_amount, result_amount)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(req.organization.id, req.session.userId, method, Number(rate), JSON.stringify(exchange_snapshot), JSON.stringify(inputs), Number(nisab || 0), base, result).lastInsertRowid;
  res.status(201).json({ id, base_amount: base, result_amount: result, method, rate: Number(rate) });
});

router.post('/sacrifices/groups', (req, res) => {
  const { kind, animal_type, total_shares, country, slaughter_point } = req.body;
  const total = animal_type === 'large' ? 7 : 1;
  if (!kind || !animal_type || Number(total_shares || total) !== total) return res.status(400).json({ hata: 'Buyukbas 7, kucukbas 1 hisse olmalidir' });
  const id = req.uhreviDb.prepare(`INSERT INTO sacrifice_groups (organization_id, kind, animal_type, country, slaughter_point, total_shares) VALUES (?,?,?,?,?,?)`).run(req.organization.id, kind, animal_type, country || null, slaughter_point || null, total).lastInsertRowid;
  res.status(201).json({ id, total_shares: total });
});

router.post('/sacrifices/groups/:id/shares', (req, res) => {
  const db = req.uhreviDb;
  const group = db.prepare('SELECT * FROM sacrifice_groups WHERE id=? AND organization_id=?').get(req.params.id, req.organization.id);
  if (!group || group.status !== 'open' || group.filled_shares >= group.total_shares) return res.status(409).json({ hata: 'Grup yeni hisseye kapali' });
  const shareNo = group.filled_shares + 1;
  try {
    const id = db.prepare('INSERT INTO sacrifice_shares (group_id, donor_id, share_no, proxy_method, evidence_ref) VALUES (?,?,?,?,?)').run(group.id, req.body.donor_id || null, shareNo, req.body.proxy_method || null, req.body.evidence_ref || null).lastInsertRowid;
    const filled = group.filled_shares + 1;
    db.prepare('UPDATE sacrifice_groups SET filled_shares=?, status=? WHERE id=? AND status=?').run(filled, filled === group.total_shares ? 'full' : 'open', group.id, 'open');
    audit(db, req, req.organization.id, 'assign', 'sacrifice_share', id, null, { group_id: group.id, share_no: shareNo });
    res.status(201).json({ id, share_no: shareNo, status: filled === group.total_shares ? 'full' : 'open' });
  } catch (error) { res.status(409).json({ hata: 'Hisse atamasi cakisma nedeniyle basarisiz' }); }
});

router.post('/projects', (req, res) => {
  const { type, name, target_budget = 0, currency = 'TRY', country, region } = req.body;
  if (!type || !name) return res.status(400).json({ hata: 'Proje turu ve adi zorunlu' });
  const id = req.uhreviDb.prepare(`INSERT INTO projects (organization_id, type, name, target_budget, currency, country, region) VALUES (?,?,?,?,?,?,?)`).run(req.organization.id, type, name, Number(target_budget), currency, country || null, region || null).lastInsertRowid;
  res.status(201).json({ id });
});

router.post('/beneficiaries', (req, res) => {
  const { case_code, masked_identity, tc_identity_ciphertext, tc_identity_nonce, tc_identity_tag, tc_identity_hmac } = req.body;
  if (!case_code) return res.status(400).json({ hata: 'Vaka kodu zorunlu' });
  const id = req.uhreviDb.prepare(`INSERT INTO beneficiary_cases (organization_id, case_code, masked_identity, tc_identity_ciphertext, tc_identity_nonce, tc_identity_tag, tc_identity_hmac)
    VALUES (?,?,?,?,?,?,?)`).run(req.organization.id, case_code, masked_identity || null, tc_identity_ciphertext || null, tc_identity_nonce || null, tc_identity_tag || null, tc_identity_hmac || null).lastInsertRowid;
  audit(req.uhreviDb, req, req.organization.id, 'create', 'beneficiary_case', id, null, { case_code, masked_identity });
  res.status(201).json({ id, case_code });
});

router.use((error, req, res, next) => {
  console.error('[UHREVI]', error.message);
  res.status(500).json({ hata: 'Uhrevi modul islemi basarisiz' });
});

module.exports = router;
