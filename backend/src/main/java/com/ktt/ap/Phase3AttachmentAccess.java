package com.ktt.ap;

import com.ktt.attachment.AttachmentAccess;
import com.ktt.common.ApiException;
import com.ktt.purchase.PurchaseOrder;
import com.ktt.purchase.Supplier;
import com.ktt.security.CurrentUser;
import com.ktt.security.Perm;
import com.ktt.subcontract.Subcontract;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.util.UUID;

/** ไฟล์แนบของเอกสารจัดซื้อ/เจ้าหนี้ (ใบเสนอราคาผู้ขาย ใบกำกับภาษีซื้อ ใบส่งของ สัญญาจ้างช่วง) */
public abstract class Phase3AttachmentAccess implements AttachmentAccess {

    @Inject
    CurrentUser currentUser;

    protected abstract boolean exists(UUID id);

    protected abstract String readPerm();

    protected abstract String writePerm();

    @Override
    public void check(UUID ownerId, boolean write) {
        if (!currentUser.can(write ? writePerm() : readPerm())) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์จัดการไฟล์ของเอกสารนี้");
        }
        if (!exists(ownerId)) {
            throw ApiException.notFound("ไม่พบเอกสาร");
        }
    }

    @ApplicationScoped
    public static class SupplierFiles extends Phase3AttachmentAccess {
        public String ownerType() { return "supplier"; }
        protected boolean exists(UUID id) { return Supplier.findById(id) != null; }
        protected String readPerm() { return Perm.PURCHASE_READ; }
        protected String writePerm() { return Perm.PURCHASE_WRITE; }
    }

    @ApplicationScoped
    public static class PoFiles extends Phase3AttachmentAccess {
        public String ownerType() { return "purchase_order"; }
        protected boolean exists(UUID id) { return PurchaseOrder.findById(id) != null; }
        protected String readPerm() { return Perm.PURCHASE_READ; }
        protected String writePerm() { return Perm.PURCHASE_WRITE; }
    }

    @ApplicationScoped
    public static class BillFiles extends Phase3AttachmentAccess {
        public String ownerType() { return "ap_bill"; }
        protected boolean exists(UUID id) { return ApBill.findById(id) != null; }
        protected String readPerm() { return Perm.AP_READ; }
        protected String writePerm() { return Perm.AP_WRITE; }
    }

    @ApplicationScoped
    public static class SubcontractFiles extends Phase3AttachmentAccess {
        public String ownerType() { return "subcontract"; }
        protected boolean exists(UUID id) { return Subcontract.findById(id) != null; }
        protected String readPerm() { return Perm.SUBCONTRACT_READ; }
        protected String writePerm() { return Perm.SUBCONTRACT_WRITE; }
    }
}
