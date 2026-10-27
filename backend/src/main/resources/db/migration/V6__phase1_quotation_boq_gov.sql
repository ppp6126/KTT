-- =====================================================================
-- V6: ปรับตามแบบใบเสนอราคาจริงของบริษัท + BOQ แบบงานราชการ (ปร.4/ปร.5) + แจ้งเตือน
-- =====================================================================

-- ---------- เลขที่เอกสาร: นับใหม่ทุกเดือน เช่น INV 6908-001 (period = 6908)
DROP TABLE doc_sequences;
CREATE TABLE doc_counters (
    prefix   varchar(20) NOT NULL,
    period   varchar(10) NOT NULL,
    last_no  int         NOT NULL DEFAULT 0,
    PRIMARY KEY (prefix, period)
);

-- ---------- Factor F (กรมบัญชีกลาง): ผู้ใช้กรอกตารางเอง ระบบเทียบบัญญัติไตรยางศ์ระหว่างช่วง
CREATE TABLE factor_f_tables (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name           varchar(255) NOT NULL,           -- เช่น งานอาคาร เงินล่วงหน้า 0% ประกัน 0% ดอกเบี้ย 6% VAT 7%
    work_type      varchar(50)  NOT NULL DEFAULT 'building',
    advance_pct    numeric(5, 2),
    retention_pct  numeric(5, 2),
    interest_pct   numeric(5, 2),
    vat_pct        numeric(5, 2),
    note           text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid REFERENCES users (id),
    deleted_at     timestamptz
);

CREATE TABLE factor_f_table_rows (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id    uuid NOT NULL REFERENCES factor_f_tables (id) ON DELETE CASCADE,
    cost        numeric(16, 2) NOT NULL,             -- ค่างานต้นทุน (บาท)
    factor      numeric(8, 4)  NOT NULL,             -- Factor F ที่ค่างานต้นทุนนี้
    UNIQUE (table_id, cost)
);

ALTER TABLE boqs
    ADD COLUMN factor_f_mode      varchar(10) NOT NULL DEFAULT 'none',   -- none / manual / table
    ADD COLUMN factor_f_value     numeric(8, 4),
    ADD COLUMN factor_f_table_id  uuid REFERENCES factor_f_tables (id),
    ADD COLUMN project_name       varchar(255),                          -- ชื่อโครงการบนแบบ ปร.
    ADD COLUMN project_location   varchar(500),
    ADD COLUMN owner_agency       varchar(255),                          -- หน่วยงานเจ้าของโครงการ
    ADD COLUMN notes              text,
    ADD CONSTRAINT ck_boqs_factor_mode CHECK (factor_f_mode IN ('none', 'manual', 'table'));
ALTER TABLE boqs DROP COLUMN factor_f_pct;

ALTER TABLE boq_items ADD COLUMN note varchar(255);
ALTER TABLE boq_template_items ADD COLUMN note varchar(255);

-- ---------- ใบเสนอราคา: รายการของตัวเอง (ไม่ผูกกับ BOQ) ตามแบบฟอร์มบริษัท
ALTER TABLE quotations ALTER COLUMN boq_id DROP NOT NULL;
ALTER TABLE quotations ALTER COLUMN lead_id DROP NOT NULL;
ALTER TABLE quotations DROP CONSTRAINT ck_quotations_status;
ALTER TABLE quotations ADD CONSTRAINT ck_quotations_status
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'sent', 'accepted', 'rejected', 'expired', 'superseded'));
ALTER TABLE quotations
    ADD COLUMN title                varchar(255),
    -- snapshot ข้อมูลลูกค้า ณ วันออกเอกสาร (แก้ทะเบียนลูกค้าทีหลังไม่กระทบเอกสารเดิม)
    ADD COLUMN customer_name        varchar(255),
    ADD COLUMN customer_address     text,
    ADD COLUMN customer_tax_id      varchar(13),
    ADD COLUMN customer_branch_no   varchar(5),
    ADD COLUMN customer_phone       varchar(30),
    ADD COLUMN reference_no         varchar(100),       -- อ้างอิงใบสั่งซื้อเลขที่
    ADD COLUMN payment_condition    varchar(255),       -- เงื่อนไขการชำระเงิน
    ADD COLUMN subtotal             numeric(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN discount_pct         numeric(5, 2)  NOT NULL DEFAULT 0,
    ADD COLUMN discount_amount      numeric(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN overhead_pct         numeric(5, 2)  NOT NULL DEFAULT 0,  -- ค่าดำเนินการ %
    ADD COLUMN overhead_amount      numeric(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN vat_enabled          boolean        NOT NULL DEFAULT true,
    ADD COLUMN vat_pct              numeric(4, 2)  NOT NULL DEFAULT 7.00,
    ADD COLUMN vat_amount           numeric(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN rounding_mode        varchar(10)    NOT NULL DEFAULT 'none',
    ADD COLUMN rounding_amount      numeric(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN wht_pct              numeric(4, 2)  NOT NULL DEFAULT 0,
    ADD COLUMN wht_amount           numeric(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN cost_total           numeric(14, 2),                     -- ต้นทุน (ถ้าสร้างจาก BOQ) ไว้คำนวณ margin
    ADD COLUMN notes                text,
    ADD COLUMN lost_reason          text,
    ADD COLUMN sent_at              timestamptz,
    ADD COLUMN decided_at           timestamptz,
    ADD CONSTRAINT ck_quotations_rounding CHECK (rounding_mode IN ('none', 'down_1', 'down_10', 'down_100')),
    ADD CONSTRAINT ck_quotations_discount CHECK (discount_pct BETWEEN 0 AND 15),
    ADD CONSTRAINT ck_quotations_wht CHECK (wht_pct IN (0, 1, 2, 3, 5));
CREATE INDEX ix_quotations_customer ON quotations (customer_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_quotations_valid ON quotations (valid_until) WHERE status = 'sent';

CREATE TABLE quotation_items (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_id  uuid NOT NULL REFERENCES quotations (id) ON DELETE CASCADE,
    sort_order    int  NOT NULL,
    item_type     varchar(10) NOT NULL DEFAULT 'item',  -- item / heading / note
    description   varchar(1000) NOT NULL,
    quantity      numeric(14, 3),
    unit          varchar(30),
    unit_price    numeric(14, 2),
    amount        numeric(14, 2) NOT NULL DEFAULT 0,
    unit_cost     numeric(14, 2),                        -- ต้นทุนต่อหน่วย (เห็นเฉพาะผู้มีสิทธิ์ cost.view)
    CONSTRAINT ck_quotation_items_type CHECK (item_type IN ('item', 'heading', 'note'))
);
CREATE INDEX ix_quotation_items_q ON quotation_items (quotation_id, sort_order);

-- ---------- แจ้งเตือนในระบบ
CREATE TABLE notifications (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type        varchar(50) NOT NULL,
    title       varchar(255) NOT NULL,
    body        text,
    link        varchar(500),
    ref_type    varchar(50),
    ref_id      uuid,
    read_at     timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX ix_notifications_unread ON notifications (user_id) WHERE read_at IS NULL;
-- กันแจ้งเตือนเรื่องเดียวกันซ้ำในวันเดียวกัน
CREATE UNIQUE INDEX ux_notifications_dedupe ON notifications (user_id, type, ref_id, ((created_at AT TIME ZONE 'Asia/Bangkok')::date));

-- ---------- ตั้งค่าตามคำตอบของบริษัท
UPDATE app_settings SET value = '5' WHERE key = 'quotation.discount_approval_threshold_pct';
INSERT INTO app_settings (key, value) VALUES
    ('company.profile', '{
        "nameTh": "บริษัท เคทีที คอนสตรัคชั่น จำกัด",
        "nameEn": "KTTCONSTRUCTION CO., LTD.",
        "taxId": "0565568000293",
        "branchNo": "00000",
        "address": "509 หมู่ที่ 4 ต.หย่วน อ.เชียงคำ จ.พะเยา 56110",
        "phone": "095-721-0244 / 096-234-8632",
        "email": "",
        "signerName": "นายกรวิชญ์ บุตรพรม",
        "signerTitle": "ผู้มีอำนาจลงนาม / ผู้เสนอราคา",
        "bankName": "",
        "bankBranch": "",
        "bankAccountName": "",
        "bankAccountNo": ""
     }'),
    ('quotation.doc_prefix', '"INV"'),
    ('quotation.default_overhead_pct', '0'),
    ('quotation.default_vat_enabled', 'true'),
    ('quotation.default_rounding', '"none"'),
    ('quotation.default_payment_condition', '""'),
    ('quotation.default_warranty', '""'),
    ('quotation.expiry_notice_days', '3')
ON CONFLICT (key) DO NOTHING;

INSERT INTO permissions (code, module, action, description, sort_order) VALUES
    ('notification.read', 'notification', 'read', 'รับการแจ้งเตือน', 90)
ON CONFLICT (code) DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE p.code = 'notification.read'
ON CONFLICT DO NOTHING;

-- ---------- ประเภทไฟล์แนบเพิ่มเติม
ALTER TABLE attachments DROP CONSTRAINT ck_attachments_category;
ALTER TABLE attachments ADD CONSTRAINT ck_attachments_category
    CHECK (category IN ('plan', 'site_photo', 'deed', 'permit', 'contract', 'invoice', 'receipt', 'certificate', 'other'));
