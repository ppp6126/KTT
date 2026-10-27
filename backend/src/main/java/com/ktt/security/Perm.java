package com.ktt.security;

/**
 * รหัสสิทธิ์ (ต้องตรงกับตาราง permissions ใน V5__seed_roles_permissions.sql).
 * สิทธิ์ถูกใส่ใน claim "groups" ของ JWT จึงใช้กับ {@code @RolesAllowed(Perm.X)} ได้โดยตรง
 */
public final class Perm {

    private Perm() {
    }

    public static final String USER_READ = "user.read";
    public static final String USER_MANAGE = "user.manage";
    public static final String ROLE_MANAGE = "role.manage";
    public static final String AUDIT_READ = "audit.read";
    public static final String SETTINGS_MANAGE = "settings.manage";

    public static final String CUSTOMER_READ = "customer.read";
    public static final String CUSTOMER_WRITE = "customer.write";
    public static final String CUSTOMER_DELETE = "customer.delete";

    public static final String LEAD_READ = "lead.read";
    public static final String LEAD_READ_ALL = "lead.read_all";
    public static final String LEAD_WRITE = "lead.write";
    public static final String LEAD_DELETE = "lead.delete";

    public static final String PRICING_READ = "pricing.read";
    public static final String PRICING_WRITE = "pricing.write";
    public static final String PRICING_IMPORT = "pricing.import";

    public static final String BOQ_READ = "boq.read";
    public static final String BOQ_WRITE = "boq.write";

    public static final String QUOTATION_READ = "quotation.read";
    public static final String QUOTATION_WRITE = "quotation.write";
    public static final String QUOTATION_SEND = "quotation.send";
    public static final String QUOTATION_APPROVE = "quotation.approve";
    public static final String QUOTATION_EXPORT = "quotation.export";

    /** เห็นต้นทุน/กำไร: ถ้าไม่มี API ต้องไม่ส่งฟิลด์เหล่านี้ออกไปเลย */
    public static final String COST_VIEW = "cost.view";

    public static final String ATTACHMENT_READ = "attachment.read";
    public static final String ATTACHMENT_WRITE = "attachment.write";

    public static final String PROJECT_READ = "project.read";
    public static final String PROJECT_READ_ALL = "project.read_all";
    public static final String PROJECT_WRITE = "project.write";
    public static final String SITE_REPORT = "site.report";

    public static final String CONTRACT_READ = "contract.read";
    public static final String CONTRACT_WRITE = "contract.write";
    public static final String CONTRACT_APPROVE = "contract.approve";

    public static final String FINANCE_READ = "finance.read";
    public static final String FINANCE_WRITE = "finance.write";
    public static final String FINANCE_VOID = "finance.void";

    public static final String NOTIFICATION_READ = "notification.read";

    public static final String PURCHASE_REQUEST = "purchase.request";
    public static final String PURCHASE_READ = "purchase.read";
    public static final String PURCHASE_WRITE = "purchase.write";
    public static final String PURCHASE_APPROVE = "purchase.approve";
    public static final String STOCK_READ = "stock.read";
    public static final String STOCK_WRITE = "stock.write";
    public static final String SUBCONTRACT_READ = "subcontract.read";
    public static final String SUBCONTRACT_WRITE = "subcontract.write";
    public static final String LABOR_READ = "labor.read";
    public static final String LABOR_WRITE = "labor.write";
    public static final String AP_READ = "ap.read";
    public static final String AP_WRITE = "ap.write";
    public static final String AP_APPROVE = "ap.approve";
    public static final String TAX_REPORT = "tax.report";
}
