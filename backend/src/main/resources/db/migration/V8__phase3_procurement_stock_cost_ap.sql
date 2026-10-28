-- =====================================================================
-- V8: Phase 3 จัดซื้อ คลังวัสดุ ผู้รับเหมาช่วง ค่าแรง เจ้าหนี้ และภาษีหัก ณ ที่จ่าย
-- ต้นทุนโครงการ = วัสดุที่เบิก/ส่งตรงหน้างาน + ผู้รับเหมาช่วง + ค่าแรง + ค่าใช้จ่ายอื่นที่ระบุโครงการ
-- =====================================================================

-- ---------------------------------------------------------------- ผู้ขาย / ผู้รับเหมาช่วง
CREATE TABLE suppliers (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code           varchar(30)  NOT NULL,
    name           varchar(255) NOT NULL,
    kind           varchar(20)  NOT NULL DEFAULT 'supplier',   -- supplier / subcontractor / both
    person_type    varchar(10)  NOT NULL DEFAULT 'company',    -- person (ภ.ง.ด.3) / company (ภ.ง.ด.53)
    tax_id         varchar(13),
    branch_no      varchar(5),
    address        text,
    phone          varchar(30),
    email          varchar(255),
    contact_name   varchar(150),
    category       varchar(100),
    credit_days    int NOT NULL DEFAULT 0,
    vat_registered boolean NOT NULL DEFAULT true,
    bank_name      varchar(100),
    bank_account   varchar(50),
    notes          text,
    active         boolean NOT NULL DEFAULT true,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid REFERENCES users (id),
    deleted_at     timestamptz,
    CONSTRAINT ck_suppliers_kind CHECK (kind IN ('supplier', 'subcontractor', 'both')),
    CONSTRAINT ck_suppliers_person CHECK (person_type IN ('person', 'company')),
    CONSTRAINT ck_suppliers_tax CHECK (tax_id IS NULL OR tax_id ~ '^[0-9]{13}$')
);
CREATE UNIQUE INDEX ux_suppliers_code ON suppliers (code) WHERE deleted_at IS NULL;
CREATE INDEX ix_suppliers_name ON suppliers (lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE supplier_evaluations (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id  uuid NOT NULL REFERENCES suppliers (id) ON DELETE CASCADE,
    project_id   uuid REFERENCES projects (id),
    eval_date    date NOT NULL,
    quality      smallint NOT NULL,
    delivery     smallint NOT NULL,
    price        smallint NOT NULL,
    service      smallint NOT NULL,
    comment      text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid REFERENCES users (id),
    CONSTRAINT ck_eval_scores CHECK (quality BETWEEN 1 AND 5 AND delivery BETWEEN 1 AND 5 AND price BETWEEN 1 AND 5 AND service BETWEEN 1 AND 5)
);
CREATE INDEX ix_supplier_eval ON supplier_evaluations (supplier_id, eval_date DESC);

-- ---------------------------------------------------------------- คลัง
CREATE TABLE warehouses (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code        varchar(30)  NOT NULL,
    name        varchar(150) NOT NULL,
    project_id  uuid REFERENCES projects (id),                -- คลังหน้างานของโครงการ (null = คลังกลาง)
    active      boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    created_by  uuid REFERENCES users (id),
    deleted_at  timestamptz
);
CREATE UNIQUE INDEX ux_warehouses_code ON warehouses (code) WHERE deleted_at IS NULL;
INSERT INTO warehouses (code, name) VALUES ('MAIN', 'คลังกลาง');

-- จุดสั่งซื้อขั้นต่ำต่อวัสดุต่อคลัง
CREATE TABLE stock_levels (
    material_id   uuid NOT NULL REFERENCES materials (id) ON DELETE CASCADE,
    warehouse_id  uuid NOT NULL REFERENCES warehouses (id) ON DELETE CASCADE,
    min_qty       numeric(14, 3) NOT NULL DEFAULT 0,
    PRIMARY KEY (material_id, warehouse_id)
);

-- เอกสารคลัง (เบิกใช้ โอนย้าย ปรับยอด) ; การรับเข้ามาจากใบรับสินค้า
CREATE TABLE stock_docs (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_no             varchar(30) NOT NULL UNIQUE,
    kind               varchar(10) NOT NULL,                 -- issue / transfer / adjust / return
    doc_date           date NOT NULL,
    warehouse_id       uuid NOT NULL REFERENCES warehouses (id),
    to_warehouse_id    uuid REFERENCES warehouses (id),
    project_id         uuid REFERENCES projects (id),
    notes              text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid REFERENCES users (id),
    CONSTRAINT ck_stock_docs_kind CHECK (kind IN ('issue', 'transfer', 'adjust', 'return'))
);

-- สมุดคุมสินค้า: qty บวก = เข้า, ลบ = ออก ; unit_cost = ต้นทุนต่อหน่วย ณ เวลานั้น (ถัวเฉลี่ย)
CREATE TABLE stock_movements (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    movement_date  date NOT NULL,
    material_id    uuid NOT NULL REFERENCES materials (id),
    warehouse_id   uuid NOT NULL REFERENCES warehouses (id),
    qty            numeric(14, 3) NOT NULL,
    unit_cost      numeric(14, 4) NOT NULL DEFAULT 0,
    kind           varchar(15) NOT NULL,
    project_id     uuid REFERENCES projects (id),            -- เบิกใช้กับโครงการ (ต้นทุน)
    ref_type       varchar(20) NOT NULL,                     -- goods_receipt / stock_doc
    ref_id         uuid NOT NULL,
    note           varchar(500),
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid REFERENCES users (id),
    CONSTRAINT ck_movements_kind CHECK (kind IN ('receive', 'issue', 'transfer_in', 'transfer_out', 'adjust', 'return')),
    CONSTRAINT ck_movements_qty CHECK (qty <> 0)
);
CREATE INDEX ix_movements_item ON stock_movements (material_id, warehouse_id, movement_date);
CREATE INDEX ix_movements_project ON stock_movements (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX ix_movements_ref ON stock_movements (ref_type, ref_id);

-- ---------------------------------------------------------------- ใบขอซื้อ (PR)
CREATE TABLE purchase_requests (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_no         varchar(30) NOT NULL UNIQUE,
    project_id     uuid REFERENCES projects (id),
    warehouse_id   uuid REFERENCES warehouses (id),
    request_date   date NOT NULL,
    required_date  date,
    status         varchar(20) NOT NULL DEFAULT 'draft',
    notes          text,
    decided_by     uuid REFERENCES users (id),
    decided_at     timestamptz,
    decision_comment text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid REFERENCES users (id),
    deleted_at     timestamptz,
    CONSTRAINT ck_pr_status CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'ordered', 'cancelled'))
);
CREATE INDEX ix_pr_status ON purchase_requests (status) WHERE deleted_at IS NULL;

CREATE TABLE purchase_request_items (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pr_id            uuid NOT NULL REFERENCES purchase_requests (id) ON DELETE CASCADE,
    sort_order       int NOT NULL,
    material_id      uuid REFERENCES materials (id),
    description      varchar(500) NOT NULL,
    quantity         numeric(14, 3) NOT NULL,
    unit             varchar(30),
    est_unit_price   numeric(14, 2),
    note             varchar(500)
);
CREATE INDEX ix_pr_items ON purchase_request_items (pr_id, sort_order);

-- ใบเสนอราคาจากผู้ขายเพื่อเปรียบเทียบราคา: prices = {"<pr_item_id>": ราคาต่อหน่วย}
CREATE TABLE pr_quotes (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pr_id          uuid NOT NULL REFERENCES purchase_requests (id) ON DELETE CASCADE,
    supplier_id    uuid NOT NULL REFERENCES suppliers (id),
    quote_ref      varchar(100),
    quote_date     date,
    delivery_days  int,
    credit_days    int,
    vat_included   boolean NOT NULL DEFAULT false,
    prices         jsonb NOT NULL DEFAULT '{}',
    total          numeric(14, 2) NOT NULL DEFAULT 0,
    selected       boolean NOT NULL DEFAULT false,
    notes          text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid REFERENCES users (id)
);
CREATE INDEX ix_pr_quotes ON pr_quotes (pr_id);

-- ---------------------------------------------------------------- ใบสั่งซื้อ (PO)
CREATE TABLE purchase_orders (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_no           varchar(30) NOT NULL UNIQUE,
    supplier_id      uuid NOT NULL REFERENCES suppliers (id),
    supplier_name    varchar(255) NOT NULL,
    supplier_address text,
    supplier_tax_id  varchar(13),
    supplier_branch_no varchar(5),
    project_id       uuid REFERENCES projects (id),
    pr_id            uuid REFERENCES purchase_requests (id),
    warehouse_id     uuid REFERENCES warehouses (id),           -- ส่งเข้าคลัง (null = ส่งตรงหน้างาน ตัดเป็นต้นทุนโครงการทันที)
    order_date       date NOT NULL,
    delivery_date    date,
    delivery_address text,
    status           varchar(20) NOT NULL DEFAULT 'draft',
    subtotal         numeric(14, 2) NOT NULL DEFAULT 0,
    discount_amount  numeric(14, 2) NOT NULL DEFAULT 0,
    vat_pct          numeric(4, 2) NOT NULL DEFAULT 7.00,
    vat_amount       numeric(14, 2) NOT NULL DEFAULT 0,
    total_amount     numeric(14, 2) NOT NULL DEFAULT 0,
    credit_days      int NOT NULL DEFAULT 0,
    payment_terms    varchar(255),
    notes            text,
    approved_by      uuid REFERENCES users (id),
    approved_at      timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid REFERENCES users (id),
    deleted_at       timestamptz,
    CONSTRAINT ck_po_status CHECK (status IN ('draft', 'pending_approval', 'approved', 'partial', 'received', 'closed', 'cancelled'))
);
CREATE INDEX ix_po_supplier ON purchase_orders (supplier_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_po_project ON purchase_orders (project_id) WHERE deleted_at IS NULL;

CREATE TABLE purchase_order_items (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id         uuid NOT NULL REFERENCES purchase_orders (id) ON DELETE CASCADE,
    sort_order    int NOT NULL,
    material_id   uuid REFERENCES materials (id),
    pr_item_id    uuid REFERENCES purchase_request_items (id),
    description   varchar(500) NOT NULL,
    quantity      numeric(14, 3) NOT NULL,
    unit          varchar(30),
    unit_price    numeric(14, 2) NOT NULL DEFAULT 0,
    amount        numeric(14, 2) NOT NULL DEFAULT 0,
    received_qty  numeric(14, 3) NOT NULL DEFAULT 0
);
CREATE INDEX ix_po_items ON purchase_order_items (po_id, sort_order);

-- ---------------------------------------------------------------- ใบรับสินค้า (GR)
CREATE TABLE goods_receipts (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_no            varchar(30) NOT NULL UNIQUE,
    po_id             uuid NOT NULL REFERENCES purchase_orders (id),
    receive_date      date NOT NULL,
    warehouse_id      uuid REFERENCES warehouses (id),
    project_id        uuid REFERENCES projects (id),
    delivery_note_no  varchar(100),
    notes             text,
    status            varchar(10) NOT NULL DEFAULT 'posted',
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid REFERENCES users (id),
    CONSTRAINT ck_gr_status CHECK (status IN ('posted', 'void'))
);
CREATE INDEX ix_gr_po ON goods_receipts (po_id);

CREATE TABLE goods_receipt_items (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    gr_id        uuid NOT NULL REFERENCES goods_receipts (id) ON DELETE CASCADE,
    po_item_id   uuid NOT NULL REFERENCES purchase_order_items (id),
    material_id  uuid REFERENCES materials (id),
    description  varchar(500) NOT NULL,
    quantity     numeric(14, 3) NOT NULL,
    unit         varchar(30),
    unit_cost    numeric(14, 4) NOT NULL,
    CONSTRAINT ck_gr_qty CHECK (quantity > 0)
);

-- ---------------------------------------------------------------- ผู้รับเหมาช่วง
CREATE TABLE subcontracts (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_no         varchar(30) NOT NULL UNIQUE,
    project_id     uuid NOT NULL REFERENCES projects (id),
    supplier_id    uuid NOT NULL REFERENCES suppliers (id),
    title          varchar(255) NOT NULL,
    scope          text,
    amount         numeric(14, 2) NOT NULL DEFAULT 0,      -- ก่อน VAT
    vat_pct        numeric(4, 2) NOT NULL DEFAULT 0,
    retention_pct  numeric(5, 2) NOT NULL DEFAULT 5,
    wht_pct        numeric(4, 2) NOT NULL DEFAULT 3,
    start_date     date,
    end_date       date,
    status         varchar(20) NOT NULL DEFAULT 'draft',
    retention_released numeric(14, 2) NOT NULL DEFAULT 0,
    notes          text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid REFERENCES users (id),
    deleted_at     timestamptz,
    CONSTRAINT ck_sc_status CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
    CONSTRAINT ck_sc_wht CHECK (wht_pct IN (0, 1, 2, 3, 5))
);
CREATE INDEX ix_sc_project ON subcontracts (project_id) WHERE deleted_at IS NULL;

-- งวดเบิกของผู้รับเหมาช่วง
CREATE TABLE subcontract_claims (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subcontract_id  uuid NOT NULL REFERENCES subcontracts (id) ON DELETE CASCADE,
    claim_no        int NOT NULL,
    claim_date      date NOT NULL,
    description     varchar(500) NOT NULL,
    progress_pct    numeric(5, 2),                         -- % งานสะสมที่ตรวจรับ
    amount          numeric(14, 2) NOT NULL,              -- มูลค่างานงวดนี้ (ก่อน VAT)
    status          varchar(20) NOT NULL DEFAULT 'draft', -- draft / approved / billed
    ap_bill_id      uuid,
    approved_by     uuid REFERENCES users (id),
    approved_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid REFERENCES users (id),
    CONSTRAINT ux_sc_claim UNIQUE (subcontract_id, claim_no),
    CONSTRAINT ck_sc_claim_status CHECK (status IN ('draft', 'approved', 'billed'))
);

-- ---------------------------------------------------------------- แรงงานรายวัน
CREATE TABLE workers (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name         varchar(150) NOT NULL,
    nickname     varchar(50),
    trade        varchar(50),
    daily_wage   numeric(10, 2) NOT NULL DEFAULT 0,
    ot_rate      numeric(10, 2) NOT NULL DEFAULT 0,        -- บาท/ชั่วโมง
    phone        varchar(30),
    id_card      varchar(13),
    supplier_id  uuid REFERENCES suppliers (id),           -- ทีมของผู้รับเหมาช่วง (ถ้ามี)
    active       boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid REFERENCES users (id),
    deleted_at   timestamptz
);

CREATE TABLE timesheets (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    work_date   date NOT NULL,
    project_id  uuid NOT NULL REFERENCES projects (id),
    worker_id   uuid NOT NULL REFERENCES workers (id),
    days        numeric(3, 1) NOT NULL DEFAULT 1,           -- 0.5 = ครึ่งวัน
    ot_hours    numeric(4, 1) NOT NULL DEFAULT 0,
    wage        numeric(10, 2) NOT NULL,                    -- ค่าแรงวันนั้น (คิด ณ อัตราขณะบันทึก)
    note        varchar(255),
    wage_payment_id uuid,
    created_at  timestamptz NOT NULL DEFAULT now(),
    created_by  uuid REFERENCES users (id),
    CONSTRAINT ux_timesheet UNIQUE (worker_id, work_date, project_id),
    CONSTRAINT ck_timesheet_days CHECK (days > 0 AND days <= 1.5)
);
CREATE INDEX ix_timesheets_project ON timesheets (project_id, work_date);

CREATE TABLE wage_payments (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_no       varchar(30) NOT NULL UNIQUE,
    period_from  date NOT NULL,
    period_to    date NOT NULL,
    project_id   uuid REFERENCES projects (id),
    total        numeric(14, 2) NOT NULL DEFAULT 0,
    paid_date    date,
    status       varchar(10) NOT NULL DEFAULT 'draft',
    notes        text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid REFERENCES users (id),
    CONSTRAINT ck_wage_status CHECK (status IN ('draft', 'paid', 'void'))
);
ALTER TABLE timesheets ADD CONSTRAINT fk_timesheet_wage FOREIGN KEY (wage_payment_id) REFERENCES wage_payments (id);

-- ---------------------------------------------------------------- เจ้าหนี้
CREATE TABLE ap_bills (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_no                varchar(30) NOT NULL UNIQUE,      -- เลขภายใน AP
    supplier_id           uuid NOT NULL REFERENCES suppliers (id),
    supplier_name         varchar(255) NOT NULL,
    supplier_tax_id       varchar(13),
    supplier_branch_no    varchar(5),
    supplier_invoice_no   varchar(100),                     -- เลขที่ใบกำกับ/ใบแจ้งหนี้ของผู้ขาย
    tax_invoice           boolean NOT NULL DEFAULT false,   -- เป็นใบกำกับภาษีเต็มรูป (ใช้เครดิตภาษีซื้อได้)
    bill_date             date NOT NULL,
    due_date              date,
    tax_period            varchar(7),                       -- เดือนภาษีที่ใช้ขอคืนภาษีซื้อ YYYY-MM
    project_id            uuid REFERENCES projects (id),
    po_id                 uuid REFERENCES purchase_orders (id),
    subcontract_claim_id  uuid REFERENCES subcontract_claims (id),
    category              varchar(20) NOT NULL DEFAULT 'material',
    subtotal              numeric(14, 2) NOT NULL DEFAULT 0,
    vat_pct               numeric(4, 2) NOT NULL DEFAULT 7.00,
    vat_amount            numeric(14, 2) NOT NULL DEFAULT 0,
    total_amount          numeric(14, 2) NOT NULL DEFAULT 0,
    retention_amount      numeric(14, 2) NOT NULL DEFAULT 0, -- เรากันไว้ (ผู้รับเหมาช่วง)
    wht_pct               numeric(4, 2) NOT NULL DEFAULT 0,
    wht_amount            numeric(14, 2) NOT NULL DEFAULT 0,
    net_payable           numeric(14, 2) NOT NULL DEFAULT 0,
    paid_amount           numeric(14, 2) NOT NULL DEFAULT 0,  -- ตัดยอดแล้ว (รวมภาษีหัก ณ ที่จ่าย)
    status                varchar(20) NOT NULL DEFAULT 'draft',
    notes                 text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid REFERENCES users (id),
    deleted_at            timestamptz,
    CONSTRAINT ck_ap_status CHECK (status IN ('draft', 'approved', 'partial', 'paid', 'void')),
    CONSTRAINT ck_ap_category CHECK (category IN ('material', 'subcontract', 'labor', 'equipment', 'overhead', 'other')),
    CONSTRAINT ck_ap_wht CHECK (wht_pct IN (0, 1, 2, 3, 5))
);
CREATE INDEX ix_ap_supplier ON ap_bills (supplier_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_ap_project ON ap_bills (project_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_ap_open ON ap_bills (due_date) WHERE status IN ('approved', 'partial') AND deleted_at IS NULL;
ALTER TABLE subcontract_claims ADD CONSTRAINT fk_claim_bill FOREIGN KEY (ap_bill_id) REFERENCES ap_bills (id);

CREATE TABLE ap_bill_items (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id      uuid NOT NULL REFERENCES ap_bills (id) ON DELETE CASCADE,
    sort_order   int NOT NULL,
    description  varchar(500) NOT NULL,
    quantity     numeric(14, 3) NOT NULL DEFAULT 1,
    unit         varchar(30),
    unit_price   numeric(14, 2) NOT NULL DEFAULT 0,
    amount       numeric(14, 2) NOT NULL DEFAULT 0
);

-- ใบสำคัญจ่าย
CREATE TABLE payment_vouchers (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_no        varchar(30) NOT NULL UNIQUE,
    supplier_id   uuid NOT NULL REFERENCES suppliers (id),
    supplier_name varchar(255) NOT NULL,
    pay_date      date NOT NULL,
    method        varchar(20) NOT NULL DEFAULT 'transfer',
    bank_ref      varchar(255),
    gross_amount  numeric(14, 2) NOT NULL DEFAULT 0,       -- ยอดตัดหนี้
    wht_amount    numeric(14, 2) NOT NULL DEFAULT 0,
    net_paid      numeric(14, 2) NOT NULL DEFAULT 0,
    status        varchar(20) NOT NULL DEFAULT 'draft',
    approved_by   uuid REFERENCES users (id),
    approved_at   timestamptz,
    notes         text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid REFERENCES users (id),
    deleted_at    timestamptz,
    CONSTRAINT ck_pv_status CHECK (status IN ('draft', 'approved', 'paid', 'void')),
    CONSTRAINT ck_pv_method CHECK (method IN ('cash', 'transfer', 'cheque', 'other'))
);

CREATE TABLE payment_voucher_lines (
    pv_id       uuid NOT NULL REFERENCES payment_vouchers (id) ON DELETE CASCADE,
    bill_id     uuid NOT NULL REFERENCES ap_bills (id),
    amount      numeric(14, 2) NOT NULL,                    -- ยอดตัดหนี้ของบิลนี้ (รวม WHT)
    wht_amount  numeric(14, 2) NOT NULL DEFAULT 0,
    PRIMARY KEY (pv_id, bill_id)
);

-- หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) ออกตอนจ่ายเงินจริง
CREATE TABLE wht_certificates (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    book_no           varchar(10) NOT NULL,                 -- เล่มที่ (ปี พ.ศ.)
    run_no            int NOT NULL,                         -- เลขที่ในเล่ม
    pv_id             uuid NOT NULL REFERENCES payment_vouchers (id),
    form              varchar(6) NOT NULL,                  -- pnd3 / pnd53
    payee_name        varchar(255) NOT NULL,
    payee_tax_id      varchar(13),
    payee_address     text,
    pay_date          date NOT NULL,
    income_type       varchar(100) NOT NULL,                -- เช่น ค่าจ้างทำของ (มาตรา 3 เตรส)
    amount            numeric(14, 2) NOT NULL,              -- เงินได้ที่จ่าย (ก่อน VAT)
    wht_rate          numeric(4, 2) NOT NULL,
    wht_amount        numeric(14, 2) NOT NULL,
    status            varchar(10) NOT NULL DEFAULT 'issued',
    created_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ux_wht_cert UNIQUE (book_no, run_no),
    CONSTRAINT ck_wht_form CHECK (form IN ('pnd3', 'pnd53')),
    CONSTRAINT ck_wht_status CHECK (status IN ('issued', 'void'))
);
CREATE INDEX ix_wht_pay_date ON wht_certificates (pay_date);

-- ---------------------------------------------------------------- ตั้งค่าเลขที่เอกสาร
UPDATE app_settings SET value = value || '{
    "purchase_request": "PR",
    "purchase_order": "PO",
    "goods_receipt": "GR",
    "stock_doc": "SD",
    "subcontract": "SC",
    "wage_payment": "WG",
    "ap_bill": "AP",
    "payment_voucher": "PV"
}'::jsonb WHERE key = 'doc.prefixes';

INSERT INTO app_settings (key, value) VALUES
    ('purchase.approval_threshold', '50000')      -- PO มูลค่าเกินนี้ (รวม VAT) ต้องอนุมัติ
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------- สิทธิ์และบทบาท
INSERT INTO permissions (code, module, action, description, sort_order) VALUES
    ('purchase.request',  'purchase', 'request',  'เขียนใบขอซื้อ (PR)', 130),
    ('purchase.read',     'purchase', 'read',     'ดูผู้ขาย PR PO ใบรับสินค้า', 131),
    ('purchase.write',    'purchase', 'write',    'จัดการผู้ขาย เปรียบเทียบราคา ออก PO รับสินค้า', 132),
    ('purchase.approve',  'purchase', 'approve',  'อนุมัติ PR และ PO', 133),
    ('stock.read',        'stock',    'read',     'ดูคลังวัสดุ', 140),
    ('stock.write',       'stock',    'write',    'เบิก โอน ปรับยอดวัสดุ', 141),
    ('subcontract.read',  'subcontract', 'read',  'ดูผู้รับเหมาช่วงและงวดเบิก', 150),
    ('subcontract.write', 'subcontract', 'write', 'ทำสัญญาจ้างช่วง บันทึก/อนุมัติงวดเบิก', 151),
    ('labor.read',        'labor',    'read',     'ดูแรงงานและค่าแรง', 160),
    ('labor.write',       'labor',    'write',    'บันทึกเวลาทำงาน ทำจ่ายค่าแรง', 161),
    ('ap.read',           'ap',       'read',     'ดูเจ้าหนี้ ใบสำคัญจ่าย', 170),
    ('ap.write',          'ap',       'write',    'บันทึกบิลผู้ขาย ทำใบสำคัญจ่าย', 171),
    ('ap.approve',        'ap',       'approve',  'อนุมัติบิลและการจ่ายเงิน', 172),
    ('tax.report',        'tax',      'report',   'รายงานภาษีซื้อ-ขาย ภ.ง.ด.3/53', 180)
ON CONFLICT (code) DO NOTHING;

INSERT INTO roles (code, name, description, is_system)
SELECT v.code, v.name, v.description, true FROM (VALUES
    ('purchaser',   'จัดซื้อ',   'ผู้ขาย เปรียบเทียบราคา PO'),
    ('storekeeper', 'สโตร์/คลัง', 'รับสินค้า เบิก โอนวัสดุ')
) AS v (code, name, description)
WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.code = v.code AND r.deleted_at IS NULL);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.code = 'owner'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
    'purchase.request', 'purchase.read', 'purchase.write', 'stock.read', 'pricing.read', 'project.read', 'project.read_all',
    'subcontract.read', 'attachment.read', 'attachment.write', 'notification.read')
WHERE r.code = 'purchaser'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
    'purchase.request', 'purchase.read', 'stock.read', 'stock.write', 'pricing.read', 'project.read', 'project.read_all',
    'attachment.read', 'attachment.write', 'notification.read')
WHERE r.code = 'storekeeper'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
    'purchase.request', 'purchase.read', 'purchase.approve', 'stock.read', 'stock.write',
    'subcontract.read', 'subcontract.write', 'labor.read', 'labor.write', 'ap.read')
WHERE r.code = 'pm'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('purchase.request', 'stock.read', 'labor.write', 'labor.read')
WHERE r.code = 'foreman'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
    'purchase.read', 'stock.read', 'subcontract.read', 'labor.read', 'labor.write',
    'ap.read', 'ap.write', 'tax.report', 'cost.view')
WHERE r.code = 'accountant'
ON CONFLICT DO NOTHING;
