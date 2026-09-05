const UHREVI_SCHEMA = `
CREATE TABLE IF NOT EXISTS organizations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  owner_user_id INTEGER NOT NULL,
  settings_json TEXT DEFAULT '{}',
  active_modules TEXT DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS roles (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_roles (
  user_id INTEGER NOT NULL,
  role_id INTEGER NOT NULL,
  organization_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, role_id, organization_id)
);
CREATE TABLE IF NOT EXISTS fund_types (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  UNIQUE(organization_id, code)
);
CREATE TABLE IF NOT EXISTS fund_policies (
  id BIGSERIAL PRIMARY KEY,
  fund_type_id INTEGER NOT NULL,
  allowed_income_types TEXT DEFAULT '[]',
  allowed_expense_categories TEXT DEFAULT '[]',
  allowed_beneficiary_types TEXT DEFAULT '[]',
  currency TEXT DEFAULT 'TRY',
  transferable INTEGER DEFAULT 0,
  approval_level INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS finance_accounts (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT DEFAULT 'cash',
  currency TEXT DEFAULT 'TRY',
  active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS donors (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  consent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS donations (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  donor_id INTEGER,
  fund_type_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'TRY',
  status TEXT DEFAULT 'draft',
  idempotency_key TEXT NOT NULL,
  receipt_no TEXT,
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS finance_ledger_entries (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  transaction_id TEXT NOT NULL,
  fund_type_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  entry_type TEXT NOT NULL,
  amount REAL NOT NULL,
  category TEXT,
  donation_id INTEGER,
  reversal_of INTEGER,
  description TEXT,
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER,
  actor_user_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  request_id TEXT,
  ip TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS outbox_events (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT DEFAULT 'queued',
  attempts INTEGER DEFAULT 0,
  idempotency_key TEXT NOT NULL,
  next_attempt_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS zakat_calculations (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  method TEXT NOT NULL,
  rate REAL NOT NULL DEFAULT 0.025,
  exchange_snapshot_json TEXT NOT NULL,
  inputs_json TEXT NOT NULL,
  nisab REAL NOT NULL,
  base_amount REAL NOT NULL,
  result_amount REAL NOT NULL,
  donation_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sacrifice_groups (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  animal_type TEXT NOT NULL,
  country TEXT,
  slaughter_point TEXT,
  total_shares INTEGER NOT NULL,
  filled_shares INTEGER DEFAULT 0,
  status TEXT DEFAULT 'open',
  ear_tag TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sacrifice_shares (
  id BIGSERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL,
  donor_id INTEGER,
  share_no INTEGER NOT NULL,
  payment_status TEXT DEFAULT 'pending',
  proxy_method TEXT,
  proxy_confirmed_at TIMESTAMP,
  evidence_ref TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(group_id, share_no)
);
CREATE TABLE IF NOT EXISTS sacrifice_status_history (
  id BIGSERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL,
  old_status TEXT,
  new_status TEXT NOT NULL,
  reason TEXT,
  actor_user_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  target_budget REAL DEFAULT 0,
  currency TEXT DEFAULT 'TRY',
  country TEXT,
  region TEXT,
  latitude REAL,
  longitude REAL,
  privacy_level TEXT DEFAULT 'private',
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS project_milestones (
  id BIGSERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  completed_at TIMESTAMP,
  approved_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, code)
);
CREATE TABLE IF NOT EXISTS project_contributions (
  id BIGSERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL,
  donation_id INTEGER,
  ledger_entry_id INTEGER,
  amount REAL NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS education_courses (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  curriculum_json TEXT DEFAULT '{}',
  active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS course_sessions (
  id BIGSERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL,
  instructor_id INTEGER,
  starts_at TIMESTAMP NOT NULL,
  ends_at TIMESTAMP,
  location TEXT,
  status TEXT DEFAULT 'planned',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS students (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  guardian_phone TEXT,
  active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS attendance_records (
  id BIGSERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  note TEXT,
  recorded_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, student_id)
);
CREATE TABLE IF NOT EXISTS beneficiary_cases (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  case_code TEXT NOT NULL,
  tc_identity_ciphertext TEXT,
  tc_identity_nonce TEXT,
  tc_identity_tag TEXT,
  tc_identity_hmac TEXT,
  masked_identity TEXT,
  need_score REAL,
  score_model TEXT,
  status TEXT DEFAULT 'candidate',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, case_code)
);
CREATE TABLE IF NOT EXISTS assistance_deliveries (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  beneficiary_case_id INTEGER NOT NULL,
  aid_type TEXT NOT NULL,
  amount REAL DEFAULT 0,
  status TEXT DEFAULT 'planned',
  idempotency_key TEXT NOT NULL,
  delivered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS aid_routes (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  assigned_user_id INTEGER,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS route_stops (
  id BIGSERIAL PRIMARY KEY,
  route_id INTEGER NOT NULL,
  beneficiary_case_id INTEGER NOT NULL,
  stop_order INTEGER NOT NULL,
  address_masked TEXT,
  status TEXT DEFAULT 'planned',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS inventory_movements (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  delivery_id INTEGER,
  item_code TEXT NOT NULL,
  quantity REAL NOT NULL,
  movement_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, idempotency_key)
);
`;

module.exports = { UHREVI_SCHEMA };
