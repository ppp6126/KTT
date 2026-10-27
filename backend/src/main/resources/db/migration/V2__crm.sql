-- =====================================================================
-- V2: CRM ลูกค้า ผู้ติดต่อ ลีด กิจกรรม และไฟล์แนบ (FR-01, FR-02)
-- =====================================================================

CREATE TABLE customers (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type             varchar(20)  NOT NULL,
    name             varchar(255) NOT NULL,
    tax_id           varchar(13),
    branch_no        varchar(5)   DEFAULT '00000',       -- 00000 = สำนักงานใหญ่
    phone            varchar(30),
    email            varchar(255),
    line_id          varchar(100),
    billing_address  text,
    source           varchar(20)  NOT NULL DEFAULT 'other',
    note             text,
    pdpa_consent_at  timestamptz,                         -- PDPA: เวลาที่ลูกค้าให้ความยินยอม
    created_at       timestamptz  NOT NULL DEFAULT now(),
    updated_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid REFERENCES users (id),
    deleted_at       timestamptz,
    CONSTRAINT ck_customers_type   CHECK (type IN ('person', 'company')),
    CONSTRAINT ck_customers_source CHECK (source IN ('facebook', 'referral', 'google', 'other')),
    CONSTRAINT ck_customers_tax_id CHECK (tax_id IS NULL OR tax_id ~ '^[0-9]{13}$')
);
CREATE INDEX ix_customers_name ON customers (lower(name)) WHERE deleted_at IS NULL;
CREATE INDEX ix_customers_tax  ON customers (tax_id) WHERE deleted_at IS NULL;

CREATE TABLE contacts (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id  uuid NOT NULL REFERENCES customers (id),
    name         varchar(150) NOT NULL,
    position     varchar(100),
    phone        varchar(30),
    email        varchar(255),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid REFERENCES users (id),
    deleted_at   timestamptz
);
CREATE INDEX ix_contacts_customer ON contacts (customer_id) WHERE deleted_at IS NULL;

CREATE TABLE leads (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id       uuid NOT NULL REFERENCES customers (id),
    title             varchar(255) NOT NULL,
    job_type          varchar(20)  NOT NULL,
    site_address      text,
    budget_est        numeric(14, 2),
    status            varchar(20)  NOT NULL DEFAULT 'new',
    lost_reason       text,
    owner_id          uuid REFERENCES users (id),
    next_followup_at  timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid REFERENCES users (id),
    deleted_at        timestamptz,
    CONSTRAINT ck_leads_job_type CHECK (job_type IN ('new_house', 'extension', 'renovation', 'interior', 'mep',
                                                     'landscape', 'structure', 'roof', 'repair', 'subcontract')),
    CONSTRAINT ck_leads_status   CHECK (status IN ('new', 'site_visit', 'estimating', 'quoted', 'negotiating', 'won', 'lost'))
);
CREATE INDEX ix_leads_customer ON leads (customer_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_leads_status   ON leads (status) WHERE deleted_at IS NULL;
CREATE INDEX ix_leads_owner    ON leads (owner_id) WHERE deleted_at IS NULL;

CREATE TABLE lead_activities (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id      uuid NOT NULL REFERENCES leads (id),
    type         varchar(20) NOT NULL,
    note         text,
    occurred_at  timestamptz NOT NULL DEFAULT now(),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid REFERENCES users (id),
    deleted_at   timestamptz,
    CONSTRAINT ck_lead_activities_type CHECK (type IN ('call', 'visit', 'note', 'meeting', 'status_change'))
);
CREATE INDEX ix_lead_activities_lead ON lead_activities (lead_id, occurred_at DESC);

-- ใช้ร่วมทุกโมดูล (polymorphic: owner_type + owner_id)
CREATE TABLE attachments (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_type  varchar(50)  NOT NULL,
    owner_id    uuid         NOT NULL,
    file_name   varchar(255) NOT NULL,
    file_key    varchar(500) NOT NULL,
    mime        varchar(100) NOT NULL,
    category    varchar(20)  NOT NULL DEFAULT 'other',
    size_bytes  bigint       NOT NULL,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now(),
    created_by  uuid REFERENCES users (id),
    deleted_at  timestamptz,
    CONSTRAINT ck_attachments_category CHECK (category IN ('plan', 'site_photo', 'deed', 'permit', 'other'))
);
CREATE INDEX ix_attachments_owner ON attachments (owner_type, owner_id) WHERE deleted_at IS NULL;
