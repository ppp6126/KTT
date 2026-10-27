-- =====================================================================
-- V3: ฐานราคากลาง วัสดุ ค่าแรง เครื่องจักร ประวัติราคา (FR-03)
-- เงินใช้ numeric เสมอ
-- =====================================================================

CREATE TABLE material_categories (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        varchar(150) NOT NULL,
    parent_id   uuid REFERENCES material_categories (id),
    sort_order  int NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    created_by  uuid REFERENCES users (id),
    deleted_at  timestamptz
);

CREATE TABLE materials (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code              varchar(50)  NOT NULL,
    name              varchar(255) NOT NULL,
    unit              varchar(30)  NOT NULL,
    category_id       uuid REFERENCES material_categories (id),
    cost_price        numeric(14, 2) NOT NULL DEFAULT 0,
    sell_price        numeric(14, 2) NOT NULL DEFAULT 0,
    supplier_name     varchar(255),
    price_updated_at  date,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid REFERENCES users (id),
    deleted_at        timestamptz
);
CREATE UNIQUE INDEX ux_materials_code ON materials (code) WHERE deleted_at IS NULL;
CREATE INDEX ix_materials_name ON materials (lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE labor_rates (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code        varchar(50)  NOT NULL,
    name        varchar(255) NOT NULL,
    trade       varchar(20)  NOT NULL,
    unit        varchar(30)  NOT NULL,
    rate        numeric(14, 2) NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    created_by  uuid REFERENCES users (id),
    deleted_at  timestamptz,
    CONSTRAINT ck_labor_trade CHECK (trade IN ('mason', 'steel', 'electric', 'plumbing', 'paint', 'tile', 'carpentry', 'other'))
);
CREATE UNIQUE INDEX ux_labor_code ON labor_rates (code) WHERE deleted_at IS NULL;

CREATE TABLE equipment_rates (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code        varchar(50)  NOT NULL,
    name        varchar(255) NOT NULL,
    unit        varchar(30)  NOT NULL,
    rate        numeric(14, 2) NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    created_by  uuid REFERENCES users (id),
    deleted_at  timestamptz
);
CREATE UNIQUE INDEX ux_equipment_code ON equipment_rates (code) WHERE deleted_at IS NULL;

CREATE TABLE price_history (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_type   varchar(20) NOT NULL,
    item_id     uuid        NOT NULL,
    price_field varchar(20) NOT NULL DEFAULT 'rate',   -- cost_price / sell_price / rate
    old_price   numeric(14, 2),
    new_price   numeric(14, 2) NOT NULL,
    changed_at  timestamptz NOT NULL DEFAULT now(),
    changed_by  uuid REFERENCES users (id),
    CONSTRAINT ck_price_history_type CHECK (item_type IN ('material', 'labor', 'equipment'))
);
CREATE INDEX ix_price_history_item ON price_history (item_type, item_id, changed_at DESC);
