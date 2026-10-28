-- Phase 3 review fixes: ผูกบิลเจ้าหนี้กับสัญญาจ้างช่วง, เงินได้ก่อน VAT ต่อบรรทัดใบสำคัญจ่าย (50 ทวิ), งวดเบิกค้างสถานะ

-- ---------------------------------------------------------------- บิล ↔ สัญญาจ้างช่วง (งวดเบิก + คืนเงินประกัน)
ALTER TABLE ap_bills ADD COLUMN subcontract_id uuid REFERENCES subcontracts (id);
CREATE INDEX ix_ap_subcontract ON ap_bills (subcontract_id) WHERE subcontract_id IS NOT NULL;

-- บิลจากงวดเบิก
UPDATE ap_bills b SET subcontract_id = c.subcontract_id
FROM subcontract_claims c
WHERE c.id = b.subcontract_claim_id AND b.subcontract_id IS NULL;

-- บิลคืนเงินประกัน (สร้างโดยระบบ หมายเหตุมีเลขที่สัญญา)
UPDATE ap_bills b SET subcontract_id = s.id
FROM subcontracts s
WHERE b.subcontract_claim_id IS NULL AND b.subcontract_id IS NULL AND b.category = 'subcontract'
  AND b.supplier_id = s.supplier_id
  AND b.notes LIKE 'คืนเงินประกันผลงานตามสัญญาจ้างช่วง ' || s.doc_no || '%';

-- บิลคืนเงินประกันที่ถูกยกเลิก/ลบไปแล้ว: คืนยอดเงินประกันที่ยังกันไว้
UPDATE subcontracts s SET retention_released = greatest(s.retention_released - x.amt, 0)
FROM (SELECT subcontract_id, sum(subtotal) amt FROM ap_bills
      WHERE subcontract_id IS NOT NULL AND subcontract_claim_id IS NULL
        AND (status = 'void' OR deleted_at IS NOT NULL)
      GROUP BY subcontract_id) x
WHERE x.subcontract_id = s.id;

-- ---------------------------------------------------------------- งวดเบิกที่บิลถูกยกเลิก (ค้าง approved ไม่มีบิล) → กลับเป็นร่าง เพื่อตรวจรับ/ตั้งหนี้ใหม่
UPDATE subcontract_claims SET status = 'draft', approved_by = NULL, approved_at = NULL
WHERE status = 'approved' AND ap_bill_id IS NULL;

-- ---------------------------------------------------------------- เงินได้ (ก่อน VAT) ของแต่ละบรรทัดใบสำคัญจ่าย ใช้ใน 50 ทวิ / ภ.ง.ด.
ALTER TABLE payment_voucher_lines ADD COLUMN income_amount numeric(14, 2) NOT NULL DEFAULT 0;

UPDATE payment_voucher_lines l
SET income_amount = round(l.amount * b.subtotal / (b.total_amount - b.retention_amount), 2)
FROM ap_bills b
WHERE b.id = l.bill_id AND b.wht_pct > 0 AND (b.total_amount - b.retention_amount) <> 0;
