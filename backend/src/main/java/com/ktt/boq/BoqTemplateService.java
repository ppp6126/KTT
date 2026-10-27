package com.ktt.boq;

import com.ktt.audit.AuditService;
import com.ktt.boq.BoqDtos.FactorRowDto;
import com.ktt.boq.BoqDtos.FactorRowInput;
import com.ktt.boq.BoqDtos.FactorTableDto;
import com.ktt.boq.BoqDtos.FactorTableRequest;
import com.ktt.boq.BoqDtos.ItemInput;
import com.ktt.boq.BoqDtos.TemplateDto;
import com.ktt.boq.BoqDtos.TemplateItemDto;
import com.ktt.boq.BoqDtos.TemplateRequest;
import com.ktt.boq.BoqDtos.TemplateSummary;
import com.ktt.common.ApiException;
import com.ktt.common.Money;
import com.ktt.security.CurrentUser;
import com.ktt.security.Perm;
import io.quarkus.panache.common.Sort;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** แม่แบบ BOQ (FR-05) และตาราง Factor F */
@ApplicationScoped
public class BoqTemplateService {

    @Inject
    CurrentUser currentUser;

    @Inject
    AuditService audit;

    // ================================================================= templates

    @Transactional
    public List<TemplateSummary> list() {
        Map<UUID, Long> counts = new HashMap<>();
        @SuppressWarnings("unchecked")
        List<Object[]> rows = BoqTemplate.getEntityManager()
                .createNativeQuery("select template_id, count(*) from boq_template_items group by template_id").getResultList();
        rows.forEach(r -> counts.put((UUID) r[0], ((Number) r[1]).longValue()));
        List<BoqTemplate> list = BoqTemplate.listAll(Sort.by("name"));
        return list.stream().map(t -> new TemplateSummary(t.id, t.name, t.jobType, t.description,
                counts.getOrDefault(t.id, 0L), t.updatedAt)).toList();
    }

    @Transactional
    public TemplateDto get(UUID id) {
        BoqTemplate t = require(id);
        List<BoqTemplateItem> items = BoqCalculator.treeOrder(BoqTemplateItem.listFor(id), i -> i.id.toString(),
                i -> i.parentId == null ? null : i.parentId.toString(), i -> i.sortOrder);
        return new TemplateDto(t.id, t.name, t.jobType, t.description, items.stream()
                .map(i -> new TemplateItemDto(i.id, i.parentId, i.level, i.sortOrder, i.description, i.unit, i.quantity,
                        i.materialId, i.laborId, i.equipmentId, i.note)).toList());
    }

    @Transactional
    public TemplateDto save(UUID id, TemplateRequest req) {
        requireWrite();
        BoqTemplate t = id == null ? new BoqTemplate() : require(id);
        t.name = req.name().trim();
        t.jobType = BoqService.blankToNull(req.jobType());
        t.description = BoqService.blankToNull(req.description());
        if (id == null) {
            t.createdBy = currentUser.id();
            t.persist();
        } else {
            BoqTemplateItem.delete("templateId", t.id);
        }
        Map<String, UUID> keyToId = new HashMap<>();
        Map<String, Integer> order = new HashMap<>();
        Map<String, String> parentOf = new HashMap<>();
        req.items().forEach(i -> parentOf.put(i.key(), i.parentKey()));
        Map<ItemInput, Integer> pos = new HashMap<>();
        for (int i = 0; i < req.items().size(); i++) {
            pos.put(req.items().get(i), i);
        }
        for (ItemInput in : BoqCalculator.treeOrder(req.items(), ItemInput::key, ItemInput::parentKey, pos::get)) {
            int depth = depth(in.key(), parentOf);
            if (depth > BoqService.MAX_LEVEL) {
                throw ApiException.badRequest("too_deep", "แม่แบบมีได้ไม่เกิน 3 ชั้น");
            }
            BoqTemplateItem ti = new BoqTemplateItem();
            ti.templateId = t.id;
            ti.parentId = in.parentKey() == null ? null : keyToId.get(in.parentKey());
            ti.level = (short) depth;
            ti.sortOrder = order.merge(String.valueOf(in.parentKey()), 1, Integer::sum);
            ti.description = in.description().trim();
            ti.unit = BoqService.blankToNull(in.unit());
            ti.quantity = Money.z(in.quantity());
            ti.materialId = in.materialId();
            ti.laborId = in.laborId();
            ti.equipmentId = in.equipmentId();
            ti.note = BoqService.blankToNull(in.note());
            ti.persist();
            keyToId.put(in.key(), ti.id);
        }
        audit.log("boq_template", t.id, id == null ? AuditService.ACTION_CREATE : AuditService.ACTION_UPDATE, null,
                Map.of("name", t.name, "items", req.items().size()));
        return get(t.id);
    }

    @Transactional
    public void delete(UUID id) {
        requireWrite();
        BoqTemplate t = require(id);
        t.softDelete();
        audit.log("boq_template", t.id, AuditService.ACTION_DELETE, Map.of("name", t.name), null);
    }

    private static int depth(String key, Map<String, String> parentOf) {
        int d = 1;
        String p = parentOf.get(key);
        Set<String> seen = new HashSet<>();
        while (p != null) {
            if (!seen.add(p)) {
                throw ApiException.badRequest("cycle", "โครงสร้างวนซ้ำ");
            }
            d++;
            p = parentOf.get(p);
        }
        return d;
    }

    private static BoqTemplate require(UUID id) {
        BoqTemplate t = BoqTemplate.findById(id);
        if (t == null) {
            throw ApiException.notFound("ไม่พบแม่แบบ");
        }
        return t;
    }

    private void requireWrite() {
        if (!currentUser.can(Perm.BOQ_WRITE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์แก้ไขแม่แบบ BOQ");
        }
    }

    // ================================================================= factor F

    @Transactional
    public List<FactorTableDto> factorTables() {
        List<FactorFTable> list = FactorFTable.listAll(Sort.by("name"));
        return list.stream().map(this::toDto).toList();
    }

    @Transactional
    public FactorTableDto factorTable(UUID id) {
        return toDto(requireTable(id));
    }

    @Transactional
    public FactorTableDto saveFactorTable(UUID id, FactorTableRequest req) {
        requireWrite();
        FactorFTable t = id == null ? new FactorFTable() : requireTable(id);
        t.name = req.name().trim();
        t.workType = req.workType() == null || req.workType().isBlank() ? "building" : req.workType().trim();
        t.advancePct = req.advancePct();
        t.retentionPct = req.retentionPct();
        t.interestPct = req.interestPct();
        t.vatPct = req.vatPct();
        t.note = BoqService.blankToNull(req.note());
        if (id == null) {
            t.createdBy = currentUser.id();
            t.persist();
        } else {
            FactorFTableRow.delete("tableId", t.id);
        }
        Set<BigDecimal> seen = new HashSet<>();
        for (FactorRowInput r : req.rows()) {
            BigDecimal cost = Money.round2(r.cost());
            if (!seen.add(cost)) {
                throw ApiException.badRequest("duplicate_cost", "ค่างานต้นทุน " + cost.toPlainString() + " ซ้ำในตาราง");
            }
            FactorFTableRow row = new FactorFTableRow();
            row.tableId = t.id;
            row.cost = cost;
            row.factor = r.factor().setScale(4, java.math.RoundingMode.HALF_UP);
            row.persist();
        }
        audit.log("factor_f_table", t.id, id == null ? AuditService.ACTION_CREATE : AuditService.ACTION_UPDATE, null,
                Map.of("name", t.name, "rows", req.rows().size()));
        return toDto(t);
    }

    @Transactional
    public void deleteFactorTable(UUID id) {
        requireWrite();
        FactorFTable t = requireTable(id);
        if (Boq.count("factorFTableId", id) > 0) {
            throw ApiException.conflict("table_in_use", "มี BOQ ใช้ตารางนี้อยู่ ลบไม่ได้");
        }
        t.softDelete();
    }

    @Transactional
    public BigDecimal calc(UUID id, BigDecimal cost) {
        requireTable(id);
        List<FactorF.Point> pts = FactorFTableRow.listFor(id).stream().map(r -> new FactorF.Point(r.cost, r.factor)).toList();
        return FactorF.interpolate(pts, cost);
    }

    private FactorTableDto toDto(FactorFTable t) {
        List<FactorRowDto> rows = new ArrayList<>();
        FactorFTableRow.listFor(t.id).forEach(r -> rows.add(new FactorRowDto(r.cost, r.factor)));
        return new FactorTableDto(t.id, t.name, t.workType, t.advancePct, t.retentionPct, t.interestPct, t.vatPct, t.note, rows);
    }

    private static FactorFTable requireTable(UUID id) {
        FactorFTable t = FactorFTable.findById(id);
        if (t == null) {
            throw ApiException.notFound("ไม่พบตาราง Factor F");
        }
        return t;
    }
}
