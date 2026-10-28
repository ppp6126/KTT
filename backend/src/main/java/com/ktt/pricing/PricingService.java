package com.ktt.pricing;

import com.ktt.audit.AuditService;
import com.ktt.common.ApiException;
import com.ktt.common.PageResult;
import com.ktt.common.SqlValues;
import com.ktt.pricing.PricingDtos.CategoryDto;
import com.ktt.pricing.PricingDtos.CategoryRequest;
import com.ktt.pricing.PricingDtos.EquipmentDto;
import com.ktt.pricing.PricingDtos.EquipmentRequest;
import com.ktt.pricing.PricingDtos.LaborDto;
import com.ktt.pricing.PricingDtos.LaborRequest;
import com.ktt.pricing.PricingDtos.MaterialDto;
import com.ktt.pricing.PricingDtos.MaterialRequest;
import com.ktt.pricing.PricingDtos.PickItem;
import com.ktt.pricing.PricingDtos.PriceHistoryDto;
import com.ktt.security.CurrentUser;
import io.quarkus.hibernate.orm.panache.PanacheQuery;
import io.quarkus.panache.common.Page;
import io.quarkus.panache.common.Parameters;
import io.quarkus.panache.common.Sort;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * FR-03 ฐานราคากลาง: วัสดุ ค่าแรง เครื่องจักร พร้อมประวัติราคา.
 * ผู้ที่ไม่มีสิทธิ์ cost.view จะเห็นเฉพาะราคาขายของวัสดุ ไม่เห็นต้นทุน ค่าแรง และค่าเครื่องจักร
 */
@ApplicationScoped
public class PricingService {

    @Inject
    CurrentUser currentUser;

    @Inject
    AuditService audit;

    // ================================================================= categories

    @Transactional
    public List<CategoryDto> categories() {
        Map<UUID, Long> counts = new HashMap<>();
        @SuppressWarnings("unchecked")
        List<Object[]> rows = Material.getEntityManager()
                .createNativeQuery("select category_id, count(*) from materials where deleted_at is null and category_id is not null group by category_id")
                .getResultList();
        for (Object[] r : rows) {
            counts.put((UUID) r[0], ((Number) r[1]).longValue());
        }
        List<MaterialCategory> list = MaterialCategory.listAll(Sort.by("sortOrder").and("name"));
        return list.stream().map(c -> new CategoryDto(c.id, c.name, c.parentId, c.sortOrder, counts.getOrDefault(c.id, 0L))).toList();
    }

    @Transactional
    public CategoryDto saveCategory(UUID id, CategoryRequest req) {
        MaterialCategory c = id == null ? new MaterialCategory() : requireCategory(id);
        MaterialCategory dup = MaterialCategory.findByName(req.name());
        if (dup != null && !dup.id.equals(c.id)) {
            throw ApiException.conflict("duplicate_name", "มีหมวดชื่อนี้แล้ว");
        }
        c.name = req.name().trim();
        c.parentId = req.parentId();
        c.sortOrder = req.sortOrder();
        if (id == null) {
            c.createdBy = currentUser.id();
            c.persist();
        }
        return new CategoryDto(c.id, c.name, c.parentId, c.sortOrder, 0);
    }

    @Transactional
    public void deleteCategory(UUID id) {
        MaterialCategory c = requireCategory(id);
        if (Material.count("categoryId", id) > 0) {
            throw ApiException.conflict("category_in_use", "ยังมีวัสดุอยู่ในหมวดนี้ ย้ายวัสดุออกก่อน");
        }
        c.softDelete();
    }

    // ================================================================= materials

    @Transactional
    public PageResult<MaterialDto> materials(String q, UUID categoryId, int page, int size) {
        StringBuilder w = new StringBuilder("1 = 1");
        Parameters p = new Parameters();
        if (q != null && !q.isBlank()) {
            w.append(" and (lower(name) like :q or lower(code) like :q or lower(supplierName) like :q)");
            p.and("q", "%" + q.trim().toLowerCase() + "%");
        }
        if (categoryId != null) {
            w.append(" and categoryId = :cat");
            p.and("cat", categoryId);
        }
        PanacheQuery<Material> query = Material.find(w.toString(), Sort.by("code"), p);
        long total = query.count();
        Map<UUID, String> catNames = categoryNames();
        List<MaterialDto> items = query.page(Page.of(page, size)).list().stream()
                .map(m -> toDto((Material) m, catNames)).toList();
        return new PageResult<>(items, total, page, size);
    }

    @Transactional
    public MaterialDto material(UUID id) {
        return toDto(requireMaterial(id), categoryNames());
    }

    @Transactional
    public MaterialDto saveMaterial(UUID id, MaterialRequest req) {
        requireCostView();
        Material m = id == null ? new Material() : requireMaterial(id);
        Material dup = Material.findByCode(req.code());
        if (dup != null && !dup.id.equals(m.id)) {
            throw ApiException.conflict("duplicate_code", "รหัสวัสดุ " + req.code().trim() + " มีอยู่แล้ว");
        }
        if (req.categoryId() != null) {
            requireCategory(req.categoryId());
        }
        Map<String, Object> before = id == null ? null : audit(m);
        BigDecimal oldCost = m.costPrice;
        BigDecimal oldSell = m.sellPrice;
        m.code = req.code().trim();
        m.name = req.name().trim();
        m.unit = req.unit().trim();
        m.categoryId = req.categoryId();
        m.supplierName = blankToNull(req.supplierName());
        boolean priceChanged = id == null || oldCost.compareTo(req.costPrice()) != 0 || oldSell.compareTo(req.sellPrice()) != 0;
        m.costPrice = req.costPrice();
        m.sellPrice = req.sellPrice();
        if (priceChanged) {
            m.priceUpdatedAt = LocalDate.now();
        }
        if (id == null) {
            m.createdBy = currentUser.id();
            m.persist();
            audit.log("material", m.id, AuditService.ACTION_CREATE, null, audit(m));
        } else {
            PriceHistory.record("material", m.id, "cost_price", oldCost, m.costPrice, currentUser.id());
            PriceHistory.record("material", m.id, "sell_price", oldSell, m.sellPrice, currentUser.id());
            var d = audit.diff(before, audit(m));
            audit.log("material", m.id, AuditService.ACTION_UPDATE, d[0], d[1]);
        }
        return toDto(m, categoryNames());
    }

    @Transactional
    public void deleteMaterial(UUID id) {
        Material m = requireMaterial(id);
        Map<String, Object> before = audit(m);
        m.softDelete();
        audit.log("material", m.id, AuditService.ACTION_DELETE, before, null);
    }

    // ================================================================= labor

    @Transactional
    public PageResult<LaborDto> labor(String q, String trade, int page, int size) {
        StringBuilder w = new StringBuilder("1 = 1");
        Parameters p = new Parameters();
        if (q != null && !q.isBlank()) {
            w.append(" and (lower(name) like :q or lower(code) like :q)");
            p.and("q", "%" + q.trim().toLowerCase() + "%");
        }
        if (trade != null && !trade.isBlank()) {
            w.append(" and trade = :trade");
            p.and("trade", trade);
        }
        PanacheQuery<LaborRate> query = LaborRate.find(w.toString(), Sort.by("code"), p);
        long total = query.count();
        boolean cost = currentUser.canViewCost();
        List<LaborDto> items = query.page(Page.of(page, size)).list().stream()
                .map(l -> toDto((LaborRate) l, cost)).toList();
        return new PageResult<>(items, total, page, size);
    }

    @Transactional
    public LaborDto saveLabor(UUID id, LaborRequest req) {
        requireCostView();
        LaborRate l = id == null ? new LaborRate() : requireLabor(id);
        LaborRate dup = LaborRate.findByCode(req.code());
        if (dup != null && !dup.id.equals(l.id)) {
            throw ApiException.conflict("duplicate_code", "รหัสค่าแรง " + req.code().trim() + " มีอยู่แล้ว");
        }
        BigDecimal old = l.rate;
        l.code = req.code().trim();
        l.name = req.name().trim();
        l.trade = req.trade();
        l.unit = req.unit().trim();
        l.rate = req.rate();
        if (id == null) {
            l.createdBy = currentUser.id();
            l.persist();
            audit.log("labor_rate", l.id, AuditService.ACTION_CREATE, null, Map.of("code", l.code, "name", l.name, "rate", l.rate));
        } else {
            PriceHistory.record("labor", l.id, "rate", old, l.rate, currentUser.id());
            audit.log("labor_rate", l.id, AuditService.ACTION_UPDATE, Map.of("rate", old), Map.of("rate", l.rate));
        }
        return toDto(l, true);
    }

    @Transactional
    public void deleteLabor(UUID id) {
        LaborRate l = requireLabor(id);
        l.softDelete();
        audit.log("labor_rate", l.id, AuditService.ACTION_DELETE, Map.of("code", l.code, "name", l.name), null);
    }

    // ================================================================= equipment

    @Transactional
    public PageResult<EquipmentDto> equipment(String q, int page, int size) {
        StringBuilder w = new StringBuilder("1 = 1");
        Parameters p = new Parameters();
        if (q != null && !q.isBlank()) {
            w.append(" and (lower(name) like :q or lower(code) like :q)");
            p.and("q", "%" + q.trim().toLowerCase() + "%");
        }
        PanacheQuery<EquipmentRate> query = EquipmentRate.find(w.toString(), Sort.by("code"), p);
        long total = query.count();
        boolean cost = currentUser.canViewCost();
        List<EquipmentDto> items = query.page(Page.of(page, size)).list().stream()
                .map(e -> toDto((EquipmentRate) e, cost)).toList();
        return new PageResult<>(items, total, page, size);
    }

    @Transactional
    public EquipmentDto saveEquipment(UUID id, EquipmentRequest req) {
        requireCostView();
        EquipmentRate e = id == null ? new EquipmentRate() : requireEquipment(id);
        EquipmentRate dup = EquipmentRate.findByCode(req.code());
        if (dup != null && !dup.id.equals(e.id)) {
            throw ApiException.conflict("duplicate_code", "รหัสเครื่องจักร " + req.code().trim() + " มีอยู่แล้ว");
        }
        BigDecimal old = e.rate;
        e.code = req.code().trim();
        e.name = req.name().trim();
        e.unit = req.unit().trim();
        e.rate = req.rate();
        if (id == null) {
            e.createdBy = currentUser.id();
            e.persist();
            audit.log("equipment_rate", e.id, AuditService.ACTION_CREATE, null, Map.of("code", e.code, "name", e.name, "rate", e.rate));
        } else {
            PriceHistory.record("equipment", e.id, "rate", old, e.rate, currentUser.id());
            audit.log("equipment_rate", e.id, AuditService.ACTION_UPDATE, Map.of("rate", old), Map.of("rate", e.rate));
        }
        return toDto(e, true);
    }

    @Transactional
    public void deleteEquipment(UUID id) {
        EquipmentRate e = requireEquipment(id);
        e.softDelete();
        audit.log("equipment_rate", e.id, AuditService.ACTION_DELETE, Map.of("code", e.code, "name", e.name), null);
    }

    // ================================================================= history & picker

    @Transactional
    public List<PriceHistoryDto> history(String itemType, UUID itemId) {
        requireCostViewForHistory(itemType);
        @SuppressWarnings("unchecked")
        List<Object[]> rows = PriceHistory.getEntityManager().createNativeQuery("""
                        select h.id, h.price_field, h.old_price, h.new_price, h.changed_at, u.name
                        from price_history h left join users u on u.id = h.changed_by
                        where h.item_type = ?1 and h.item_id = ?2 order by h.changed_at desc limit 200
                        """)
                .setParameter(1, itemType).setParameter(2, itemId).getResultList();
        List<PriceHistoryDto> out = new ArrayList<>();
        boolean cost = currentUser.canViewCost();
        for (Object[] r : rows) {
            String field = (String) r[1];
            if (!cost && !"sell_price".equals(field)) {
                continue;
            }
            out.add(new PriceHistoryDto(SqlValues.uuid(r[0]), field, SqlValues.decimal(r[2]), SqlValues.decimal(r[3]),
                    SqlValues.instant(r[4]), (String) r[5]));
        }
        return out;
    }

    /** ค้นหาวัสดุ/ค่าแรง/เครื่องจักรเพื่อใส่ใน BOQ (ต้องมี cost.view เพราะ BOQ ใช้ต้นทุน) */
    @Transactional
    public List<PickItem> pick(String type, String q) {
        requireCostView();
        String like = "%" + (q == null ? "" : q.trim().toLowerCase()) + "%";
        List<PickItem> out = new ArrayList<>();
        if (type == null || "material".equals(type)) {
            List<Material> ms = Material.find("lower(name) like ?1 or lower(code) like ?1", Sort.by("code"), like).page(0, 30).list();
            ms.forEach(m -> out.add(new PickItem("material", m.id, m.code, m.name, m.unit, m.costPrice)));
        }
        if (type == null || "labor".equals(type)) {
            List<LaborRate> ls = LaborRate.find("lower(name) like ?1 or lower(code) like ?1", Sort.by("code"), like).page(0, 30).list();
            ls.forEach(l -> out.add(new PickItem("labor", l.id, l.code, l.name, l.unit, l.rate)));
        }
        if (type == null || "equipment".equals(type)) {
            List<EquipmentRate> es = EquipmentRate.find("lower(name) like ?1 or lower(code) like ?1", Sort.by("code"), like).page(0, 30).list();
            es.forEach(e -> out.add(new PickItem("equipment", e.id, e.code, e.name, e.unit, e.rate)));
        }
        return out;
    }

    // ================================================================= helpers

    Map<UUID, String> categoryNames() {
        Map<UUID, String> m = new LinkedHashMap<>();
        List<MaterialCategory> cats = MaterialCategory.listAll();
        cats.forEach(c -> m.put(c.id, c.name));
        return m;
    }

    MaterialDto toDto(Material m, Map<UUID, String> catNames) {
        boolean cost = currentUser.canViewCost();
        return new MaterialDto(m.id, m.code, m.name, m.unit, m.categoryId, m.categoryId == null ? null : catNames.get(m.categoryId),
                cost ? m.costPrice : null, m.sellPrice, m.supplierName, m.priceUpdatedAt);
    }

    static LaborDto toDto(LaborRate l, boolean cost) {
        return new LaborDto(l.id, l.code, l.name, l.trade, l.unit, cost ? l.rate : null, l.updatedAt);
    }

    static EquipmentDto toDto(EquipmentRate e, boolean cost) {
        return new EquipmentDto(e.id, e.code, e.name, e.unit, cost ? e.rate : null, e.updatedAt);
    }

    private void requireCostView() {
        if (!currentUser.canViewCost()) {
            throw ApiException.forbidden("cost_view_required", "แก้ไขราคาได้เฉพาะผู้ที่มีสิทธิ์เห็นต้นทุน");
        }
    }

    private void requireCostViewForHistory(String itemType) {
        if (!"material".equals(itemType) && !currentUser.canViewCost()) {
            throw ApiException.forbidden("cost_view_required", "คุณไม่มีสิทธิ์ดูประวัติต้นทุน");
        }
    }

    private static Map<String, Object> audit(Material m) {
        Map<String, Object> a = new LinkedHashMap<>();
        a.put("code", m.code);
        a.put("name", m.name);
        a.put("unit", m.unit);
        a.put("costPrice", m.costPrice);
        a.put("sellPrice", m.sellPrice);
        a.put("supplierName", m.supplierName);
        return a;
    }

    static MaterialCategory requireCategory(UUID id) {
        MaterialCategory c = MaterialCategory.findById(id);
        if (c == null) {
            throw ApiException.badRequest("invalid_category", "ไม่พบหมวดวัสดุ");
        }
        return c;
    }

    static Material requireMaterial(UUID id) {
        Material m = Material.findById(id);
        if (m == null) {
            throw ApiException.notFound("ไม่พบวัสดุ");
        }
        return m;
    }

    static LaborRate requireLabor(UUID id) {
        LaborRate l = LaborRate.findById(id);
        if (l == null) {
            throw ApiException.notFound("ไม่พบรายการค่าแรง");
        }
        return l;
    }

    static EquipmentRate requireEquipment(UUID id) {
        EquipmentRate e = EquipmentRate.findById(id);
        if (e == null) {
            throw ApiException.notFound("ไม่พบรายการเครื่องจักร");
        }
        return e;
    }

    static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
