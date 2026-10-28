-- =====================================================================
-- V10: แก้จากการตรวจโค้ด Phase 1
-- BOQ หัก ณ ที่จ่ายเลือกได้ 0/1/2/3/5% (เดิม constraint รับแค่ 0/1/3 จึงบันทึก 2% หรือ 5% ไม่ได้)
-- =====================================================================
ALTER TABLE boqs DROP CONSTRAINT IF EXISTS ck_boqs_wht;
ALTER TABLE boqs ADD CONSTRAINT ck_boqs_wht CHECK (wht_pct IN (0, 1, 2, 3, 5));
