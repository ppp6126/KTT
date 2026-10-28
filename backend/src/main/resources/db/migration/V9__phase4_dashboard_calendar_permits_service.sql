-- =====================================================================
-- V9: Phase 4 แดชบอร์ด ปฏิทิน ใบอนุญาต/เอกสารมีวันหมดอายุ งานรับประกันและแจ้งซ่อม
--     ความพึงพอใจลูกค้า (บันทึกโดยหลังบ้าน) และสำรองข้อมูล
-- =====================================================================

-- ---------------------------------------------------------------- ใบอนุญาต / ใบรับรอง / ประกันภัย
CREATE TABLE permits (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind             varchar(20)  NOT NULL DEFAULT 'other',
    name             varchar(255) NOT NULL,
    number           varchar(100),
    issuer           varchar(255),
    project_id       uuid REFERENCES projects (id),            -- null = เอกสารของบริษัท
    issue_date       date,
    expiry_date      date,                                     -- null = ไม่มีวันหมดอายุ
    notify_days      int NOT NULL DEFAULT 30,
    owner_id         uuid REFERENCES users (id),               -- ผู้รับผิดชอบต่ออายุ
    status           varchar(20) NOT NULL DEFAULT 'active',
    renewed_from_id  uuid REFERENCES permits (id),
    last_notified_on date,
    notes            text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid REFERENCES users (id),
    deleted_at       timestamptz,
    CONSTRAINT ck_permits_kind CHECK (kind IN ('company_license', 'building_permit', 'insurance', 'vehicle', 'equipment', 'certificate', 'other')),
    CONSTRAINT ck_permits_status CHECK (status IN ('active', 'renewing', 'renewed', 'cancelled')),
    CONSTRAINT ck_permits_notify CHECK (notify_days BETWEEN 0 AND 365),
    CONSTRAINT ck_permits_dates CHECK (issue_date IS NULL OR expiry_date IS NULL OR expiry_date >= issue_date)
);
CREATE INDEX ix_permits_expiry ON permits (expiry_date) WHERE deleted_at IS NULL AND status IN ('active', 'renewing');
CREATE INDEX ix_permits_project ON permits (project_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------- รับประกันผลงาน
-- วันสิ้นสุดรับประกัน = warranty_until (ถ้ากำหนดเอง) หรือ วันส่งมอบจริง + warranty_months ของสัญญา
ALTER TABLE projects ADD COLUMN warranty_until date;

-- ---------------------------------------------------------------- แจ้งซ่อม
CREATE TABLE service_tickets (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_no          varchar(30)  NOT NULL,
    project_id      uuid REFERENCES projects (id),
    customer_id     uuid NOT NULL REFERENCES customers (id),
    title           varchar(255) NOT NULL,
    description     text,
    category        varchar(20)  NOT NULL DEFAULT 'other',
    priority        varchar(10)  NOT NULL DEFAULT 'normal',
    channel         varchar(20)  NOT NULL DEFAULT 'phone',
    reporter_name   varchar(150),
    reporter_phone  varchar(30),
    site_address    text,
    reported_at     timestamptz  NOT NULL,
    in_warranty     boolean NOT NULL DEFAULT false,
    status          varchar(20)  NOT NULL DEFAULT 'open',
    assignee_id     uuid REFERENCES users (id),
    appointment_at  timestamptz,
    resolved_at     timestamptz,
    closed_at       timestamptz,
    resolution      text,
    labor_cost      numeric(14, 2) NOT NULL DEFAULT 0,
    material_cost   numeric(14, 2) NOT NULL DEFAULT 0,
    charge_amount   numeric(14, 2) NOT NULL DEFAULT 0,       -- เรียกเก็บลูกค้า (นอกประกัน)
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid REFERENCES users (id),
    deleted_at      timestamptz,
    CONSTRAINT ck_tickets_category CHECK (category IN ('structure', 'roof_leak', 'plumbing', 'electrical', 'finishing', 'door_window', 'other')),
    CONSTRAINT ck_tickets_priority CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    CONSTRAINT ck_tickets_channel CHECK (channel IN ('phone', 'line', 'walk_in', 'site', 'email', 'other')),
    CONSTRAINT ck_tickets_status CHECK (status IN ('open', 'scheduled', 'in_progress', 'resolved', 'closed', 'rejected')),
    CONSTRAINT ck_tickets_costs CHECK (labor_cost >= 0 AND material_cost >= 0 AND charge_amount >= 0)
);
CREATE UNIQUE INDEX ux_tickets_doc_no ON service_tickets (doc_no);
CREATE INDEX ix_tickets_status ON service_tickets (status, reported_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX ix_tickets_project ON service_tickets (project_id) WHERE deleted_at IS NULL;

CREATE TABLE service_ticket_logs (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id   uuid NOT NULL REFERENCES service_tickets (id) ON DELETE CASCADE,
    status      varchar(20),
    note        text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    created_by  uuid REFERENCES users (id)
);
CREATE INDEX ix_ticket_logs ON service_ticket_logs (ticket_id, created_at);

-- ---------------------------------------------------------------- ความพึงพอใจ (หลังบ้านบันทึกจากการโทร/เยี่ยม)
CREATE TABLE satisfaction_surveys (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id    uuid NOT NULL REFERENCES customers (id),
    project_id     uuid REFERENCES projects (id),
    ticket_id      uuid REFERENCES service_tickets (id),
    survey_date    date NOT NULL,
    method         varchar(20) NOT NULL DEFAULT 'phone',
    respondent     varchar(150),
    quality        smallint,
    timeliness     smallint,
    communication  smallint,
    cleanliness    smallint,
    overall        smallint NOT NULL,
    recommend      boolean,
    comment        text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid REFERENCES users (id),
    deleted_at     timestamptz,
    CONSTRAINT ck_survey_method CHECK (method IN ('phone', 'visit', 'paper', 'line', 'other')),
    CONSTRAINT ck_survey_scores CHECK (
        overall BETWEEN 1 AND 5
        AND (quality IS NULL OR quality BETWEEN 1 AND 5)
        AND (timeliness IS NULL OR timeliness BETWEEN 1 AND 5)
        AND (communication IS NULL OR communication BETWEEN 1 AND 5)
        AND (cleanliness IS NULL OR cleanliness BETWEEN 1 AND 5))
);
CREATE INDEX ix_survey_date ON satisfaction_surveys (survey_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX ix_survey_project ON satisfaction_surveys (project_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------- ปฏิทิน (นัดหมายที่บันทึกเอง)
CREATE TABLE calendar_events (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title       varchar(255) NOT NULL,
    kind        varchar(20)  NOT NULL DEFAULT 'other',
    starts_at   timestamptz  NOT NULL,
    ends_at     timestamptz,
    all_day     boolean NOT NULL DEFAULT false,
    location    varchar(255),
    project_id  uuid REFERENCES projects (id),
    is_private  boolean NOT NULL DEFAULT false,
    notes       text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    created_by  uuid REFERENCES users (id),
    deleted_at  timestamptz,
    CONSTRAINT ck_events_kind CHECK (kind IN ('meeting', 'site_visit', 'inspection', 'delivery', 'handover', 'other')),
    CONSTRAINT ck_events_range CHECK (ends_at IS NULL OR ends_at >= starts_at)
);
CREATE INDEX ix_events_start ON calendar_events (starts_at) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------- สำรองข้อมูล
CREATE TABLE backup_runs (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind         varchar(10) NOT NULL,            -- manual / scheduled
    status       varchar(10) NOT NULL DEFAULT 'running',
    started_at   timestamptz NOT NULL DEFAULT now(),
    finished_at  timestamptz,
    file_name    varchar(255),
    size_bytes   bigint,
    table_count  int,
    row_count    bigint,
    error        text,
    created_by   uuid REFERENCES users (id),
    CONSTRAINT ck_backup_kind CHECK (kind IN ('manual', 'scheduled')),
    CONSTRAINT ck_backup_status CHECK (status IN ('running', 'ok', 'failed'))
);
CREATE INDEX ix_backup_started ON backup_runs (started_at DESC);

-- ---------------------------------------------------------------- เลขที่เอกสารและค่าตั้งต้น
UPDATE app_settings SET value = value || '{"service_ticket": "SR"}'::jsonb WHERE key = 'doc.prefixes';

INSERT INTO app_settings (key, value) VALUES
    ('backup.keep_days', '30'),              -- เก็บไฟล์สำรองอัตโนมัติกี่วัน
    ('backup.scheduled', 'true'),            -- สำรองอัตโนมัติทุกคืน 02:00
    ('service.default_warranty_months', '12')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------- สิทธิ์
INSERT INTO permissions (code, module, action, description, sort_order) VALUES
    ('dashboard.view',  'dashboard', 'view',  'ดูแดชบอร์ดผู้บริหาร (ยอดขาย กำไร ลูกหนี้ เจ้าหนี้)', 170),
    ('permit.read',     'permit',    'read',  'ดูใบอนุญาตและเอกสารที่มีวันหมดอายุ', 175),
    ('permit.write',    'permit',    'write', 'เพิ่ม แก้ไข ต่ออายุใบอนุญาต', 176),
    ('service.read',    'service',   'read',  'ดูงานแจ้งซ่อมและความพึงพอใจ', 180),
    ('service.write',   'service',   'write', 'รับแจ้งซ่อม นัดหมาย ปิดงาน บันทึกความพึงพอใจ', 181),
    ('backup.manage',   'backup',    'manage', 'สำรองและส่งออกข้อมูลทั้งระบบ', 190)
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.code = 'owner'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('backup.manage', 'permit.read', 'permit.write')
WHERE r.code = 'admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('permit.read', 'permit.write', 'service.read', 'service.write')
WHERE r.code = 'pm'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('permit.read', 'service.read', 'service.write')
WHERE r.code = 'foreman'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('service.read', 'service.write')
WHERE r.code = 'sales'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('permit.read', 'permit.write', 'service.read')
WHERE r.code = 'accountant'
ON CONFLICT DO NOTHING;
