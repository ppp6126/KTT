package com.ktt.settings;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ktt.audit.AuditService;
import com.ktt.common.ApiException;
import com.ktt.security.CurrentUser;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.Map;

/** ข้อมูลบริษัท (หัวกระดาษเอกสาร) และค่าตั้งต้นของใบเสนอราคา */
@ApplicationScoped
public class SettingsService {

    public static final String COMPANY = "company.profile";

    @Inject
    AppSettings settings;

    @Inject
    ObjectMapper mapper;

    @Inject
    AuditService audit;

    @Inject
    CurrentUser currentUser;

    public record CompanyProfile(
            @NotBlank(message = "กรุณากรอกชื่อบริษัท") @Size(max = 255) String nameTh,
            @Size(max = 255) String nameEn,
            @Pattern(regexp = "^$|\\d{13}", message = "เลขผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก") String taxId,
            @Pattern(regexp = "^$|\\d{5}", message = "สาขาต้องเป็นตัวเลข 5 หลัก") String branchNo,
            @Size(max = 500) String address,
            @Size(max = 100) String phone,
            @Size(max = 255) String email,
            @Size(max = 150) String signerName,
            @Size(max = 150) String signerTitle,
            @Size(max = 100) String bankName,
            @Size(max = 100) String bankBranch,
            @Size(max = 150) String bankAccountName,
            @Size(max = 50) String bankAccountNo) {
    }

    public record QuotationSettings(
            @NotBlank @Size(max = 10) @Pattern(regexp = "[A-Za-z0-9ก-๙-]+", message = "คำนำหน้าเลขที่ใช้ได้เฉพาะตัวอักษรและตัวเลข") String docPrefix,
            @Min(1) @Max(15) int discountApprovalThresholdPct,
            @Min(1) @Max(365) int defaultValidityDays,
            @Min(0) @Max(100) BigDecimal defaultOverheadPct,
            boolean defaultVatEnabled,
            @Pattern(regexp = "none|down_1|down_10|down_100") String defaultRounding,
            @Size(max = 255) String defaultPaymentCondition,
            @Size(max = 2000) String defaultWarranty,
            @Min(0) @Max(30) int expiryNoticeDays) {
    }

    @Transactional
    public CompanyProfile company() {
        JsonNode node = settings.get(COMPANY);
        if (node == null) {
            return new CompanyProfile("", "", "", "00000", "", "", "", "", "", "", "", "", "");
        }
        return mapper.convertValue(node, CompanyProfile.class);
    }

    @Transactional
    public CompanyProfile updateCompany(CompanyProfile p) {
        CompanyProfile before = company();
        settings.setValue(COMPANY, p, currentUser.id());
        var d = audit.diff(before, p);
        audit.log("settings", null, AuditService.ACTION_UPDATE, d[0], d[1]);
        return p;
    }

    @Transactional
    public QuotationSettings quotation() {
        return new QuotationSettings(
                settings.getString("quotation.doc_prefix", "INV"),
                settings.getInt(AppSettings.DISCOUNT_APPROVAL_THRESHOLD_PCT, 5),
                settings.getInt(AppSettings.DEFAULT_VALIDITY_DAYS, 30),
                settings.getDecimal("quotation.default_overhead_pct", BigDecimal.ZERO),
                settings.getBool("quotation.default_vat_enabled", true),
                settings.getString("quotation.default_rounding", "none"),
                settings.getString("quotation.default_payment_condition", ""),
                settings.getString("quotation.default_warranty", ""),
                settings.getInt("quotation.expiry_notice_days", 3));
    }

    @Transactional
    public QuotationSettings updateQuotation(QuotationSettings q) {
        if (q.discountApprovalThresholdPct() < 1 || q.discountApprovalThresholdPct() > 15) {
            throw ApiException.badRequest("invalid_threshold", "เกณฑ์ส่วนลดต้องอยู่ระหว่าง 1% ถึง 15%");
        }
        QuotationSettings before = quotation();
        var uid = currentUser.id();
        settings.setValue("quotation.doc_prefix", q.docPrefix().trim(), uid);
        settings.setValue(AppSettings.DISCOUNT_APPROVAL_THRESHOLD_PCT, q.discountApprovalThresholdPct(), uid);
        settings.setValue(AppSettings.DEFAULT_VALIDITY_DAYS, q.defaultValidityDays(), uid);
        settings.setValue("quotation.default_overhead_pct", q.defaultOverheadPct() == null ? BigDecimal.ZERO : q.defaultOverheadPct(), uid);
        settings.setValue("quotation.default_vat_enabled", q.defaultVatEnabled(), uid);
        settings.setValue("quotation.default_rounding", q.defaultRounding() == null ? "none" : q.defaultRounding(), uid);
        settings.setValue("quotation.default_payment_condition", nz(q.defaultPaymentCondition()), uid);
        settings.setValue("quotation.default_warranty", nz(q.defaultWarranty()), uid);
        settings.setValue("quotation.expiry_notice_days", q.expiryNoticeDays(), uid);
        var d = audit.diff(before, q);
        audit.log("settings", null, AuditService.ACTION_UPDATE, d[0], d[1]);
        return quotation();
    }

    /** ใช้ในหน้าพิมพ์เอกสาร: ข้อมูลบริษัท + มีโลโก้/ลายเซ็นหรือไม่ */
    public Map<String, Object> printHeader(boolean hasLogo, boolean hasSignature) {
        return Map.of("company", company(), "hasLogo", hasLogo, "hasSignature", hasSignature);
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }
}
