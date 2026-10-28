-- Phase 2 review fixes: สัญญา / การเงินฝั่งขาย

-- 1) สัญญาที่ลบแล้ว (soft delete) ไม่ควรกันการสร้างสัญญาใหม่ให้โครงการเดิม
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_project_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS ux_contracts_project ON contracts (project_id) WHERE deleted_at IS NULL;

-- 2) ใบเสร็จรับคืนเงินประกันผลงาน (kind = 'retention')
ALTER TABLE sales_docs DROP CONSTRAINT IF EXISTS ck_sales_docs_kind;
ALTER TABLE sales_docs ADD CONSTRAINT ck_sales_docs_kind CHECK (kind IN ('normal', 'advance', 'milestone', 'retention'));

-- 3) ใบลดหนี้ที่อ้างอิงใบแจ้งหนี้/ใบกำกับภาษี ลดยอดค้างของใบแจ้งหนี้
--    settled_amount ของใบลดหนี้ = ยอดที่นำไปตัดยอดค้างของใบแจ้งหนี้ (ใช้คืนยอดเมื่อยกเลิกใบลดหนี้)
--    ย้อนปรับข้อมูลเดิม: ใบลดหนี้ที่ออกแล้วและยังไม่เคยตัดยอด
DO $$
DECLARE
    cn record;
    inv record;
    applied numeric(14, 2);
BEGIN
    FOR cn IN
        SELECT c.id, c.ref_doc_id, c.total_amount
        FROM sales_docs c JOIN sales_docs i ON i.id = c.ref_doc_id
        WHERE c.doc_type = 'credit_note' AND c.status NOT IN ('draft', 'void') AND c.deleted_at IS NULL
          AND c.settled_amount = 0 AND i.doc_type = 'invoice_tax' AND i.status IN ('issued', 'partial')
        ORDER BY c.doc_date, c.created_at
    LOOP
        SELECT id, total_amount, settled_amount INTO inv FROM sales_docs WHERE id = cn.ref_doc_id;
        applied := least(cn.total_amount, greatest(inv.total_amount - inv.settled_amount, 0));
        IF applied > 0 THEN
            UPDATE sales_docs SET settled_amount = applied WHERE id = cn.id;
            UPDATE sales_docs
            SET settled_amount = settled_amount + applied,
                status = CASE WHEN settled_amount + applied >= total_amount THEN 'paid' ELSE 'partial' END
            WHERE id = inv.id;
        END IF;
    END LOOP;
END $$;
