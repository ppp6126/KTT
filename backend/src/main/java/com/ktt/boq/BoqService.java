package com.ktt.boq;

import com.ktt.audit.AuditService;
import com.ktt.boq.BoqDtos.BoqDto;
import com.ktt.boq.BoqDtos.BoqHeaderRequest;
import com.ktt.boq.BoqDtos.BoqSummary;
import com.ktt.boq.BoqDtos.CopyRequest;
import com.ktt.boq.BoqDtos.CreateBoqRequest;
import com.ktt.boq.BoqDtos.Gov4Row;
import com.ktt.boq.BoqDtos.Gov5Row;
import com.ktt.boq.BoqDtos.GovForm;
import com.ktt.boq.BoqDtos.ItemDto;
import com.ktt.boq.BoqDtos.ItemInput;
import com.ktt.boq.BoqDtos.SaveAsTemplateRequest;
import com.ktt.common.ApiException;
import com.ktt.common.Money;
import com.ktt.lead.Lead;
import com.ktt.lead.LeadService;
import com.ktt.pricing.EquipmentRate;
import com.ktt.pricing.LaborRate;
import com.ktt.pricing.Material;
import com.ktt.security.CurrentUser;
import com.ktt.security.Perm;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** FR-04/05/06 BOQ แบบลำดับชั้น, Template, คัดลอก, ราคาขาย/Margin และแบบฟอร์มราชการ ปร.4/ปร.5 */
@ApplicationScoped
public class BoqService {

    public static final int MAX_LEVEL = 3;

    @Inject
    CurrentUser currentUser;

    @Inject
    LeadService leads;

    @Inject
    AuditService audit;

    // ================================================================= query

    @Transactional
    public List<BoqSummary> listForLead(UUID leadId) {
        leads.requireVisible(leadId);
        List<Boq> list = Boq.list("leadId = ?1 order by createdAt", leadId);
        Map<UUID, Long> counts = new HashMap<>();
        if (!list.isEmpty()) {
            @SuppressWarnings("unchecked")
            List<Object[]> rows = Boq.getEntityManager()
                    .createNativeQuery("select boq_id, count(*) from boq_items where boq_id in (:ids) group by boq_id")
                    .setParameter("ids", list.stream().map(b -> b.id).toList()).getResultList();
            rows.forEach(r -> counts.put((UUID) r[0], ((Number) r[1]).longValue()));
        }
        boolean cost = currentUser.canViewCost();
        return list.stream().map(b -> new BoqSummary(b.id, b.leadId, b.name, b.optionLabel, cost ? b.subtotalCost : null,
                b.subtotalSell, b.grandTotal, cost ? b.marginPct : null, counts.getOrDefault(b.id, 0L), b.updatedAt)).toList();
    }

    @Transactional
    public BoqDto get(UUID id) {
        Boq b = requireBoq(id, false);
        return toDto(b, BoqItem.listFor(id));
    }

    // ================================================================= commands

    @Transactional
    public BoqDto create(CreateBoqRequest req) {
        requireWrite();
        Lead lead = leads.requireVisible(req.leadId());
        Boq b = new Boq();
        b.leadId = lead.id;
        b.name = req.name().trim();
        b.optionLabel = blankToNull(req.optionLabel());
        b.createdBy = currentUser.id();
        List<BoqItem> items = new ArrayList<>();
        if (req.copyFromId() != null) {
            Boq src = requireBoq(req.copyFromId(), false);
            copyHeader(src, b);
            b.persist();
            items = copyItems(BoqItem.listFor(src.id), b.id);
        } else {
            b.persist();
            if (req.templateId() != null) {
                items = itemsFromTemplate(req.templateId(), b.id, null, 0);
            }
        }
        recalc(b, items);
        leads.advanceTo(lead.id, "estimating", "เริ่มทำ BOQ");
        audit.log("boq", b.id, AuditService.ACTION_CREATE, null, Map.of("name", b.name, "leadId", lead.id.toString()));
        return toDto(b, items);
    }

    @Transactional
    public BoqDto updateHeader(UUID id, BoqHeaderRequest req) {
        Boq b = requireBoq(id, true);
        if ("manual".equals(req.factorFMode()) && req.factorFValue() == null) {
            throw ApiException.badRequest("factor_required", "กรุณากรอกค่า Factor F");
        }
        if ("table".equals(req.factorFMode())) {
            if (req.factorFTableId() == null || FactorFTable.findById(req.factorFTableId()) == null) {
                throw ApiException.badRequest("factor_table_required", "กรุณาเลือกตาราง Factor F");
            }
        }
        if (!Set.of(0, 1, 2, 3, 5).contains(req.whtPct().intValue())) {
            throw ApiException.badRequest("invalid_wht", "หัก ณ ที่จ่ายต้องเป็น 0, 1, 2, 3 หรือ 5%");
        }
        b.name = req.name().trim();
        b.optionLabel = blankToNull(req.optionLabel());
        b.overheadPct = req.overheadPct();
        b.profitPct = req.profitPct();
        b.contingencyPct = req.contingencyPct();
        b.discountAmount = req.discountAmount();
        b.vatPct = req.vatPct();
        b.whtPct = req.whtPct();
        b.factorFMode = req.factorFMode();
        b.factorFValue = req.factorFValue();
        b.factorFTableId = "table".equals(req.factorFMode()) ? req.factorFTableId() : null;
        b.projectName = blankToNull(req.projectName());
        b.projectLocation = blankToNull(req.projectLocation());
        b.ownerAgency = blankToNull(req.ownerAgency());
        b.notes = blankToNull(req.notes());
        List<BoqItem> items = BoqItem.listFor(id);
        recalc(b, items);
        audit.log("boq", b.id, AuditService.ACTION_UPDATE, null, Map.of("header", b.name));
        return toDto(b, items);
    }

    /** แทนที่รายการทั้งหมดของ BOQ (หน้าแก้ไขส่งต้นไม้ทั้งชุดมา) */
    @Transactional
    public BoqDto saveItems(UUID id, List<ItemInput> inputs) {
        Boq b = requireBoq(id, true);
        validateTree(inputs);
        BoqItem.delete("boqId", id);
        List<BoqItem> items = new ArrayList<>();
        Map<String, UUID> keyToId = new HashMap<>();
        Map<String, Integer> depth = depths(inputs);
        Map<String, Integer> order = new HashMap<>();
        for (ItemInput in : treeOrder(inputs)) {
            BoqItem it = new BoqItem();
            it.boqId = id;
            it.parentId = in.parentKey() == null ? null : keyToId.get(in.parentKey());
            it.level = depth.get(in.key()).shortValue();
            it.sortOrder = order.merge(String.valueOf(in.parentKey()), 1, Integer::sum);
            it.description = in.description().trim();
            it.unit = blankToNull(in.unit());
            it.quantity = Money.z(in.quantity());
            it.materialId = in.materialId();
            it.laborId = in.laborId();
            it.equipmentId = in.equipmentId();
            it.unitMaterialCost = Money.round2(in.unitMaterialCost());
            it.unitMaterial = it.unitMaterialCost;
            it.unitLabor = Money.round2(in.unitLabor());
            it.unitEquipment = Money.round2(in.unitEquipment());
            it.note = blankToNull(in.note());
            it.persist();
            keyToId.put(in.key(), it.id);
            items.add(it);
        }
        recalc(b, items);
        b.updatedAt = java.time.Instant.now();
        audit.log("boq", b.id, AuditService.ACTION_UPDATE, null, Map.of("items", items.size(), "total", b.grandTotal));
        return toDto(b, items);
    }

    @Transactional
    public BoqDto copy(UUID id, CopyRequest req) {
        requireWrite();
        Boq src = requireBoq(id, false);
        UUID leadId = req.leadId() == null ? src.leadId : leads.requireVisible(req.leadId()).id;
        Boq b = new Boq();
        copyHeader(src, b);
        b.leadId = leadId;
        b.name = req.name().trim();
        b.optionLabel = blankToNull(req.optionLabel());
        b.createdBy = currentUser.id();
        b.persist();
        List<BoqItem> items = copyItems(BoqItem.listFor(src.id), b.id);
        recalc(b, items);
        audit.log("boq", b.id, AuditService.ACTION_CREATE, null, Map.of("copiedFrom", src.id.toString(), "name", b.name));
        return toDto(b, items);
    }

    /** ดึงราคาล่าสุดจากฐานราคากลางมาแทน snapshot (เฉพาะแถวที่ผูกกับรายการในฐานราคา) */
    @Transactional
    public BoqDto refreshPrices(UUID id) {
        Boq b = requireBoq(id, true);
        List<BoqItem> items = BoqItem.listFor(id);
        int changed = 0;
        for (BoqItem it : items) {
            if (it.materialId != null) {
                Material m = Material.findById(it.materialId);
                if (m != null && m.costPrice.compareTo(it.unitMaterialCost) != 0) {
                    it.unitMaterialCost = m.costPrice;
                    it.unitMaterial = m.costPrice;
                    changed++;
                }
            }
            if (it.laborId != null) {
                LaborRate l = LaborRate.findById(it.laborId);
                if (l != null && l.rate.compareTo(it.unitLabor) != 0) {
                    it.unitLabor = l.rate;
                    changed++;
                }
            }
            if (it.equipmentId != null) {
                EquipmentRate e = EquipmentRate.findById(it.equipmentId);
                if (e != null && e.rate.compareTo(it.unitEquipment) != 0) {
                    it.unitEquipment = e.rate;
                    changed++;
                }
            }
        }
        recalc(b, items);
        audit.log("boq", b.id, AuditService.ACTION_UPDATE, null, Map.of("refreshPrices", changed));
        return toDto(b, items);
    }

    @Transactional
    public UUID saveAsTemplate(UUID id, SaveAsTemplateRequest req) {
        requireWrite();
        Boq b = requireBoq(id, false);
        BoqTemplate t = new BoqTemplate();
        t.name = req.name().trim();
        t.jobType = blankToNull(req.jobType());
        t.description = blankToNull(req.description());
        t.createdBy = currentUser.id();
        t.persist();
        Map<UUID, UUID> idMap = new HashMap<>();
        for (BoqItem it : orderItems(BoqItem.listFor(b.id))) {
            BoqTemplateItem ti = new BoqTemplateItem();
            ti.templateId = t.id;
            ti.parentId = it.parentId == null ? null : idMap.get(it.parentId);
            ti.level = it.level;
            ti.sortOrder = it.sortOrder;
            ti.description = it.description;
            ti.unit = it.unit;
            ti.quantity = it.quantity;
            ti.materialId = it.materialId;
            ti.laborId = it.laborId;
            ti.equipmentId = it.equipmentId;
            ti.note = it.note;
            ti.persist();
            idMap.put(it.id, ti.id);
        }
        audit.log("boq_template", t.id, AuditService.ACTION_CREATE, null, Map.of("name", t.name, "fromBoq", b.id.toString()));
        return t.id;
    }

    /** แทรกรายการจากแม่แบบเข้า BOQ ที่มีอยู่ (ต่อท้าย) */
    @Transactional
    public BoqDto insertTemplate(UUID boqId, UUID templateId) {
        Boq b = requireBoq(boqId, true);
        List<BoqItem> existing = BoqItem.listFor(boqId);
        int maxRoot = existing.stream().filter(i -> i.parentId == null).mapToInt(i -> i.sortOrder).max().orElse(0);
        List<BoqItem> added = itemsFromTemplate(templateId, boqId, null, maxRoot);
        List<BoqItem> all = new ArrayList<>(existing);
        all.addAll(added);
        recalc(b, all);
        return toDto(b, all);
    }

    @Transactional
    public void delete(UUID id) {
        Boq b = requireBoq(id, true);
        Number used = (Number) Boq.getEntityManager()
                .createNativeQuery("select count(*) from quotations where boq_id = ?1 and deleted_at is null and status <> 'draft'")
                .setParameter(1, id).getSingleResult();
        if (used.longValue() > 0) {
            throw ApiException.conflict("boq_in_use", "BOQ นี้ถูกใช้ออกใบเสนอราคาที่ส่งแล้ว ลบไม่ได้");
        }
        b.softDelete();
        audit.log("boq", b.id, AuditService.ACTION_DELETE, Map.of("name", b.name), null);
    }

    // ================================================================= แบบฟอร์มราชการ

    @Transactional
    public GovForm govForm(UUID id) {
        if (!currentUser.canViewCost()) {
            throw ApiException.forbidden("cost_view_required", "แบบฟอร์ม ปร.4/ปร.5 แสดงต้นทุน ต้องมีสิทธิ์เห็นต้นทุน");
        }
        Boq b = requireBoq(id, false);
        Lead lead = Lead.findById(b.leadId);
        List<BoqItem> items = orderItems(BoqItem.listFor(id));
        BoqCalculator.Result calc = calculate(b, items);
        Map<UUID, String> numbers = numbers(items);

        List<Gov4Row> f4 = new ArrayList<>();
        BigDecimal totalMat = BigDecimal.ZERO;
        BigDecimal totalLab = BigDecimal.ZERO;
        for (BoqItem it : items) {
            BoqCalculator.NodeResult r = calc.nodes().get(it.id.toString());
            BigDecimal matAmt = r.materialAmount().add(r.equipmentAmount());
            if (r.leaf()) {
                totalMat = totalMat.add(matAmt);
                totalLab = totalLab.add(r.laborAmount());
            }
            f4.add(new Gov4Row(numbers.get(it.id), it.level, r.leaf(), it.description,
                    r.leaf() ? it.quantity : null, r.leaf() ? it.unit : null,
                    r.leaf() ? it.unitMaterialCost.add(it.unitEquipment) : null, matAmt,
                    r.leaf() ? it.unitLabor : null, r.laborAmount(), r.lineCost(), it.note));
        }

        BigDecimal totalCost = Money.round2(totalMat.add(totalLab));
        String tableName = null;
        BigDecimal factor = BigDecimal.ONE.setScale(4, RoundingMode.HALF_UP);
        if ("manual".equals(b.factorFMode) && b.factorFValue != null) {
            factor = b.factorFValue.setScale(4, RoundingMode.HALF_UP);
        } else if ("table".equals(b.factorFMode) && b.factorFTableId != null) {
            FactorFTable t = FactorFTable.findById(b.factorFTableId);
            if (t != null) {
                tableName = t.name;
                List<FactorF.Point> points = FactorFTableRow.listFor(t.id).stream()
                        .map(rw -> new FactorF.Point(rw.cost, rw.factor)).toList();
                BigDecimal f = FactorF.interpolate(points, totalCost);
                if (f != null) {
                    factor = f;
                }
            }
        }

        List<Gov5Row> f5 = new ArrayList<>();
        BigDecimal totalPrice = BigDecimal.ZERO;
        for (BoqItem it : items) {
            if (it.parentId != null) {
                continue;
            }
            BigDecimal cost = calc.nodes().get(it.id.toString()).lineCost();
            BigDecimal price = Money.round2(cost.multiply(factor));
            totalPrice = totalPrice.add(price);
            f5.add(new Gov5Row(numbers.get(it.id), it.description, cost, factor, price));
        }
        // ราคากลางนิยมปัดเศษลงหลักร้อย
        BigDecimal rounded = Money.floorTo(totalPrice, Money.HUNDRED);
        return new GovForm(b.projectName, b.projectLocation, b.ownerAgency,
                lead == null ? null : lead.customer.name, b.name, f4, Money.round2(totalMat), Money.round2(totalLab),
                totalCost, f5, b.factorFMode, tableName, factor, Money.round2(totalPrice), rounded);
    }

    // ================================================================= internals

    @Transactional(Transactional.TxType.MANDATORY)
    public Boq requireBoq(UUID id, boolean write) {
        if (write) {
            requireWrite();
        }
        Boq b = Boq.findById(id);
        if (b == null) {
            throw ApiException.notFound("ไม่พบ BOQ");
        }
        leads.requireVisible(b.leadId);
        return b;
    }

    private void requireWrite() {
        if (!currentUser.can(Perm.BOQ_WRITE) || !currentUser.canViewCost()) {
            throw ApiException.forbidden("forbidden", "แก้ไข BOQ ได้เฉพาะผู้ที่มีสิทธิ์ BOQ และเห็นต้นทุน");
        }
    }

    BoqCalculator.Result calculate(Boq b, List<BoqItem> items) {
        List<BoqCalculator.Node> nodes = items.stream().map(i -> new BoqCalculator.Node(i.id.toString(),
                i.parentId == null ? null : i.parentId.toString(), i.quantity, i.unitMaterialCost, i.unitLabor,
                i.unitEquipment)).toList();
        return BoqCalculator.compute(new BoqCalculator.Input(nodes, b.overheadPct, b.profitPct, b.contingencyPct,
                b.discountAmount, b.vatPct));
    }

    /** คำนวณและบันทึกยอดลงแถวและหัว BOQ */
    void recalc(Boq b, List<BoqItem> items) {
        BoqCalculator.Result r = calculate(b, items);
        for (BoqItem it : items) {
            BoqCalculator.NodeResult n = r.nodes().get(it.id.toString());
            it.lineCost = n.lineCost();
            it.lineSell = n.lineSell();
        }
        b.subtotalCost = r.subtotalCost();
        b.subtotalSell = r.subtotalSell();
        b.grandTotal = r.grandTotal();
        b.marginPct = r.marginPct().max(new BigDecimal("-999.99")).min(new BigDecimal("999.99"));
    }

    BoqDto toDto(Boq b, List<BoqItem> raw) {
        boolean cost = currentUser.canViewCost();
        List<BoqItem> items = orderItems(raw);
        BoqCalculator.Result r = calculate(b, items);
        Map<UUID, String> numbers = numbers(items);
        List<ItemDto> dtos = new ArrayList<>();
        for (BoqItem it : items) {
            BoqCalculator.NodeResult n = r.nodes().get(it.id.toString());
            BigDecimal unitSell = n.leaf() && it.quantity.signum() > 0
                    ? n.lineSell().divide(it.quantity, 2, RoundingMode.HALF_UP) : null;
            dtos.add(new ItemDto(it.id, it.parentId, it.level, it.sortOrder, numbers.get(it.id), it.description, it.unit,
                    it.quantity, it.materialId, it.laborId, it.equipmentId,
                    cost ? it.unitMaterialCost : null, cost ? it.unitLabor : null, cost ? it.unitEquipment : null,
                    cost ? n.materialAmount() : null, cost ? n.laborAmount() : null, cost ? n.equipmentAmount() : null,
                    cost ? n.lineCost() : null, unitSell, n.lineSell(), n.leaf(), it.note));
        }
        Lead lead = Lead.findById(b.leadId);
        return new BoqDto(b.id, b.leadId, lead == null ? null : lead.title,
                lead == null ? null : lead.customer.id, lead == null ? null : lead.customer.name,
                b.name, b.optionLabel, cost ? b.overheadPct : null, cost ? b.profitPct : null,
                cost ? b.contingencyPct : null, b.discountAmount, b.vatPct, b.whtPct,
                cost ? r.subtotalCost() : null, r.subtotalSell(), r.vatAmount(), r.grandTotal(),
                cost ? r.marginPct() : null, b.factorFMode, cost ? b.factorFValue : null, b.factorFTableId,
                b.projectName, b.projectLocation, b.ownerAgency, b.notes, cost, dtos, b.updatedAt);
    }

    static List<BoqItem> orderItems(List<BoqItem> items) {
        return BoqCalculator.treeOrder(items, i -> i.id.toString(), i -> i.parentId == null ? null : i.parentId.toString(),
                i -> i.sortOrder);
    }

    /** เลขลำดับ 1, 1.1, 1.1.1 ตามตำแหน่งในต้นไม้ (items ต้องเรียงแบบ DFS แล้ว) */
    static Map<UUID, String> numbers(List<BoqItem> ordered) {
        Map<UUID, String> out = new LinkedHashMap<>();
        Map<UUID, Integer> childCount = new HashMap<>();
        int root = 0;
        for (BoqItem it : ordered) {
            if (it.parentId == null) {
                out.put(it.id, String.valueOf(++root));
            } else {
                int n = childCount.merge(it.parentId, 1, Integer::sum);
                out.put(it.id, out.getOrDefault(it.parentId, "?") + "." + n);
            }
        }
        return out;
    }

    private static void validateTree(List<ItemInput> inputs) {
        Set<String> keys = new HashSet<>();
        for (ItemInput in : inputs) {
            if (!keys.add(in.key())) {
                throw ApiException.badRequest("duplicate_key", "ข้อมูลแถวซ้ำ กรุณาโหลดหน้าใหม่");
            }
        }
        for (ItemInput in : inputs) {
            if (in.parentKey() != null && !keys.contains(in.parentKey())) {
                throw ApiException.badRequest("invalid_parent", "โครงสร้าง BOQ ไม่ถูกต้อง (ไม่พบหมวดแม่)");
            }
        }
        Map<String, Integer> d = depths(inputs);
        for (Map.Entry<String, Integer> e : d.entrySet()) {
            if (e.getValue() > MAX_LEVEL) {
                throw ApiException.badRequest("too_deep", "BOQ มีได้ไม่เกิน 3 ชั้น (หมวด → งานย่อย → รายการ)");
            }
        }
    }

    private static Map<String, Integer> depths(List<ItemInput> inputs) {
        Map<String, String> parent = new HashMap<>();
        inputs.forEach(i -> parent.put(i.key(), i.parentKey()));
        Map<String, Integer> out = new HashMap<>();
        for (ItemInput in : inputs) {
            int depth = 1;
            String p = in.parentKey();
            Set<String> seen = new HashSet<>();
            while (p != null) {
                if (!seen.add(p)) {
                    throw ApiException.badRequest("cycle", "โครงสร้าง BOQ วนซ้ำ");
                }
                depth++;
                p = parent.get(p);
            }
            out.put(in.key(), depth);
        }
        return out;
    }

    private static List<ItemInput> treeOrder(List<ItemInput> inputs) {
        // คงลำดับตามที่หน้าเว็บส่งมาภายในพ่อเดียวกัน
        Map<ItemInput, Integer> pos = new HashMap<>();
        for (int i = 0; i < inputs.size(); i++) {
            pos.put(inputs.get(i), i);
        }
        return BoqCalculator.treeOrder(inputs, ItemInput::key, ItemInput::parentKey, pos::get);
    }

    private void copyHeader(Boq src, Boq b) {
        b.overheadPct = src.overheadPct;
        b.profitPct = src.profitPct;
        b.contingencyPct = src.contingencyPct;
        b.discountAmount = src.discountAmount;
        b.vatPct = src.vatPct;
        b.whtPct = src.whtPct;
        b.factorFMode = src.factorFMode;
        b.factorFValue = src.factorFValue;
        b.factorFTableId = src.factorFTableId;
        b.projectName = src.projectName;
        b.projectLocation = src.projectLocation;
        b.ownerAgency = src.ownerAgency;
        b.notes = src.notes;
    }

    private static List<BoqItem> copyItems(List<BoqItem> src, UUID boqId) {
        Map<UUID, UUID> idMap = new HashMap<>();
        List<BoqItem> out = new ArrayList<>();
        for (BoqItem s : orderItems(src)) {
            BoqItem it = new BoqItem();
            it.boqId = boqId;
            it.parentId = s.parentId == null ? null : idMap.get(s.parentId);
            it.level = s.level;
            it.sortOrder = s.sortOrder;
            it.description = s.description;
            it.unit = s.unit;
            it.quantity = s.quantity;
            it.materialId = s.materialId;
            it.laborId = s.laborId;
            it.equipmentId = s.equipmentId;
            it.unitMaterialCost = s.unitMaterialCost;
            it.unitMaterial = s.unitMaterial;
            it.unitLabor = s.unitLabor;
            it.unitEquipment = s.unitEquipment;
            it.note = s.note;
            it.persist();
            idMap.put(s.id, it.id);
            out.add(it);
        }
        return out;
    }

    /** สร้างแถว BOQ จากแม่แบบ โดยใช้ราคาปัจจุบันจากฐานราคากลาง */
    private static List<BoqItem> itemsFromTemplate(UUID templateId, UUID boqId, UUID parent, int rootOffset) {
        if (BoqTemplate.findById(templateId) == null) {
            throw ApiException.badRequest("invalid_template", "ไม่พบแม่แบบ");
        }
        List<BoqTemplateItem> src = BoqCalculator.treeOrder(BoqTemplateItem.listFor(templateId), i -> i.id.toString(),
                i -> i.parentId == null ? null : i.parentId.toString(), i -> i.sortOrder);
        Map<UUID, UUID> idMap = new HashMap<>();
        List<BoqItem> out = new ArrayList<>();
        for (BoqTemplateItem s : src) {
            BoqItem it = new BoqItem();
            it.boqId = boqId;
            it.parentId = s.parentId == null ? parent : idMap.get(s.parentId);
            it.level = s.level;
            it.sortOrder = s.parentId == null ? s.sortOrder + rootOffset : s.sortOrder;
            it.description = s.description;
            it.unit = s.unit;
            it.quantity = s.quantity;
            it.materialId = s.materialId;
            it.laborId = s.laborId;
            it.equipmentId = s.equipmentId;
            it.note = s.note;
            if (s.materialId != null) {
                Material m = Material.findById(s.materialId);
                if (m != null) {
                    it.unitMaterialCost = m.costPrice;
                    it.unitMaterial = m.costPrice;
                }
            }
            if (s.laborId != null) {
                LaborRate l = LaborRate.findById(s.laborId);
                if (l != null) {
                    it.unitLabor = l.rate;
                }
            }
            if (s.equipmentId != null) {
                EquipmentRate e = EquipmentRate.findById(s.equipmentId);
                if (e != null) {
                    it.unitEquipment = e.rate;
                }
            }
            it.persist();
            idMap.put(s.id, it.id);
            out.add(it);
        }
        return out;
    }

    static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
