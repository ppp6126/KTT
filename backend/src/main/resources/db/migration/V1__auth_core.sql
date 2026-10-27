-- =====================================================================
-- V1: ผู้ใช้ บทบาท สิทธิ์ session 2FA audit และเลขที่เอกสาร
-- ทุกตารางหลักมี id (UUID), created_at, updated_at, created_by, deleted_at
-- =====================================================================

CREATE TABLE roles (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code         varchar(50)  NOT NULL,
    name         varchar(100) NOT NULL,
    description  text,
    is_system    boolean      NOT NULL DEFAULT false,   -- บทบาทตั้งต้น ลบไม่ได้
    created_at   timestamptz  NOT NULL DEFAULT now(),
    updated_at   timestamptz  NOT NULL DEFAULT now(),
    created_by   uuid,
    deleted_at   timestamptz
);
CREATE UNIQUE INDEX ux_roles_code ON roles (code) WHERE deleted_at IS NULL;

-- แคตตาล็อกสิทธิ์ (ระบบเป็นผู้กำหนด ไม่ soft delete)
CREATE TABLE permissions (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code         varchar(100) NOT NULL UNIQUE,          -- เช่น quotation.approve
    module       varchar(50)  NOT NULL,
    action       varchar(50)  NOT NULL,
    description  varchar(255),
    sort_order   int          NOT NULL DEFAULT 0
);

CREATE TABLE role_permissions (
    role_id       uuid NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    permission_id uuid NOT NULL REFERENCES permissions (id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email                varchar(255) NOT NULL,
    name                 varchar(150) NOT NULL,
    phone                varchar(30),
    password_hash        varchar(255),                 -- null ได้ถ้าใช้ SSO อย่างเดียว (Phase 4)
    role_id              uuid NOT NULL REFERENCES roles (id),
    is_active            boolean      NOT NULL DEFAULT true,
    must_change_password boolean      NOT NULL DEFAULT false,
    password_changed_at  timestamptz,
    totp_secret          varchar(255),                 -- เข้ารหัส AES-GCM แล้ว
    mfa_enabled          boolean      NOT NULL DEFAULT false,
    totp_last_step       bigint       NOT NULL DEFAULT 0, -- กันใช้รหัส 6 หลักเดิมซ้ำ
    failed_login_count   int          NOT NULL DEFAULT 0,
    locked_until         timestamptz,
    last_login_at        timestamptz,
    created_at           timestamptz  NOT NULL DEFAULT now(),
    updated_at           timestamptz  NOT NULL DEFAULT now(),
    created_by           uuid,
    deleted_at           timestamptz
);
CREATE UNIQUE INDEX ux_users_email ON users (lower(email)) WHERE deleted_at IS NULL;
CREATE INDEX ix_users_role ON users (role_id);

-- Refresh token หนึ่งแถวต่อหนึ่ง session (อุปกรณ์) หมุน token ทุกครั้งที่ refresh
CREATE TABLE user_sessions (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    refresh_token_hash   varchar(64) NOT NULL UNIQUE,  -- SHA-256 hex
    prev_token_hash      varchar(64),                  -- ใช้ตรวจการนำ token เก่ามาใช้ซ้ำ
    rotated_at           timestamptz,
    idle_expires_at      timestamptz NOT NULL,
    absolute_expires_at  timestamptz NOT NULL,
    last_used_at         timestamptz NOT NULL DEFAULT now(),
    ip                   varchar(45),
    user_agent           varchar(500),
    revoked_at           timestamptz,
    revoke_reason        varchar(50),
    created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_sessions_user ON user_sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX ix_sessions_prev ON user_sessions (prev_token_hash);

-- ขั้นตอนที่ 2 ของการ login เมื่อเปิด 2FA
CREATE TABLE mfa_challenges (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash   varchar(64) NOT NULL UNIQUE,
    expires_at   timestamptz NOT NULL,
    attempts     int         NOT NULL DEFAULT 0,
    consumed_at  timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mfa_recovery_codes (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    code_hash  varchar(64) NOT NULL,
    used_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_recovery_user ON mfa_recovery_codes (user_id);

CREATE TABLE password_reset_tokens (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash  varchar(64) NOT NULL UNIQUE,
    expires_at  timestamptz NOT NULL,
    used_at     timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- เผื่อ Google / LINE Login (Phase 4)
CREATE TABLE user_identities (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    provider    varchar(30)  NOT NULL,                 -- google / line
    subject     varchar(255) NOT NULL,
    email       varchar(255),
    created_at  timestamptz  NOT NULL DEFAULT now(),
    UNIQUE (provider, subject)
);

-- ไม่ soft delete
CREATE TABLE audit_logs (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid REFERENCES users (id),
    entity_type  varchar(50) NOT NULL,
    entity_id    uuid,
    action       varchar(30) NOT NULL,
    before       jsonb,
    after        jsonb,
    ip           varchar(45),
    user_agent   varchar(500),
    created_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_audit_action CHECK (action IN (
        'create', 'update', 'delete', 'approve', 'reject', 'export',
        'login', 'login_failed', 'logout', 'locked', 'mfa_enabled', 'mfa_disabled',
        'password_changed', 'password_reset', 'session_revoked'))
);
CREATE INDEX ix_audit_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX ix_audit_user ON audit_logs (user_id, created_at DESC);
CREATE INDEX ix_audit_created ON audit_logs (created_at DESC);

-- ออกเลขที่เอกสาร (SELECT ... FOR UPDATE ป้องกันเลขซ้ำ)
CREATE TABLE doc_sequences (
    prefix   varchar(10) NOT NULL,
    year     int         NOT NULL,
    last_no  int         NOT NULL DEFAULT 0,
    PRIMARY KEY (prefix, year)
);
