-- =====================================================================
-- V4: BOQ Template, BOQ, ใบเสนอราคา และการอนุมัติ (FR-04 ถึง FR-10)
-- =====================================================================

CREATE TABLE boq_templates (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name         varchar(255) NOT NULL,
    job_type     varchar(20),
    description  text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid REFERENCES users (id),
    deleted_at   timestamptz
);

CREATE TABLE boq_template_items (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id   uuid NOT NULL REFERENCES boq_templates (id) ON DELETE CASCADE,
    parent_id     uuid REFERENCES boq_template_items (id) ON DELETE CASCADE,
    level         smallint NOT NULL,
    sort_order    int      NOT NULL DEFAULT 0,
    description   varchar(500) NOT NULL,
    unit          varchar(30),
    quantity      numeric(14, 3) NOT NULL DEFAULT 0,
    material_id   uuid REFERENCES materials (id),
    labor_id      uuid REFERENCES labor_rates (id),
    equipment_id  uuid REFERENCES equipment_rates (id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_tpl_items_level CHECK (level BETWEEN 1 AND 3)
);
CREATE INDEX ix_tpl_items_template ON boq_template_items (template_id, sort_order);

CREATE TABLE boqs (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id          uuid NOT NULL REFERENCES leads (id),
    name             varchar(255) NOT NULL,
    option_label     varchar(100),
    factor_f_pct     numeric(5, 2)  NOT NULL DEFAULT 0,
    overhead_pct     numeric(5, 2)  NOT NULL DEFAULT 0,
    profit_pct       numeric(5, 2)  NOT NULL DEFAULT 0,
    contingency_pct  numeric(5, 2)  NOT NULL DEFAULT 0,
    discount_amount  numeric(14, 2) NOT NULL DEFAULT 0,
    vat_pct          numeric(4, 2)  NOT NULL DEFAULT 7.00,
    wht_pct          numeric(4, 2)  NOT NULL DEFAULT 0,
    subtotal_cost    numeric(14, 2) NOT NULL DEFAULT 0,
    subtotal_sell    numeric(14, 2) NOT NULL DEFAULT 0,
    grand_total      numeric(14, 2) NOT NULL DEFAULT 0,
    margin_pct       numeric(5, 2)  NOT NULL DEFAULT 0,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid REFERENCES users (id),
    deleted_at       timestamptz,
    CONSTRAINT ck_boqs_wht CHECK (wht_pct IN (0, 1, 3))
);
CREATE INDEX ix_boqs_lead ON boqs (lead_id) WHERE deleted_at IS NULL;

CREATE TABLE boq_items (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    boq_id              uuid NOT NULL REFERENCES boqs (id) ON DELETE CASCADE,
    parent_id           uuid REFERENCES boq_items (id) ON DELETE CASCADE,
    level               smallint NOT NULL,                 -- 1 หมวด / 2 งานย่อย / 3 รายการ
    sort_order          int      NOT NULL DEFAULT 0,
    description         varchar(500) NOT NULL,
    unit                varchar(30),
    quantity            numeric(14, 3) NOT NULL DEFAULT 0,
    material_id         uuid REFERENCES materials (id),
    labor_id            uuid REFERENCES labor_rates (id),
    equipment_id        uuid REFERENCES equipment_rates (id),
    -- snapshot ราคา ณ วันถอดแบบ: ราคากลางเปลี่ยนภายหลังไม่กระทบ BOQ นี้
    unit_material_cost  numeric(14, 2) NOT NULL DEFAULT 0,
    unit_material       numeric(14, 2) NOT NULL DEFAULT 0,
    unit_labor          numeric(14, 2) NOT NULL DEFAULT 0,
    unit_equipment      numeric(14, 2) NOT NULL DEFAULT 0,
    line_cost           numeric(14, 2) NOT NULL DEFAULT 0,
    line_sell           numeric(14, 2) NOT NULL DEFAULT 0,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_boq_items_level CHECK (level BETWEEN 1 AND 3)
);
CREATE INDEX ix_boq_items_boq ON boq_items (boq_id, sort_order);
CREATE INDEX ix_boq_items_parent ON boq_items (parent_id);

CREATE TABLE quotations (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_no               varchar(30) NOT NULL,             -- QT-2569-0001 (ใช้เลขเดิมทุก Revision)
    revision             int         NOT NULL DEFAULT 1,
    parent_quotation_id  uuid REFERENCES quotations (id),
    lead_id              uuid NOT NULL REFERENCES leads (id),
    customer_id          uuid NOT NULL REFERENCES customers (id),
    boq_id               uuid NOT NULL REFERENCES boqs (id),
    status               varchar(20) NOT NULL DEFAULT 'draft',
    issue_date           date,
    valid_until          date,
    display_mode         varchar(10) NOT NULL DEFAULT 'summary',
    payment_terms        jsonb,
    duration_days        int,
    warranty_terms       text,
    scope_in             text,
    scope_out            text,
    total_amount         numeric(14, 2) NOT NULL DEFAULT 0,
    public_token_hash    varchar(64) UNIQUE,               -- เก็บเฉพาะ hash ของลิงก์ลูกค้า
    pdf_key              varchar(500),
    signed_at            timestamptz,
    signature_key        varchar(500),
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid REFERENCES users (id),
    deleted_at           timestamptz,
    CONSTRAINT ux_quotations_doc_rev UNIQUE (doc_no, revision),
    CONSTRAINT ck_quotations_status  CHECK (status IN ('draft', 'pending_approval', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'superseded')),
    CONSTRAINT ck_quotations_display CHECK (display_mode IN ('summary', 'detailed'))
);
CREATE INDEX ix_quotations_lead   ON quotations (lead_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_quotations_status ON quotations (status) WHERE deleted_at IS NULL;

CREATE TABLE approvals (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type   varchar(50) NOT NULL,
    target_id     uuid        NOT NULL,
    reason        varchar(100) NOT NULL,                   -- เช่น discount_over_5pct
    status        varchar(20) NOT NULL DEFAULT 'pending',
    requested_by  uuid NOT NULL REFERENCES users (id),
    decided_by    uuid REFERENCES users (id),
    comment       text,
    decided_at    timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_approvals_status CHECK (status IN ('pending', 'approved', 'rejected'))
);
CREATE INDEX ix_approvals_target ON approvals (target_type, target_id);
CREATE INDEX ix_approvals_pending ON approvals (status) WHERE status = 'pending';

-- ตั้งค่าระบบ (เกณฑ์ส่วนลด, ข้อมูลบริษัทบน PDF ฯลฯ)
CREATE TABLE app_settings (
    key         varchar(100) PRIMARY KEY,
    value       jsonb        NOT NULL,
    updated_at  timestamptz  NOT NULL DEFAULT now(),
    updated_by  uuid REFERENCES users (id)
);
