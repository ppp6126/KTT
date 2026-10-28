-- =====================================================================
-- V7: Phase 2 โครงการ สัญญา งวดงาน VO แผนงาน รายงานหน้างาน และเอกสารการเงินฝั่งขาย
-- =====================================================================

-- ---------------------------------------------------------------- โครงการ
CREATE TABLE projects (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code              varchar(30)  NOT NULL UNIQUE,           -- PJ 6908-001
    name              varchar(255) NOT NULL,
    customer_id       uuid NOT NULL REFERENCES customers (id),
    lead_id           uuid REFERENCES leads (id),
    quotation_id      uuid REFERENCES quotations (id),
    site_address      text,
    status            varchar(20)  NOT NULL DEFAULT 'planning',
    planned_start     date,
    planned_end       date,
    actual_start      date,
    actual_end        date,
    manager_id        uuid REFERENCES users (id),
    foreman_id        uuid REFERENCES users (id),
    budget_cost       numeric(14, 2),                         -- งบต้นทุน (จาก BOQ) เห็นเฉพาะ cost.view
    progress_pct      numeric(5, 2) NOT NULL DEFAULT 0,       -- คำนวณจากแผนงาน (ถ่วงน้ำหนัก)
    notes             text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid REFERENCES users (id),
    deleted_at        timestamptz,
    CONSTRAINT ck_projects_status CHECK (status IN ('planning', 'active', 'on_hold', 'completed', 'cancelled')),
    CONSTRAINT ck_projects_dates CHECK (planned_end IS NULL OR planned_start IS NULL OR planned_end >= planned_start)
);
CREATE INDEX ix_projects_customer ON projects (customer_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_projects_status ON projects (status) WHERE deleted_at IS NULL;

-- ผู้ที่เกี่ยวข้องกับโครงการ (เห็นโครงการได้แม้ไม่มี project.read_all)
CREATE TABLE project_members (
    project_id  uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role_label  varchar(100),
    PRIMARY KEY (project_id, user_id)
);
CREATE INDEX ix_project_members_user ON project_members (user_id);

-- ---------------------------------------------------------------- สัญญาและงวดงาน
CREATE TABLE contracts (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_no              varchar(30) NOT NULL UNIQUE,           -- CT 6908-001
    project_id          uuid NOT NULL UNIQUE REFERENCES projects (id),
    quotation_id        uuid REFERENCES quotations (id),
    customer_id         uuid NOT NULL REFERENCES customers (id),
    customer_name       varchar(255) NOT NULL,
    customer_address    text,
    customer_tax_id     varchar(13),
    customer_branch_no  varchar(5),
    title               varchar(255) NOT NULL,
    contract_date       date NOT NULL,
    start_date          date,
    end_date            date,
    amount              numeric(14, 2) NOT NULL DEFAULT 0,      -- มูลค่าตามสัญญา (ก่อน VAT)
    vat_enabled         boolean NOT NULL DEFAULT true,
    vat_pct             numeric(4, 2) NOT NULL DEFAULT 7.00,
    advance_pct         numeric(5, 2) NOT NULL DEFAULT 0,       -- เงินล่วงหน้า % (หักคืนตามสัดส่วนทุกงวด)
    retention_pct       numeric(5, 2) NOT NULL DEFAULT 0,       -- เงินประกันผลงาน % ต่องวด
    wht_pct             numeric(4, 2) NOT NULL DEFAULT 0,       -- ลูกค้าหัก ณ ที่จ่าย (นิติบุคคลจ้างทำของ 3%)
    penalty_per_day     numeric(14, 2),                         -- ค่าปรับรายวัน
    warranty_months     int,
    retention_released  numeric(14, 2) NOT NULL DEFAULT 0,      -- คืนเงินประกันผลงานแล้ว
    status              varchar(20) NOT NULL DEFAULT 'draft',
    terms               text,
    notes               text,
    signed_at           date,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid REFERENCES users (id),
    deleted_at          timestamptz,
    CONSTRAINT ck_contracts_status CHECK (status IN ('draft', 'active', 'completed', 'terminated')),
    CONSTRAINT ck_contracts_pct CHECK (advance_pct BETWEEN 0 AND 100 AND retention_pct BETWEEN 0 AND 100),
    CONSTRAINT ck_contracts_wht CHECK (wht_pct IN (0, 1, 2, 3, 5))
);
CREATE INDEX ix_contracts_customer ON contracts (customer_id) WHERE deleted_at IS NULL;

-- งวดงาน/งวดเงิน
CREATE TABLE contract_milestones (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id     uuid NOT NULL REFERENCES contracts (id) ON DELETE CASCADE,
    seq             int NOT NULL,
    name            varchar(255) NOT NULL,
    criteria        text,                                  -- เงื่อนไขส่งมอบงานงวดนี้
    pct             numeric(6, 3) NOT NULL DEFAULT 0,      -- % ของมูลค่าสัญญา
    amount          numeric(14, 2) NOT NULL DEFAULT 0,     -- ก่อน VAT
    due_date        date,
    status          varchar(20) NOT NULL DEFAULT 'pending',
    change_order_id uuid,                                  -- งวดที่มาจาก VO
    completed_at    date,
    CONSTRAINT ck_milestones_status CHECK (status IN ('pending', 'ready', 'billed', 'paid')),
    CONSTRAINT ux_milestones_seq UNIQUE (contract_id, seq)
);

-- งานเพิ่ม-ลด (Variation Order)
CREATE TABLE change_orders (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_no           varchar(30) NOT NULL UNIQUE,
    contract_id      uuid NOT NULL REFERENCES contracts (id),
    project_id       uuid NOT NULL REFERENCES projects (id),
    title            varchar(255) NOT NULL,
    reason           text,
    requested_by_customer boolean NOT NULL DEFAULT true,
    amount           numeric(14, 2) NOT NULL DEFAULT 0,      -- ก่อน VAT (+ เพิ่ม, − ลด)
    cost_amount      numeric(14, 2),
    days_extension   int NOT NULL DEFAULT 0,
    status           varchar(20) NOT NULL DEFAULT 'draft',
    issue_date       date NOT NULL,
    customer_approved_at date,
    decided_by       uuid REFERENCES users (id),
    decided_at       timestamptz,
    decision_comment text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid REFERENCES users (id),
    deleted_at       timestamptz,
    CONSTRAINT ck_change_orders_status CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'cancelled'))
);
CREATE INDEX ix_change_orders_contract ON change_orders (contract_id) WHERE deleted_at IS NULL;

CREATE TABLE change_order_items (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    change_order_id  uuid NOT NULL REFERENCES change_orders (id) ON DELETE CASCADE,
    sort_order       int NOT NULL,
    description      varchar(1000) NOT NULL,
    quantity         numeric(14, 3) NOT NULL DEFAULT 1,
    unit             varchar(30),
    unit_price       numeric(14, 2) NOT NULL DEFAULT 0,      -- ติดลบได้ (งานลด)
    unit_cost        numeric(14, 2),
    amount           numeric(14, 2) NOT NULL DEFAULT 0
);
CREATE INDEX ix_change_order_items_co ON change_order_items (change_order_id, sort_order);

ALTER TABLE contract_milestones
    ADD CONSTRAINT fk_milestones_co FOREIGN KEY (change_order_id) REFERENCES change_orders (id);

-- ---------------------------------------------------------------- แผนงาน (Gantt)
CREATE TABLE project_tasks (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    parent_id       uuid REFERENCES project_tasks (id) ON DELETE CASCADE,
    sort_order      int NOT NULL,
    name            varchar(255) NOT NULL,
    planned_start   date,
    planned_end     date,
    actual_start    date,
    actual_end      date,
    weight          numeric(8, 3) NOT NULL DEFAULT 1,        -- น้ำหนักงานเพื่อคิด % ความคืบหน้า
    progress_pct    numeric(5, 2) NOT NULL DEFAULT 0,
    predecessor_id  uuid REFERENCES project_tasks (id) ON DELETE SET NULL,
    assignee_id     uuid REFERENCES users (id),
    is_milestone    boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_tasks_progress CHECK (progress_pct BETWEEN 0 AND 100),
    CONSTRAINT ck_tasks_weight CHECK (weight >= 0),
    CONSTRAINT ck_tasks_dates CHECK (planned_end IS NULL OR planned_start IS NULL OR planned_end >= planned_start)
);
CREATE INDEX ix_project_tasks_project ON project_tasks (project_id, sort_order);

-- ความคืบหน้ารวมรายวัน (ใช้วาด S-Curve แผน/จริง)
CREATE TABLE project_progress_snapshots (
    project_id    uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    snap_date     date NOT NULL,
    actual_pct    numeric(5, 2) NOT NULL,
    PRIMARY KEY (project_id, snap_date)
);

-- ---------------------------------------------------------------- รายงานประจำวัน
CREATE TABLE daily_reports (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       uuid NOT NULL REFERENCES projects (id),
    report_date      date NOT NULL,
    weather_am       varchar(10),
    weather_pm       varchar(10),
    workers          jsonb NOT NULL DEFAULT '[]',            -- [{trade, count}]
    workers_total    int NOT NULL DEFAULT 0,
    work_done        text,
    work_planned     text,                                   -- แผนงานพรุ่งนี้
    problems         text,
    materials_in     text,
    equipment        text,
    visitors         text,
    safety_note      text,
    status           varchar(20) NOT NULL DEFAULT 'draft',
    submitted_at     timestamptz,
    submitted_by     uuid REFERENCES users (id),
    acknowledged_at  timestamptz,
    acknowledged_by  uuid REFERENCES users (id),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid REFERENCES users (id),
    deleted_at       timestamptz,
    CONSTRAINT ck_daily_reports_status CHECK (status IN ('draft', 'submitted', 'acknowledged')),
    CONSTRAINT ck_daily_reports_weather CHECK (weather_am IS NULL OR weather_am IN ('sunny', 'cloudy', 'rain', 'storm'))
);
CREATE UNIQUE INDEX ux_daily_reports_day ON daily_reports (project_id, report_date) WHERE deleted_at IS NULL;

CREATE TABLE daily_report_tasks (
    report_id     uuid NOT NULL REFERENCES daily_reports (id) ON DELETE CASCADE,
    task_id       uuid NOT NULL REFERENCES project_tasks (id) ON DELETE CASCADE,
    progress_pct  numeric(5, 2) NOT NULL,
    note          varchar(500),
    PRIMARY KEY (report_id, task_id),
    CONSTRAINT ck_drt_progress CHECK (progress_pct BETWEEN 0 AND 100)
);

-- ---------------------------------------------------------------- ปัญหา/ความเสี่ยง, Punch list, QC, ความปลอดภัย
CREATE TABLE project_issues (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   uuid NOT NULL REFERENCES projects (id),
    kind         varchar(10) NOT NULL DEFAULT 'issue',
    title        varchar(255) NOT NULL,
    description  text,
    severity     varchar(10) NOT NULL DEFAULT 'medium',
    likelihood   varchar(10),
    status       varchar(20) NOT NULL DEFAULT 'open',
    owner_id     uuid REFERENCES users (id),
    due_date     date,
    resolution   text,
    closed_at    timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid REFERENCES users (id),
    deleted_at   timestamptz,
    CONSTRAINT ck_issues_kind CHECK (kind IN ('issue', 'risk')),
    CONSTRAINT ck_issues_severity CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT ck_issues_likelihood CHECK (likelihood IS NULL OR likelihood IN ('low', 'medium', 'high')),
    CONSTRAINT ck_issues_status CHECK (status IN ('open', 'in_progress', 'resolved', 'closed'))
);
CREATE INDEX ix_issues_project ON project_issues (project_id, status) WHERE deleted_at IS NULL;

CREATE TABLE punch_items (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   uuid NOT NULL REFERENCES projects (id),
    item_no      int NOT NULL,
    location     varchar(255),
    description  text NOT NULL,
    responsible  varchar(255),
    due_date     date,
    status       varchar(20) NOT NULL DEFAULT 'open',
    fixed_at     timestamptz,
    verified_at  timestamptz,
    verified_by  uuid REFERENCES users (id),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid REFERENCES users (id),
    deleted_at   timestamptz,
    CONSTRAINT ck_punch_status CHECK (status IN ('open', 'fixed', 'verified'))
);
CREATE INDEX ix_punch_project ON punch_items (project_id, item_no) WHERE deleted_at IS NULL;

CREATE TABLE qc_templates (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        varchar(255) NOT NULL,
    category    varchar(100),
    items       jsonb NOT NULL DEFAULT '[]',               -- ["ตรวจระยะเหล็กเสริม", ...]
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    created_by  uuid REFERENCES users (id),
    deleted_at  timestamptz
);

CREATE TABLE qc_inspections (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    uuid NOT NULL REFERENCES projects (id),
    task_id       uuid REFERENCES project_tasks (id) ON DELETE SET NULL,
    title         varchar(255) NOT NULL,
    inspected_on  date NOT NULL,
    inspector_id  uuid REFERENCES users (id),
    result        varchar(20) NOT NULL DEFAULT 'pending',
    items         jsonb NOT NULL DEFAULT '[]',              -- [{text, result: pass|fail|na, note}]
    notes         text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid REFERENCES users (id),
    deleted_at    timestamptz,
    CONSTRAINT ck_qc_result CHECK (result IN ('pending', 'pass', 'fail', 'conditional'))
);
CREATE INDEX ix_qc_project ON qc_inspections (project_id, inspected_on DESC) WHERE deleted_at IS NULL;

CREATE TABLE safety_logs (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id         uuid NOT NULL REFERENCES projects (id),
    log_date           date NOT NULL,
    kind               varchar(20) NOT NULL,
    title              varchar(255) NOT NULL,
    detail             text,
    people_count       int,
    injured_count      int NOT NULL DEFAULT 0,
    severity           varchar(10) NOT NULL DEFAULT 'low',
    corrective_action  text,
    status             varchar(10) NOT NULL DEFAULT 'open',
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid REFERENCES users (id),
    deleted_at         timestamptz,
    CONSTRAINT ck_safety_kind CHECK (kind IN ('toolbox', 'inspection', 'training', 'near_miss', 'incident')),
    CONSTRAINT ck_safety_severity CHECK (severity IN ('low', 'medium', 'high')),
    CONSTRAINT ck_safety_status CHECK (status IN ('open', 'closed'))
);
CREATE INDEX ix_safety_project ON safety_logs (project_id, log_date DESC) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------- เอกสารการเงินฝั่งขาย
-- invoice       ใบแจ้งหนี้ (ยังไม่เกิดภาษีขาย: งานบริการเกิดภาษีเมื่อได้รับชำระ)
-- invoice_tax   ใบแจ้งหนี้/ใบกำกับภาษี (ออกภาษีตั้งแต่วันวางบิล)
-- billing_note  ใบวางบิล (รวมหลายใบแจ้งหนี้)
-- receipt       ใบเสร็จรับเงิน
-- tax_receipt   ใบเสร็จรับเงิน/ใบกำกับภาษี
-- credit_note   ใบลดหนี้ (มาตรา 86/10)
CREATE TABLE sales_docs (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_type            varchar(20) NOT NULL,
    doc_no              varchar(30) NOT NULL,
    doc_date            date NOT NULL,
    due_date            date,
    status              varchar(20) NOT NULL DEFAULT 'draft',
    customer_id         uuid NOT NULL REFERENCES customers (id),
    customer_name       varchar(255) NOT NULL,
    customer_address    text,
    customer_tax_id     varchar(13),
    customer_branch_no  varchar(5),
    project_id          uuid REFERENCES projects (id),
    contract_id         uuid REFERENCES contracts (id),
    ref_doc_id          uuid REFERENCES sales_docs (id),     -- ใบเสร็จ→ใบแจ้งหนี้, ใบลดหนี้→ใบกำกับภาษี
    kind                varchar(20) NOT NULL DEFAULT 'normal', -- normal / advance (เงินล่วงหน้า) / milestone
    subtotal            numeric(14, 2) NOT NULL DEFAULT 0,
    discount_amount     numeric(14, 2) NOT NULL DEFAULT 0,
    advance_deduct      numeric(14, 2) NOT NULL DEFAULT 0,     -- หักคืนเงินล่วงหน้า
    taxable_amount      numeric(14, 2) NOT NULL DEFAULT 0,     -- ฐานภาษี
    vat_pct             numeric(4, 2) NOT NULL DEFAULT 7.00,
    vat_amount          numeric(14, 2) NOT NULL DEFAULT 0,
    total_amount        numeric(14, 2) NOT NULL DEFAULT 0,     -- รวมภาษี
    retention_pct       numeric(5, 2) NOT NULL DEFAULT 0,
    retention_amount    numeric(14, 2) NOT NULL DEFAULT 0,
    wht_pct             numeric(4, 2) NOT NULL DEFAULT 0,
    wht_amount          numeric(14, 2) NOT NULL DEFAULT 0,
    net_amount          numeric(14, 2) NOT NULL DEFAULT 0,     -- ยอดชำระสุทธิ
    settled_amount      numeric(14, 2) NOT NULL DEFAULT 0,     -- ชำระแล้ว (รวมภาษีหัก ณ ที่จ่ายและเงินประกันที่ลูกค้ากัน)
    original_amount     numeric(14, 2),                        -- ใบลดหนี้: มูลค่าตามใบกำกับเดิม
    correct_amount      numeric(14, 2),                        -- ใบลดหนี้: มูลค่าที่ถูกต้อง
    reason              text,                                  -- ใบลดหนี้: เหตุผล / ยกเลิก: เหตุผล
    payment_method      varchar(20),
    payment_ref         varchar(255),
    paid_date           date,
    notes               text,
    issued_at           timestamptz,
    voided_at           timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid REFERENCES users (id),
    deleted_at          timestamptz,
    CONSTRAINT ux_sales_docs_no UNIQUE (doc_type, doc_no),
    CONSTRAINT ck_sales_docs_type CHECK (doc_type IN ('invoice', 'invoice_tax', 'billing_note', 'receipt', 'tax_receipt', 'credit_note')),
    CONSTRAINT ck_sales_docs_status CHECK (status IN ('draft', 'issued', 'partial', 'paid', 'void')),
    CONSTRAINT ck_sales_docs_kind CHECK (kind IN ('normal', 'advance', 'milestone')),
    CONSTRAINT ck_sales_docs_wht CHECK (wht_pct IN (0, 1, 2, 3, 5)),
    CONSTRAINT ck_sales_docs_method CHECK (payment_method IS NULL OR payment_method IN ('cash', 'transfer', 'cheque', 'other'))
);
CREATE INDEX ix_sales_docs_customer ON sales_docs (customer_id, doc_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX ix_sales_docs_project ON sales_docs (project_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_sales_docs_ref ON sales_docs (ref_doc_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_sales_docs_open ON sales_docs (due_date) WHERE status IN ('issued', 'partial') AND deleted_at IS NULL;

CREATE TABLE sales_doc_items (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id        uuid NOT NULL REFERENCES sales_docs (id) ON DELETE CASCADE,
    sort_order    int NOT NULL,
    description   varchar(1000) NOT NULL,
    quantity      numeric(14, 3) NOT NULL DEFAULT 1,
    unit          varchar(30),
    unit_price    numeric(14, 2) NOT NULL DEFAULT 0,
    amount        numeric(14, 2) NOT NULL DEFAULT 0,
    milestone_id  uuid REFERENCES contract_milestones (id)
);
CREATE INDEX ix_sales_doc_items_doc ON sales_doc_items (doc_id, sort_order);
CREATE INDEX ix_sales_doc_items_ms ON sales_doc_items (milestone_id) WHERE milestone_id IS NOT NULL;

-- ใบวางบิลรวมใบแจ้งหนี้หลายใบ
CREATE TABLE billing_note_lines (
    billing_note_id  uuid NOT NULL REFERENCES sales_docs (id) ON DELETE CASCADE,
    invoice_id       uuid NOT NULL REFERENCES sales_docs (id),
    sort_order       int NOT NULL,
    PRIMARY KEY (billing_note_id, invoice_id)
);

-- ---------------------------------------------------------------- ไฟล์แนบเพิ่มประเภท
ALTER TABLE attachments DROP CONSTRAINT ck_attachments_category;
ALTER TABLE attachments ADD CONSTRAINT ck_attachments_category
    CHECK (category IN ('plan', 'site_photo', 'deed', 'permit', 'contract', 'invoice', 'receipt', 'certificate',
                        'drawing', 'report', 'correspondence', 'before', 'after', 'other'));

-- ---------------------------------------------------------------- ตั้งค่าเลขที่เอกสาร
INSERT INTO app_settings (key, value) VALUES
    ('doc.prefixes', '{
        "project": "PJ",
        "contract": "CT",
        "change_order": "VO",
        "invoice": "IV",
        "invoice_tax": "IT",
        "billing_note": "BL",
        "receipt": "RC",
        "tax_receipt": "RT",
        "credit_note": "CN"
     }'),
    ('finance.default_due_days', '30'),
    ('finance.default_retention_pct', '5'),
    ('finance.default_wht_pct', '3'),
    ('project.daily_report_reminder', 'true')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------- สิทธิ์และบทบาทใหม่
INSERT INTO permissions (code, module, action, description, sort_order) VALUES
    ('project.read',      'project',  'read',     'ดูโครงการที่ตนเกี่ยวข้อง', 100),
    ('project.read_all',  'project',  'read_all', 'ดูทุกโครงการ', 101),
    ('project.write',     'project',  'write',    'สร้าง/แก้ไขโครงการ แผนงาน ทีมงาน', 102),
    ('site.report',       'site',     'report',   'บันทึกรายงานประจำวัน ปัญหา Punch list QC ความปลอดภัย', 103),
    ('contract.read',     'contract', 'read',     'ดูสัญญา งวดงาน VO', 110),
    ('contract.write',    'contract', 'write',    'สร้าง/แก้ไขสัญญา งวดงาน VO', 111),
    ('contract.approve',  'contract', 'approve',  'อนุมัติ VO และเปิดใช้สัญญา', 112),
    ('finance.read',      'finance',  'read',     'ดูเอกสารการเงิน ลูกหนี้', 120),
    ('finance.write',     'finance',  'write',    'ออกใบแจ้งหนี้ ใบวางบิล รับชำระ ใบเสร็จ', 121),
    ('finance.void',      'finance',  'void',     'ยกเลิกเอกสาร ออกใบลดหนี้', 122)
ON CONFLICT (code) DO NOTHING;

INSERT INTO roles (code, name, description, is_system)
SELECT v.code, v.name, v.description, true FROM (VALUES
    ('pm',         'ผู้จัดการโครงการ', 'ดูแลโครงการ แผนงาน สัญญา VO'),
    ('foreman',    'โฟร์แมน/หัวหน้างาน', 'รายงานหน้างานประจำวัน รูปถ่าย ปัญหา'),
    ('accountant', 'บัญชี/การเงิน',     'ใบแจ้งหนี้ ใบเสร็จ ลูกหนี้')
) AS v (code, name, description)
WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.code = v.code AND r.deleted_at IS NULL);

-- owner ได้ทุกสิทธิ์ที่เพิ่มใหม่
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.code = 'owner'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
    'customer.read', 'lead.read', 'pricing.read', 'boq.read', 'quotation.read', 'cost.view',
    'project.read', 'project.read_all', 'project.write', 'site.report',
    'contract.read', 'contract.write', 'finance.read', 'attachment.read', 'attachment.write', 'notification.read')
WHERE r.code = 'pm'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
    'project.read', 'site.report', 'attachment.read', 'attachment.write', 'notification.read')
WHERE r.code = 'foreman'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
    'customer.read', 'quotation.read', 'project.read', 'project.read_all', 'contract.read',
    'finance.read', 'finance.write', 'finance.void', 'attachment.read', 'attachment.write', 'notification.read')
WHERE r.code = 'accountant'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('project.read', 'project.read_all', 'contract.read', 'finance.read')
WHERE r.code = 'admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('project.read', 'contract.read')
WHERE r.code = 'sales'
ON CONFLICT DO NOTHING;

-- แม่แบบ QC ตั้งต้น
INSERT INTO qc_templates (name, category, items) VALUES
    ('ตรวจก่อนเทคอนกรีต', 'โครงสร้าง', '["แบบหล่อแข็งแรง ได้ดิ่ง ได้ระดับ", "ขนาดและระยะเหล็กเสริมตามแบบ", "ระยะหุ้มคอนกรีต (ลูกปูน)", "ระยะทาบเหล็ก", "ท่อร้อยสาย/ท่อประปาฝังครบ", "ทำความสะอาดแบบหล่อ", "ใบส่งคอนกรีตกำลังอัดตรงสเปก"]'),
    ('ตรวจงานก่ออิฐฉาบปูน', 'สถาปัตยกรรม', '["แนวดิ่ง/แนวระนาบ", "เสาเอ็น/ทับหลังครบ", "ความหนาปูนฉาบสม่ำเสมอ", "ไม่มีรอยร้าว/โพรง", "มุมฉากได้ฉาก"]'),
    ('ตรวจงานระบบไฟฟ้า', 'ระบบ', '["ขนาดสายไฟตามแบบ", "ต่อสายดินครบ", "ทดสอบเบรกเกอร์/RCBO", "ทดสอบความเป็นฉนวน", "ป้ายวงจรในตู้ไฟ"]'),
    ('ตรวจงานกันซึม', 'สถาปัตยกรรม', '["ผิวพื้นสะอาด แห้ง", "ทาไพรเมอร์", "ความหนาตามสเปก", "ขังน้ำทดสอบ 24–48 ชม.", "ไม่มีรอยรั่ว"]');
