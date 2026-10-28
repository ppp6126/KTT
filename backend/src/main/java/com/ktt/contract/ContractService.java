package com.ktt.contract;

import com.ktt.audit.AuditService;
import com.ktt.common.ApiException;
import com.ktt.common.Money;
import com.ktt.common.PageResult;
import com.ktt.common.SqlValues;
import com.ktt.common.UserNames;
import com.ktt.contract.ContractDtos.ContractDto;
import com.ktt.contract.ContractDtos.ContractRow;
import com.ktt.contract.ContractDtos.CreateRequest;
import com.ktt.contract.ContractDtos.Financials;
import com.ktt.contract.ContractDtos.FromQuotationRequest;
import com.ktt.contract.ContractDtos.MilestoneDto;
import com.ktt.contract.ContractDtos.MilestoneInput;
import com.ktt.contract.ContractDtos.UpdateRequest;
import com.ktt.contract.ContractDtos.VoRow;
import com.ktt.customer.Customer;
import com.ktt.docnum.DocNumberService;
import com.ktt.project.Project;
import com.ktt.project.ProjectService;
import com.ktt.quotation.Quotation;
import com.ktt.security.CurrentUser;
import com.ktt.security.Perm;
import io.quarkus.hibernate.orm.panache.PanacheQuery;
import io.quarkus.panache.common.Page;
import io.quarkus.panache.common.Parameters;
import io.quarkus.panache.common.Sort;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * สัญญาและงวดงาน
 * <pre>
 * ใบเสนอราคา (accepted) ──แปลง──► โครงการ + สัญญา (draft) ──เปิดใช้──► active ──► completed / terminated
 * </pre>
 * มูลค่าสัญญาเก็บแบบก่อน VAT; มูลค่าปรับปรุง = สัญญา + VO ที่อนุมัติ; งวดงานต้องรวมได้ 100% ก่อนเปิดใช้สัญญา
 */
@ApplicationScoped
public class ContractService {

    private static final Set<Integer> WHT = Set.of(0, 1, 2, 3, 5);
    private static final BigDecimal TOLERANCE = new BigDecimal("0.01");

    @Inject
    CurrentUser currentUser;

    @Inject
    AuditService audit;

    @Inject
    DocNumberService docNumbers;

    @Inject
    ProjectService projects;

    @Inject
    EntityManager em;

    /** ใช้ออกใบเสร็จรับคืนเงินประกัน (โหลดแบบ lazy เพราะ SalesDocService ก็ใช้ ContractService) */
    @Inject
    Instance<com.ktt.finance.SalesDocService> salesDocs;

    // ================================================================= access

    @Transactional(Transactional.TxType.MANDATORY)
    public Contract requireVisible(UUID id) {
        Contract c = id == null ? null : Contract.findById(id);
        if (c == null || !currentUser.can(Perm.CONTRACT_READ) && !currentUser.can(Perm.FINANCE_READ)) {
            throw ApiException.notFound("ไม่พบสัญญา");
        }
        Project p = Project.findById(c.projectId);
        if (p == null || !projects.canSee(p)) {
            throw ApiException.notFound("ไม่พบสัญญา");
        }
        return c;
    }

    @Transactional(Transactional.TxType.MANDATORY)
    public Contract requireWritable(UUID id) {
        if (!currentUser.can(Perm.CONTRACT_WRITE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์แก้ไขสัญญา");
        }
        return requireVisible(id);
    }

    // ================================================================= query

    @Transactional
    public PageResult<ContractRow> list(String q, String status, int page, int size) {
        StringBuilder w = new StringBuilder("1 = 1");
        Parameters p = new Parameters();
        projects.scope(w, p, "projectId");
        if (q != null && !q.isBlank()) {
            w.append(" and (lower(docNo) like :q or lower(customerName) like :q or lower(title) like :q)");
            p.and("q", "%" + q.trim().toLowerCase() + "%");
        }
        if (status != null && !status.isBlank()) {
            w.append(" and status = :status");
            p.and("status", status);
        }
        PanacheQuery<Contract> query = Contract.find(w.toString(), Sort.descending("contractDate").and("docNo", Sort.Direction.Descending), p);
        long total = query.count();
        List<ContractRow> rows = new ArrayList<>();
        for (Contract c : query.page(Page.of(page, size)).list()) {
            Project pr = Project.findById(c.projectId);
            Financials f = financials(c);
            rows.add(new ContractRow(c.id, c.docNo, c.projectId, pr == null ? null : pr.code, pr == null ? null : pr.name,
                    c.customerName, c.status, c.contractDate, c.endDate, f.revisedAmount(), f.billed(), f.received()));
        }
        return new PageResult<>(rows, total, page, size);
    }

    @Transactional
    public ContractDto get(UUID id) {
        return toDto(requireVisible(id));
    }

    @Transactional
    public ContractDto byProject(UUID projectId) {
        projects.requireVisible(projectId);
        Contract c = Contract.find("projectId", projectId).firstResult();
        if (c == null) {
            throw ApiException.notFound("โครงการนี้ยังไม่มีสัญญา");
        }
        return toDto(requireVisible(c.id));
    }

    // ================================================================= create

    /** US: แปลงใบเสนอราคาที่ลูกค้าตอบรับเป็นโครงการและสัญญาในคลิกเดียว */
    @Transactional
    public ContractDto fromQuotation(FromQuotationRequest req) {
        if (!currentUser.can(Perm.CONTRACT_WRITE) || !currentUser.can(Perm.PROJECT_WRITE)) {
            throw ApiException.forbidden("forbidden", "ต้องมีสิทธิ์สร้างโครงการและสัญญา");
        }
        Quotation q = Quotation.findById(req.quotationId());
        if (q == null || !currentUser.can(Perm.QUOTATION_READ)) {
            throw ApiException.notFound("ไม่พบใบเสนอราคา");
        }
        if (!Quotation.ACCEPTED.equals(q.status)) {
            throw ApiException.conflict("invalid_status", "แปลงเป็นสัญญาได้เฉพาะใบเสนอราคาที่ลูกค้าตอบรับแล้ว");
        }
        Number existing = (Number) em.createNativeQuery("select count(*) from contracts where quotation_id = ?1 and deleted_at is null")
                .setParameter(1, q.id).getSingleResult();
        if (existing.longValue() > 0) {
            throw ApiException.conflict("already_converted", "ใบเสนอราคานี้ถูกแปลงเป็นสัญญาแล้ว");
        }
        checkWht(req.whtPct());
        String site = UserNames.blankToNull(req.siteAddress());
        if (site == null && q.leadId != null) {
            com.ktt.lead.Lead lead = com.ktt.lead.Lead.findById(q.leadId);
            site = lead == null ? null : lead.siteAddress;
        }
        String name = UserNames.blankToNull(req.projectName()) != null ? req.projectName().trim()
                : q.title != null ? q.title : "งาน " + q.customerName;
        Project p = projects.createFromQuotation(q, name, site, q.costTotal);
        if (req.startDate() != null) {
            p.plannedStart = req.startDate();
        }
        if (req.endDate() != null) {
            p.plannedEnd = req.endDate();
        }

        Contract c = new Contract();
        c.docNo = docNumbers.next(projects.prefix("contract", "CT"), DocNumberService.today());
        c.projectId = p.id;
        c.quotationId = q.id;
        c.customerId = q.customerId;
        c.customerName = q.customerName;
        c.customerAddress = q.customerAddress;
        c.customerTaxId = q.customerTaxId;
        c.customerBranchNo = q.customerBranchNo;
        c.title = name;
        c.contractDate = req.contractDate() == null ? DocNumberService.today() : req.contractDate();
        c.startDate = p.plannedStart;
        c.endDate = p.plannedEnd;
        // มูลค่าก่อน VAT = ยอดสุทธิของใบเสนอราคา − VAT (รวมผลการปัดเศษแล้ว)
        c.amount = Money.round2(q.totalAmount.subtract(q.vatAmount));
        c.vatEnabled = q.vatEnabled;
        c.vatPct = q.vatPct;
        c.advancePct = req.advancePct();
        c.retentionPct = req.retentionPct();
        c.whtPct = req.whtPct();
        c.terms = q.warrantyTerms == null ? null : "การรับประกัน: " + q.warrantyTerms;
        c.createdBy = currentUser.id();
        c.persist();

        List<MilestoneInput> ms = req.milestones() == null || req.milestones().isEmpty()
                ? List.of(new MilestoneInput(null, "งวดที่ 1 ส่งมอบงานทั้งหมด", null, new BigDecimal("100"), c.endDate))
                : req.milestones();
        writeMilestones(c, ms, false);
        audit.log("contract", c.id, AuditService.ACTION_CREATE, null,
                Map.of("docNo", c.docNo, "fromQuotation", q.displayNo(), "amount", c.amount, "project", p.code));
        return toDto(c);
    }

    @Transactional
    public ContractDto create(CreateRequest req) {
        if (!currentUser.can(Perm.CONTRACT_WRITE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์สร้างสัญญา");
        }
        Project p = projects.requireVisible(req.projectId());
        if (Contract.count("projectId", p.id) > 0) {
            throw ApiException.conflict("already_exists", "โครงการนี้มีสัญญาแล้ว");
        }
        Customer cu = Customer.findById(p.customerId);
        Contract c = new Contract();
        c.docNo = docNumbers.next(projects.prefix("contract", "CT"), DocNumberService.today());
        c.projectId = p.id;
        c.customerId = p.customerId;
        c.customerName = cu.name;
        c.customerAddress = cu.billingAddress;
        c.customerTaxId = cu.taxId;
        c.customerBranchNo = cu.branchNo;
        c.title = UserNames.blankToNull(req.title()) == null ? p.name : req.title().trim();
        c.contractDate = DocNumberService.today();
        c.startDate = p.plannedStart;
        c.endDate = p.plannedEnd;
        c.amount = Money.round2(req.amount());
        c.vatEnabled = req.vatEnabled();
        c.createdBy = currentUser.id();
        c.persist();
        writeMilestones(c, List.of(new MilestoneInput(null, "งวดที่ 1 ส่งมอบงานทั้งหมด", null, new BigDecimal("100"), c.endDate)), false);
        audit.log("contract", c.id, AuditService.ACTION_CREATE, null, Map.of("docNo", c.docNo, "amount", c.amount));
        return toDto(c);
    }

    // ================================================================= update

    @Transactional
    public ContractDto update(UUID id, UpdateRequest req) {
        Contract c = requireWritable(id);
        checkWht(req.whtPct());
        if (req.startDate() != null && req.endDate() != null && req.endDate().isBefore(req.startDate())) {
            throw ApiException.badRequest("invalid_dates", "วันสิ้นสุดสัญญาต้องไม่ก่อนวันเริ่ม");
        }
        Map<String, Object> before = auditView(c);
        boolean draft = Contract.DRAFT.equals(c.status);
        if (!draft && (req.amount().compareTo(c.amount) != 0 || req.vatEnabled() != c.vatEnabled
                || req.vatPct().compareTo(c.vatPct) != 0 || req.advancePct().compareTo(c.advancePct) != 0
                || req.retentionPct().compareTo(c.retentionPct) != 0)) {
            throw ApiException.conflict("contract_active", "สัญญาที่เปิดใช้แล้วแก้มูลค่าหรือเงื่อนไขการเงินไม่ได้ ให้ทำเป็นงานเพิ่ม-ลด (VO)");
        }
        c.title = req.title().trim();
        c.customerName = req.customerName().trim();
        c.customerAddress = UserNames.blankToNull(req.customerAddress());
        c.customerTaxId = UserNames.blankToNull(req.customerTaxId());
        c.customerBranchNo = UserNames.blankToNull(req.customerBranchNo());
        c.contractDate = req.contractDate();
        c.startDate = req.startDate();
        c.endDate = req.endDate();
        c.amount = Money.round2(req.amount());
        c.vatEnabled = req.vatEnabled();
        c.vatPct = req.vatPct();
        c.advancePct = req.advancePct();
        c.retentionPct = req.retentionPct();
        c.whtPct = req.whtPct();
        c.penaltyPerDay = req.penaltyPerDay();
        c.warrantyMonths = req.warrantyMonths();
        c.terms = UserNames.blankToNull(req.terms());
        c.notes = UserNames.blankToNull(req.notes());
        c.signedAt = req.signedAt();
        if (draft) {
            // มูลค่าเปลี่ยน → คำนวณเงินงวดใหม่ตาม %
            List<ContractMilestone> ms = ContractMilestone.listFor(c.id);
            List<MilestoneInput> in = ms.stream().map(m -> new MilestoneInput(m.id, m.name, m.criteria, m.pct, m.dueDate)).toList();
            writeMilestones(c, in, false);
        }
        var d = audit.diff(before, auditView(c));
        audit.log("contract", c.id, AuditService.ACTION_UPDATE, d[0], d[1]);
        return toDto(c);
    }

    @Transactional
    public ContractDto saveMilestones(UUID id, List<MilestoneInput> inputs) {
        Contract c = requireWritable(id);
        if (Set.of(Contract.COMPLETED, Contract.TERMINATED).contains(c.status)) {
            throw ApiException.conflict("contract_closed", "สัญญาปิดแล้ว");
        }
        writeMilestones(c, inputs, !Contract.DRAFT.equals(c.status));
        audit.log("contract", c.id, AuditService.ACTION_UPDATE, null, Map.of("milestones", inputs.size()));
        return toDto(c);
    }

    /**
     * เขียนงวดงานใหม่ทั้งชุด งวดที่วางบิลแล้วแก้ % หรือลบไม่ได้; งวดจาก VO คงไว้ตามเดิม (ไม่นับใน 100%)
     * @param strict true = ต้องรวมได้ 100% (ใช้ตอนสัญญาเปิดใช้แล้ว)
     */
    private void writeMilestones(Contract c, List<MilestoneInput> inputs, boolean strict) {
        Map<UUID, ContractMilestone> existing = new HashMap<>();
        List<ContractMilestone> voMilestones = new ArrayList<>();
        for (ContractMilestone m : ContractMilestone.listFor(c.id)) {
            if (m.changeOrderId != null) {
                voMilestones.add(m);
            } else {
                existing.put(m.id, m);
            }
        }
        List<BigDecimal> pcts = inputs.stream().map(MilestoneInput::pct).toList();
        BigDecimal sum = pcts.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        if (strict && sum.subtract(new BigDecimal("100")).abs().compareTo(TOLERANCE) > 0) {
            throw ApiException.badRequest("milestone_total", "งวดงานต้องรวมกันได้ 100% (ตอนนี้ " + sum.stripTrailingZeros().toPlainString() + "%)");
        }
        List<BigDecimal> amounts = MilestoneSplitter.split(c.amount, pcts);
        Set<UUID> kept = new java.util.HashSet<>();
        // ย้ายเลขงวดชั่วคราวเพื่อเลี่ยง unique (contract_id, seq) ระหว่างจัดลำดับใหม่
        for (ContractMilestone m : ContractMilestone.listFor(c.id)) {
            m.seq = -m.seq - 1000;
        }
        em.flush();
        int seq = 0;
        for (int i = 0; i < inputs.size(); i++) {
            MilestoneInput in = inputs.get(i);
            ContractMilestone m;
            if (in.id() != null) {
                m = ContractMilestone.findById(in.id());
                if (m == null || !m.contractId.equals(c.id) || m.changeOrderId != null) {
                    throw ApiException.badRequest("invalid_milestone", "ไม่พบงวดงานเดิม");
                }
                if (!"pending".equals(m.status) && !"ready".equals(m.status)
                        && (m.pct.compareTo(in.pct()) != 0 || m.amount.compareTo(amounts.get(i)) != 0)) {
                    throw ApiException.conflict("milestone_billed", "งวด \"" + m.name + "\" วางบิลแล้ว แก้ % หรือมูลค่าไม่ได้");
                }
                kept.add(m.id);
            } else {
                m = new ContractMilestone();
                m.contractId = c.id;
            }
            m.seq = ++seq;
            m.name = in.name().trim();
            m.criteria = UserNames.blankToNull(in.criteria());
            m.pct = in.pct();
            m.amount = amounts.get(i);
            m.dueDate = in.dueDate();
            if (m.id == null) {
                m.persist();
            }
        }
        for (ContractMilestone old : existing.values()) {
            if (!kept.contains(old.id)) {
                ContractMilestone m = ContractMilestone.findById(old.id);
                if (!"pending".equals(m.status) && !"ready".equals(m.status)) {
                    throw ApiException.conflict("milestone_billed", "งวด \"" + m.name + "\" วางบิลแล้ว ลบไม่ได้");
                }
                Number refs = (Number) em.createNativeQuery("select count(*) from sales_doc_items where milestone_id = ?1")
                        .setParameter(1, m.id).getSingleResult();
                if (refs.longValue() > 0) {
                    throw ApiException.conflict("milestone_referenced", "งวด \"" + m.name + "\" มีเอกสารการเงินอ้างอิงอยู่ (รวมฉบับร่างหรือที่ยกเลิก) ลบไม่ได้");
                }
                m.delete();
            }
        }
        for (ContractMilestone vo : voMilestones) {
            ContractMilestone m = ContractMilestone.findById(vo.id);
            m.seq = ++seq;
        }
        em.flush();
    }

    @Transactional
    public ContractDto changeStatus(UUID id, String status, String reason) {
        Contract c = requireWritable(id);
        String from = c.status;
        switch (status) {
            case Contract.ACTIVE -> {
                if (!currentUser.can(Perm.CONTRACT_APPROVE)) {
                    throw ApiException.forbidden("forbidden", "ต้องมีสิทธิ์อนุมัติจึงเปิดใช้สัญญาได้");
                }
                if (!Contract.DRAFT.equals(c.status)) {
                    throw ApiException.conflict("invalid_status", "เปิดใช้ได้เฉพาะสัญญาฉบับร่าง");
                }
                BigDecimal sum = ContractMilestone.listFor(c.id).stream().filter(m -> m.changeOrderId == null)
                        .map(m -> m.pct).reduce(BigDecimal.ZERO, BigDecimal::add);
                if (sum.subtract(new BigDecimal("100")).abs().compareTo(TOLERANCE) > 0) {
                    throw ApiException.badRequest("milestone_total", "งวดงานต้องรวมกันได้ 100% ก่อนเปิดใช้สัญญา");
                }
                if (c.amount.signum() <= 0) {
                    throw ApiException.badRequest("invalid_amount", "มูลค่าสัญญาต้องมากกว่า 0");
                }
                c.status = Contract.ACTIVE;
                if (c.signedAt == null) {
                    c.signedAt = DocNumberService.today();
                }
                Project p = Project.findById(c.projectId);
                if ("planning".equals(p.status)) {
                    p.status = "active";
                    if (p.actualStart == null) {
                        p.actualStart = c.startDate != null ? c.startDate : DocNumberService.today();
                    }
                }
            }
            case Contract.COMPLETED -> {
                if (!Contract.ACTIVE.equals(c.status)) {
                    throw ApiException.conflict("invalid_status", "ปิดสัญญาได้เฉพาะสัญญาที่เปิดใช้อยู่");
                }
                c.status = Contract.COMPLETED;
            }
            case Contract.TERMINATED -> {
                if (!Contract.ACTIVE.equals(c.status) && !Contract.DRAFT.equals(c.status)) {
                    throw ApiException.conflict("invalid_status", "สัญญานี้ปิดแล้ว");
                }
                if (UserNames.blankToNull(reason) == null) {
                    throw ApiException.badRequest("reason_required", "กรุณาระบุเหตุผลการยกเลิกสัญญา");
                }
                c.status = Contract.TERMINATED;
                c.notes = (c.notes == null ? "" : c.notes + "\n") + "ยกเลิกสัญญา: " + reason.trim();
            }
            default -> throw ApiException.badRequest("invalid_status", "สถานะไม่ถูกต้อง");
        }
        audit.log("contract", c.id, AuditService.ACTION_UPDATE, Map.of("status", from), Map.of("status", c.status));
        return toDto(c);
    }

    @Transactional
    public ContractDto markMilestone(UUID contractId, UUID milestoneId, boolean ready) {
        Contract c = requireVisible(contractId);
        if (!currentUser.can(Perm.CONTRACT_WRITE) && !currentUser.can(Perm.PROJECT_WRITE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์ยืนยันการส่งมอบงวดงาน");
        }
        ContractMilestone m = ContractMilestone.findById(milestoneId);
        if (m == null || !m.contractId.equals(c.id)) {
            throw ApiException.notFound("ไม่พบงวดงาน");
        }
        if (ready && "pending".equals(m.status)) {
            m.status = "ready";
            m.completedAt = DocNumberService.today();
        } else if (!ready && "ready".equals(m.status)) {
            m.status = "pending";
            m.completedAt = null;
        } else {
            throw ApiException.conflict("invalid_status", "เปลี่ยนสถานะงวดนี้ไม่ได้");
        }
        audit.log("contract", c.id, AuditService.ACTION_UPDATE, null, Map.of("milestone", m.name, "status", m.status));
        return toDto(c);
    }

    @Transactional
    public ContractDto releaseRetention(UUID id, BigDecimal amount) {
        // ล็อกสัญญาก่อนอ่านยอด กันบันทึกรับคืนซ้อนกันจนเกินยอดที่ลูกค้ากันไว้
        Contract.findById(id, jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
        Contract c = requireVisible(id);
        if (!currentUser.can(Perm.FINANCE_WRITE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์บันทึกการคืนเงินประกันผลงาน");
        }
        BigDecimal held = Money.round2(retentionWithheld(c.id).subtract(c.retentionReleased));
        if (amount.compareTo(held) > 0) {
            throw ApiException.badRequest("over_release", "คืนได้ไม่เกินเงินประกันที่ลูกค้ากันไว้จริงในใบเสร็จ " + held.toPlainString() + " บาท");
        }
        BigDecimal amt = Money.round2(amount);
        var receipt = salesDocs.get().issueRetentionReceipt(c, amt, DocNumberService.today());
        c.retentionReleased = Money.round2(c.retentionReleased.add(amt));
        audit.log("contract", c.id, AuditService.ACTION_UPDATE, null, Map.of("retentionReleased", amt, "receipt", receipt.docNo));
        return toDto(c);
    }

    @Transactional
    public void delete(UUID id) {
        Contract c = requireWritable(id);
        if (!Contract.DRAFT.equals(c.status)) {
            throw ApiException.conflict("not_editable", "ลบได้เฉพาะสัญญาฉบับร่าง");
        }
        Number docs = (Number) em.createNativeQuery("select count(*) from sales_docs where contract_id = ?1 and deleted_at is null")
                .setParameter(1, c.id).getSingleResult();
        if (docs.longValue() > 0) {
            throw ApiException.conflict("in_use", "สัญญานี้มีเอกสารการเงินแล้ว");
        }
        // ใบแจ้งหนี้ฉบับร่างที่ถูกลบ (soft delete) อาจยังอ้างอิงงวดงานอยู่ → ปลดการอ้างอิงก่อนลบงวด
        em.createNativeQuery("""
                        update sales_doc_items set milestone_id = null
                        where milestone_id in (select id from contract_milestones where contract_id = ?1)""")
                .setParameter(1, c.id).executeUpdate();
        em.createNativeQuery("delete from contract_milestones where contract_id = ?1").setParameter(1, c.id).executeUpdate();
        em.createNativeQuery("update change_orders set deleted_at = now() where contract_id = ?1").setParameter(1, c.id).executeUpdate();
        c.softDelete();
        audit.log("contract", c.id, AuditService.ACTION_DELETE, Map.of("docNo", c.docNo), null);
    }

    // ================================================================= financials

    public Financials financials(Contract c) {
        Object[] r = (Object[]) em.createNativeQuery("""
                        select
                          coalesce((select sum(amount) from change_orders where contract_id = ?1 and status = 'approved' and deleted_at is null), 0),
                          coalesce((select sum(case when doc_type = 'credit_note' then -(subtotal - discount_amount) else subtotal - discount_amount end)
                                    from sales_docs where contract_id = ?1 and kind <> 'advance' and status not in ('draft', 'void')
                                      and doc_type in ('invoice', 'invoice_tax', 'credit_note') and deleted_at is null), 0),
                          coalesce((select sum(settled_amount) from sales_docs where contract_id = ?1 and status <> 'void'
                                      and doc_type in ('receipt', 'tax_receipt') and kind <> 'retention' and deleted_at is null), 0),
                          coalesce((select sum(total_amount - settled_amount) from sales_docs where contract_id = ?1
                                      and status in ('issued', 'partial') and doc_type in ('invoice', 'invoice_tax') and deleted_at is null), 0),
                          coalesce((select sum(taxable_amount) from sales_docs where contract_id = ?1 and kind = 'advance'
                                      and status not in ('draft', 'void') and doc_type in ('invoice', 'invoice_tax') and deleted_at is null), 0),
                          coalesce((select sum(advance_deduct) from sales_docs where contract_id = ?1
                                      and status not in ('draft', 'void') and doc_type in ('invoice', 'invoice_tax') and deleted_at is null), 0),
                          coalesce((select sum(retention_amount) from sales_docs where contract_id = ?1
                                      and status <> 'void' and doc_type in ('receipt', 'tax_receipt') and kind <> 'retention' and deleted_at is null), 0),
                          coalesce((select sum(pct) from contract_milestones where contract_id = ?1 and change_order_id is null), 0)
                        """).setParameter(1, c.id).getSingleResult();
        BigDecimal vo = SqlValues.decimal0(r[0]);
        BigDecimal revised = Money.round2(c.amount.add(vo));
        BigDecimal vat = c.vatEnabled ? Money.pct(revised, c.vatPct) : BigDecimal.ZERO.setScale(2);
        BigDecimal retention = Money.round2(SqlValues.decimal0(r[6]));
        return new Financials(c.amount, Money.round2(vo), revised, vat, revised.add(vat), Money.round2(SqlValues.decimal0(r[1])),
                Money.round2(SqlValues.decimal0(r[2])), Money.round2(SqlValues.decimal0(r[3])), Money.round2(SqlValues.decimal0(r[4])),
                Money.round2(SqlValues.decimal0(r[5])), retention.subtract(c.retentionReleased), c.retentionReleased,
                SqlValues.decimal0(r[7]));
    }

    /** เงินประกันผลงานที่ลูกค้ากันไว้จริง (จากใบเสร็จที่ยังไม่ยกเลิก) ก่อนหักที่รับคืน */
    @Transactional(Transactional.TxType.MANDATORY)
    public BigDecimal retentionWithheld(UUID contractId) {
        return Money.round2(SqlValues.decimal0(em.createNativeQuery("""
                        select coalesce(sum(retention_amount), 0) from sales_docs where contract_id = ?1
                        and status <> 'void' and doc_type in ('receipt', 'tax_receipt') and kind <> 'retention' and deleted_at is null""")
                .setParameter(1, contractId).getSingleResult()));
    }

    // ================================================================= dto

    ContractDto toDto(Contract c) {
        Project p = Project.findById(c.projectId);
        Quotation q = c.quotationId == null ? null : Quotation.findById(c.quotationId);
        @SuppressWarnings("unchecked")
        List<Object[]> inv = em.createNativeQuery("""
                        select distinct on (i.milestone_id) i.milestone_id, d.id, d.doc_no
                        from sales_doc_items i join sales_docs d on d.id = i.doc_id
                        where d.contract_id = ?1 and d.status <> 'void' and d.deleted_at is null and i.milestone_id is not null
                        order by i.milestone_id, d.created_at desc
                        """).setParameter(1, c.id).getResultList();
        Map<UUID, Object[]> invByMs = new HashMap<>();
        inv.forEach(r -> invByMs.put(SqlValues.uuid(r[0]), r));
        boolean canEdit = currentUser.can(Perm.CONTRACT_WRITE) && !Set.of(Contract.COMPLETED, Contract.TERMINATED).contains(c.status);
        List<MilestoneDto> ms = ContractMilestone.listFor(c.id).stream().map(m -> {
            Object[] link = invByMs.get(m.id);
            return new MilestoneDto(m.id, m.seq, m.name, m.criteria, m.pct, m.amount, m.dueDate, m.status, m.changeOrderId,
                    m.completedAt, link == null ? null : SqlValues.uuid(link[1]), link == null ? null : (String) link[2],
                    canEdit && m.changeOrderId == null && ("pending".equals(m.status) || "ready".equals(m.status)));
        }).toList();
        List<ChangeOrder> vos = ChangeOrder.list("contractId = ?1 order by issueDate desc, docNo desc", c.id);
        List<VoRow> voRows = vos.stream().map(v -> new VoRow(v.id, v.docNo, v.title, v.status, v.issueDate, v.amount,
                v.daysExtension, v.decidedAt)).toList();
        return new ContractDto(c.id, c.docNo, c.projectId, p == null ? null : p.code, p == null ? null : p.name,
                c.quotationId, q == null ? null : q.displayNo(), c.customerId, c.customerName, c.customerAddress,
                c.customerTaxId, c.customerBranchNo, c.title, c.contractDate, c.startDate, c.endDate, c.amount,
                c.vatEnabled, c.vatPct, c.advancePct, c.retentionPct, c.whtPct, c.penaltyPerDay, c.warrantyMonths,
                c.status, c.terms, c.notes, c.signedAt, ms, voRows, financials(c), canEdit,
                currentUser.can(Perm.CONTRACT_APPROVE), c.createdAt, c.updatedAt);
    }

    static void checkWht(BigDecimal wht) {
        if (wht == null || wht.scale() > 2 || !WHT.contains(wht.intValue()) || wht.compareTo(BigDecimal.valueOf(wht.intValue())) != 0) {
            throw ApiException.badRequest("invalid_wht", "หัก ณ ที่จ่ายต้องเป็น 0, 1, 2, 3 หรือ 5%");
        }
    }

    private static Map<String, Object> auditView(Contract c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("title", c.title);
        m.put("customerName", c.customerName);
        m.put("amount", c.amount);
        m.put("vatEnabled", c.vatEnabled);
        m.put("advancePct", c.advancePct);
        m.put("retentionPct", c.retentionPct);
        m.put("whtPct", c.whtPct);
        m.put("startDate", String.valueOf(c.startDate));
        m.put("endDate", String.valueOf(c.endDate));
        return m;
    }
}
