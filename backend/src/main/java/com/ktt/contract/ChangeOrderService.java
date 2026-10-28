package com.ktt.contract;

import com.ktt.approval.Approval;
import com.ktt.audit.AuditService;
import com.ktt.common.ApiException;
import com.ktt.common.Money;
import com.ktt.common.UserNames;
import com.ktt.contract.ContractDtos.VoDto;
import com.ktt.contract.ContractDtos.VoItemDto;
import com.ktt.contract.ContractDtos.VoItemInput;
import com.ktt.contract.ContractDtos.VoRequest;
import com.ktt.docnum.DocNumberService;
import com.ktt.notification.NotificationService;
import com.ktt.project.Project;
import com.ktt.project.ProjectService;
import com.ktt.security.CurrentUser;
import com.ktt.security.Perm;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * งานเพิ่ม-ลด (VO)
 * <pre>
 * draft ──ส่งขออนุมัติ──► pending_approval ──อนุมัติ──► approved (มูลค่าสัญญาปรับ, ขยายเวลา, สร้างงวดเรียกเก็บ)
 *                                          └──ไม่อนุมัติ──► rejected
 * draft / pending_approval ──ยกเลิก──► cancelled
 * </pre>
 */
@ApplicationScoped
public class ChangeOrderService {

    @Inject
    CurrentUser currentUser;

    @Inject
    AuditService audit;

    @Inject
    DocNumberService docNumbers;

    @Inject
    ContractService contracts;

    @Inject
    ProjectService projects;

    @Inject
    NotificationService notifications;

    @Inject
    EntityManager em;

    @Transactional
    public VoDto get(UUID id) {
        return toDto(requireVisible(id));
    }

    @Transactional
    public VoDto create(UUID contractId, VoRequest req) {
        Contract c = contracts.requireWritable(contractId);
        if (!Contract.ACTIVE.equals(c.status) && !Contract.DRAFT.equals(c.status)) {
            throw ApiException.conflict("contract_closed", "สัญญาปิดแล้ว เพิ่มงานเพิ่ม-ลดไม่ได้");
        }
        ChangeOrder v = new ChangeOrder();
        v.docNo = docNumbers.next(projects.prefix("change_order", "VO"), DocNumberService.today());
        v.contractId = c.id;
        v.projectId = c.projectId;
        v.createdBy = currentUser.id();
        apply(v, req);
        v.persist();
        List<ChangeOrderItem> items = writeItems(v, req.items(), Map.of());
        audit.log("change_order", v.id, AuditService.ACTION_CREATE, null,
                Map.of("docNo", v.docNo, "contract", c.docNo, "amount", v.amount));
        return toDto(v, items);
    }

    @Transactional
    public VoDto update(UUID id, VoRequest req) {
        ChangeOrder v = requireWritable(id);
        if (!"draft".equals(v.status)) {
            throw ApiException.conflict("not_editable", "แก้ไขได้เฉพาะฉบับร่าง");
        }
        BigDecimal before = v.amount;
        apply(v, req);
        // ต้นทุนเดิมรายรายการ: ผู้ไม่มีสิทธิ์ดูต้นทุนส่ง unitCost มาไม่ได้ → คงค่าเดิมตาม id รายการ
        Map<UUID, BigDecimal> oldCosts = new HashMap<>();
        for (ChangeOrderItem old : ChangeOrderItem.listFor(v.id)) {
            if (old.unitCost != null) {
                oldCosts.put(old.id, old.unitCost);
            }
        }
        ChangeOrderItem.delete("changeOrderId", v.id);
        List<ChangeOrderItem> items = writeItems(v, req.items(), oldCosts);
        audit.log("change_order", v.id, AuditService.ACTION_UPDATE, Map.of("amount", before), Map.of("amount", v.amount));
        return toDto(v, items);
    }

    @Transactional
    public VoDto submit(UUID id) {
        ChangeOrder v = requireWritable(id);
        if (!"draft".equals(v.status)) {
            throw ApiException.conflict("invalid_status", "ส่งขออนุมัติได้เฉพาะฉบับร่าง");
        }
        if (ChangeOrderItem.count("changeOrderId", v.id) == 0) {
            throw ApiException.badRequest("no_items", "ต้องมีอย่างน้อย 1 รายการ");
        }
        v.status = "pending_approval";
        Approval a = new Approval();
        a.targetType = "change_order";
        a.targetId = v.id;
        a.reason = "change_order";
        a.requestedBy = currentUser.id();
        a.persist();
        notifications.notifyAll(notifications.usersWithPermission(Perm.CONTRACT_APPROVE), "approval_request",
                "ขออนุมัติงานเพิ่ม-ลด " + v.docNo, v.title + " " + v.amount.toPlainString() + " บาท",
                "/change-orders/" + v.id, "change_order", v.id);
        audit.log("change_order", v.id, AuditService.ACTION_UPDATE, Map.of("status", "draft"), Map.of("status", v.status));
        return toDto(v);
    }

    @Transactional
    public VoDto decide(UUID id, boolean approve, String comment, boolean createMilestone) {
        if (!currentUser.can(Perm.CONTRACT_APPROVE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์อนุมัติงานเพิ่ม-ลด");
        }
        ChangeOrder v = requireVisible(id);
        if (!"pending_approval".equals(v.status)) {
            throw ApiException.conflict("invalid_status", "งานเพิ่ม-ลดนี้ไม่ได้รออนุมัติ");
        }
        Approval a = Approval.latestFor("change_order", v.id);
        UUID requester = a == null ? v.createdBy : a.requestedBy;
        if (requester != null && requester.equals(currentUser.id()) && !isOwner()) {
            throw ApiException.forbidden("self_approval", "อนุมัติคำขอของตัวเองไม่ได้");
        }
        v.status = approve ? "approved" : "rejected";
        v.decidedBy = currentUser.id();
        v.decidedAt = Instant.now();
        v.decisionComment = UserNames.blankToNull(comment);
        if (a != null && Approval.PENDING.equals(a.status)) {
            a.status = approve ? Approval.APPROVED : Approval.REJECTED;
            a.decidedBy = currentUser.id();
            a.decidedAt = v.decidedAt;
            a.comment = v.decisionComment;
        }
        if (approve) {
            Contract c = Contract.findById(v.contractId);
            if (v.daysExtension != 0 && c.endDate != null) {
                c.endDate = c.endDate.plusDays(v.daysExtension);
                Project p = Project.findById(v.projectId);
                if (p != null && p.plannedEnd != null) {
                    p.plannedEnd = p.plannedEnd.plusDays(v.daysExtension);
                }
            }
            if (createMilestone && v.amount.signum() > 0) {
                Number max = (Number) em.createNativeQuery("select coalesce(max(seq), 0) from contract_milestones where contract_id = ?1")
                        .setParameter(1, c.id).getSingleResult();
                ContractMilestone m = new ContractMilestone();
                m.contractId = c.id;
                m.seq = max.intValue() + 1;
                m.name = "งานเพิ่ม " + v.docNo + " " + v.title;
                m.pct = BigDecimal.ZERO;
                m.amount = v.amount;
                m.changeOrderId = v.id;
                m.persist();
            }
        }
        if (requester != null) {
            notifications.notify(requester, "approval_result", (approve ? "อนุมัติแล้ว: " : "ไม่อนุมัติ: ") + v.docNo,
                    v.decisionComment, "/change-orders/" + v.id, "change_order", v.id);
        }
        audit.log("change_order", v.id, approve ? AuditService.ACTION_APPROVE : AuditService.ACTION_REJECT, null,
                Map.of("comment", v.decisionComment == null ? "" : v.decisionComment));
        return toDto(v);
    }

    @Transactional
    public VoDto cancel(UUID id) {
        ChangeOrder v = requireWritable(id);
        if (!"draft".equals(v.status) && !"pending_approval".equals(v.status)) {
            throw ApiException.conflict("invalid_status", "ยกเลิกได้เฉพาะงานที่ยังไม่อนุมัติ");
        }
        Approval a = Approval.latestFor("change_order", v.id);
        if (a != null && Approval.PENDING.equals(a.status)) {
            a.status = Approval.REJECTED;
            a.comment = "ยกเลิกโดยผู้ขอ";
            a.decidedAt = Instant.now();
            a.decidedBy = currentUser.id();
        }
        v.status = "cancelled";
        audit.log("change_order", v.id, AuditService.ACTION_UPDATE, null, Map.of("status", "cancelled"));
        return toDto(v);
    }

    @Transactional
    public List<ContractDtos.VoRow> pending() {
        if (!currentUser.can(Perm.CONTRACT_APPROVE)) {
            return List.of();
        }
        List<ChangeOrder> list = ChangeOrder.list("status = 'pending_approval' order by createdAt");
        List<ContractDtos.VoRow> out = new ArrayList<>();
        for (ChangeOrder v : list) {
            Project p = Project.findById(v.projectId);
            if (p != null && projects.canSee(p)) {
                out.add(new ContractDtos.VoRow(v.id, v.docNo, v.title, v.status, v.issueDate, v.amount, v.daysExtension, v.decidedAt));
            }
        }
        return out;
    }

    // ================================================================= internals

    private ChangeOrder requireVisible(UUID id) {
        ChangeOrder v = id == null ? null : ChangeOrder.findById(id);
        if (v == null) {
            throw ApiException.notFound("ไม่พบงานเพิ่ม-ลด");
        }
        contracts.requireVisible(v.contractId);
        return v;
    }

    private ChangeOrder requireWritable(UUID id) {
        ChangeOrder v = requireVisible(id);
        contracts.requireWritable(v.contractId);
        return v;
    }

    private void apply(ChangeOrder v, VoRequest req) {
        v.title = req.title().trim();
        v.reason = UserNames.blankToNull(req.reason());
        v.requestedByCustomer = req.requestedByCustomer();
        v.issueDate = req.issueDate();
        v.daysExtension = req.daysExtension();
        v.customerApprovedAt = req.customerApprovedAt();
    }

    private List<ChangeOrderItem> writeItems(ChangeOrder v, List<VoItemInput> inputs, Map<UUID, BigDecimal> oldCosts) {
        boolean cost = currentUser.canViewCost();
        List<ChangeOrderItem> out = new ArrayList<>();
        BigDecimal total = BigDecimal.ZERO;
        BigDecimal costTotal = BigDecimal.ZERO;
        boolean hasCost = false;
        int order = 0;
        for (VoItemInput in : inputs) {
            ChangeOrderItem it = new ChangeOrderItem();
            it.changeOrderId = v.id;
            it.sortOrder = ++order;
            it.description = in.description().trim();
            it.quantity = in.quantity();
            it.unit = UserNames.blankToNull(in.unit());
            it.unitPrice = Money.round2(in.unitPrice());
            it.amount = Money.round2(it.quantity.multiply(it.unitPrice));
            if (cost) {
                it.unitCost = in.unitCost() == null ? null : Money.round2(in.unitCost());
            } else {
                it.unitCost = in.id() == null ? null : oldCosts.get(in.id());
            }
            if (it.unitCost != null) {
                costTotal = costTotal.add(Money.round2(it.quantity.multiply(it.unitCost)));
                hasCost = true;
            }
            it.persist();
            total = total.add(it.amount);
            out.add(it);
        }
        v.amount = Money.round2(total);
        v.costAmount = hasCost ? Money.round2(costTotal) : null;
        return out;
    }

    private boolean isOwner() {
        com.ktt.auth.User u = com.ktt.auth.User.findById(currentUser.id());
        return u != null && "owner".equals(u.role.code);
    }

    VoDto toDto(ChangeOrder v) {
        return toDto(v, ChangeOrderItem.listFor(v.id));
    }

    VoDto toDto(ChangeOrder v, List<ChangeOrderItem> items) {
        Contract c = Contract.findById(v.contractId);
        Project p = Project.findById(v.projectId);
        boolean cost = currentUser.canViewCost();
        Map<UUID, String> names = UserNames.of(java.util.Arrays.asList(v.decidedBy, v.createdBy));
        BigDecimal vat = c.vatEnabled ? Money.pct(v.amount, c.vatPct) : BigDecimal.ZERO.setScale(2);
        List<VoItemDto> its = items.stream().map(i -> new VoItemDto(i.id, i.sortOrder, i.description, i.quantity, i.unit,
                i.unitPrice, cost ? i.unitCost : null, i.amount)).toList();
        return new VoDto(v.id, v.docNo, c.id, c.docNo, v.projectId, p == null ? null : p.name, c.customerName, v.title,
                v.reason, v.requestedByCustomer, v.amount, vat, v.amount.add(vat), cost ? v.costAmount : null,
                v.daysExtension, v.status, v.issueDate, v.customerApprovedAt, names.get(v.decidedBy), v.decidedAt,
                v.decisionComment, names.get(v.createdBy), its,
                "draft".equals(v.status) && currentUser.can(Perm.CONTRACT_WRITE),
                "pending_approval".equals(v.status) && currentUser.can(Perm.CONTRACT_APPROVE), v.createdAt);
    }
}
