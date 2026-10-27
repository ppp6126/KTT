-- =====================================================================
-- V5: สิทธิ์ตั้งต้นและบทบาทระบบ (ผู้ใช้ admin คนแรกสร้างตอนแอปเริ่มทำงาน ดู BootstrapAdmin)
-- =====================================================================

INSERT INTO permissions (code, module, action, description, sort_order) VALUES
    ('user.read',         'user',      'read',      'ดูรายชื่อผู้ใช้', 10),
    ('user.manage',       'user',      'manage',    'เพิ่ม/แก้ไข/ปิดผู้ใช้ รีเซ็ตรหัสผ่านและ 2FA', 11),
    ('role.manage',       'role',      'manage',    'จัดการบทบาทและสิทธิ์', 12),
    ('audit.read',        'audit',     'read',      'ดู Audit Log', 13),
    ('settings.manage',   'settings',  'manage',    'ตั้งค่าระบบ เกณฑ์ส่วนลด ข้อมูลบริษัท', 14),

    ('customer.read',     'customer',  'read',      'ดูลูกค้า', 20),
    ('customer.write',    'customer',  'write',     'เพิ่ม/แก้ไขลูกค้า', 21),
    ('customer.delete',   'customer',  'delete',    'ลบลูกค้า', 22),

    ('lead.read',         'lead',      'read',      'ดูลีดที่ตนรับผิดชอบ', 30),
    ('lead.read_all',     'lead',      'read_all',  'ดูลีดของทุกคน', 31),
    ('lead.write',        'lead',      'write',     'เพิ่ม/แก้ไข/ย้ายสถานะลีด', 32),
    ('lead.delete',       'lead',      'delete',    'ลบลีด', 33),

    ('pricing.read',      'pricing',   'read',      'ดูฐานราคากลาง (ราคาขาย)', 40),
    ('pricing.write',     'pricing',   'write',     'แก้ไขฐานราคากลาง', 41),
    ('pricing.import',    'pricing',   'import',    'นำเข้า/ส่งออก Excel', 42),

    ('boq.read',          'boq',       'read',      'ดู BOQ', 50),
    ('boq.write',         'boq',       'write',     'สร้าง/แก้ไข BOQ และ Template', 51),

    ('quotation.read',    'quotation', 'read',      'ดูใบเสนอราคา', 60),
    ('quotation.write',   'quotation', 'write',     'สร้าง/แก้ไขใบเสนอราคา และ Revision', 61),
    ('quotation.send',    'quotation', 'send',      'ส่งใบเสนอราคาให้ลูกค้า', 62),
    ('quotation.approve', 'quotation', 'approve',   'อนุมัติใบเสนอราคา/ส่วนลดเกินเกณฑ์', 63),
    ('quotation.export',  'quotation', 'export',    'Export PDF', 64),

    ('cost.view',         'cost',      'view',      'เห็นต้นทุน กำไร Margin (ถ้าไม่มี API จะไม่ส่งฟิลด์เหล่านี้)', 70),

    ('attachment.read',   'attachment','read',      'ดาวน์โหลดไฟล์แนบ', 80),
    ('attachment.write',  'attachment','write',     'อัปโหลด/ลบไฟล์แนบ', 81);

INSERT INTO roles (code, name, description, is_system) VALUES
    ('owner',     'เจ้าของ/ผู้บริหาร',  'เห็นทุกอย่าง อนุมัติราคา/ส่วนลด ดูกำไร', true),
    ('admin',     'ผู้ดูแลระบบ',        'จัดการผู้ใช้ สิทธิ์ ตั้งค่า', true),
    ('sales',     'ฝ่ายขาย',           'CRM และใบเสนอราคา (ไม่เห็นต้นทุน)', true),
    ('estimator', 'วิศวกร/ประมาณราคา', 'BOQ ฐานราคา', true);

-- owner: ทุกสิทธิ์
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.code = 'owner';

-- admin: งานระบบ + อ่านข้อมูลธุรกิจ (ไม่เห็นต้นทุน)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
    'user.read', 'user.manage', 'role.manage', 'audit.read', 'settings.manage',
    'customer.read', 'lead.read', 'lead.read_all', 'pricing.read', 'boq.read', 'quotation.read', 'attachment.read')
WHERE r.code = 'admin';

-- sales: CRM + ใบเสนอราคา
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
    'customer.read', 'customer.write', 'lead.read', 'lead.write',
    'pricing.read', 'boq.read', 'quotation.read', 'quotation.write', 'quotation.send', 'quotation.export',
    'attachment.read', 'attachment.write')
WHERE r.code = 'sales';

-- estimator: ฐานราคา + BOQ + เห็นต้นทุน
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
    'customer.read', 'lead.read', 'lead.read_all',
    'pricing.read', 'pricing.write', 'pricing.import', 'boq.read', 'boq.write', 'cost.view',
    'quotation.read', 'attachment.read', 'attachment.write')
WHERE r.code = 'estimator';

INSERT INTO app_settings (key, value) VALUES
    ('quotation.discount_approval_threshold_pct', '5'),
    ('quotation.default_validity_days', '30'),
    ('document.year_format', '"BE"'),           -- BE = พ.ศ., CE = ค.ศ.
    ('auth.mfa_required_roles', '["owner", "admin"]');
