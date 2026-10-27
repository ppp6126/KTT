package com.ktt.pricing;

import com.ktt.audit.AuditService;
import com.ktt.common.ApiException;
import com.ktt.pricing.PricingDtos.ImportError;
import com.ktt.pricing.PricingDtos.ImportResult;
import com.ktt.security.CurrentUser;
import io.quarkus.panache.common.Sort;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * US-06 นำเข้า/ส่งออกฐานราคาเป็น Excel (.xlsx). แถวแรกเป็นหัวตาราง, จับคู่ด้วย "รหัส":
 * มีอยู่แล้ว = อัปเดตราคา (บันทึกประวัติราคา), ยังไม่มี = เพิ่มใหม่.
 * ถ้ามีแถวใดผิด จะไม่บันทึกเลยสักแถว และคืนรายการข้อผิดพลาดให้แก้ไฟล์
 */
@ApplicationScoped
public class PricingExcelService {

    public static final String MATERIALS = "materials";
    public static final String LABOR = "labor";
    public static final String EQUIPMENT = "equipment";

    private static final Map<String, String[]> HEADERS = Map.of(
            MATERIALS, new String[]{"รหัส", "ชื่อวัสดุ", "หน่วย", "หมวด", "ราคาต้นทุน", "ราคาขาย", "ซัพพลายเออร์"},
            LABOR, new String[]{"รหัส", "ชื่อรายการค่าแรง", "ประเภทช่าง", "หน่วย", "ค่าแรงต่อหน่วย"},
            EQUIPMENT, new String[]{"รหัส", "ชื่อเครื่องจักร/อุปกรณ์", "หน่วย", "ราคาต่อหน่วย"});

    static final Map<String, String> TRADE_TH = Map.of(
            "mason", "ช่างปูน", "steel", "ช่างเหล็ก", "electric", "ช่างไฟฟ้า", "plumbing", "ช่างประปา",
            "paint", "ช่างสี", "tile", "ช่างกระเบื้อง", "carpentry", "ช่างไม้", "other", "อื่น ๆ");

    @Inject
    CurrentUser currentUser;

    @Inject
    AuditService audit;

    public static void checkType(String type) {
        if (!HEADERS.containsKey(type)) {
            throw ApiException.badRequest("invalid_type", "ประเภทต้องเป็น materials, labor หรือ equipment");
        }
    }

    // ================================================================= export

    @Transactional
    public byte[] export(String type, boolean templateOnly) {
        checkType(type);
        if (!currentUser.canViewCost()) {
            throw ApiException.forbidden("cost_view_required", "ส่งออกฐานราคาได้เฉพาะผู้ที่มีสิทธิ์เห็นต้นทุน");
        }
        try (Workbook wb = new XSSFWorkbook()) {
            Sheet sh = wb.createSheet(sheetName(type));
            CellStyle head = wb.createCellStyle();
            Font bold = wb.createFont();
            bold.setBold(true);
            head.setFont(bold);
            head.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
            head.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            CellStyle money = wb.createCellStyle();
            money.setDataFormat(wb.createDataFormat().getFormat("#,##0.00"));

            String[] headers = HEADERS.get(type);
            Row hr = sh.createRow(0);
            for (int i = 0; i < headers.length; i++) {
                Cell c = hr.createCell(i);
                c.setCellValue(headers[i]);
                c.setCellStyle(head);
                sh.setColumnWidth(i, i == 1 ? 40 * 256 : 16 * 256);
            }
            if (!templateOnly) {
                int r = 1;
                switch (type) {
                    case MATERIALS -> {
                        Map<UUID, String> cats = new HashMap<>();
                        List<MaterialCategory> categories = MaterialCategory.listAll();
                        categories.forEach(c -> cats.put(c.id, c.name));
                        List<Material> list = Material.listAll(Sort.by("code"));
                        for (Material m : list) {
                            Row row = sh.createRow(r++);
                            row.createCell(0).setCellValue(m.code);
                            row.createCell(1).setCellValue(m.name);
                            row.createCell(2).setCellValue(m.unit);
                            row.createCell(3).setCellValue(m.categoryId == null ? "" : cats.getOrDefault(m.categoryId, ""));
                            num(row, 4, m.costPrice, money);
                            num(row, 5, m.sellPrice, money);
                            row.createCell(6).setCellValue(m.supplierName == null ? "" : m.supplierName);
                        }
                    }
                    case LABOR -> {
                        List<LaborRate> list = LaborRate.listAll(Sort.by("code"));
                        for (LaborRate l : list) {
                            Row row = sh.createRow(r++);
                            row.createCell(0).setCellValue(l.code);
                            row.createCell(1).setCellValue(l.name);
                            row.createCell(2).setCellValue(TRADE_TH.getOrDefault(l.trade, l.trade));
                            row.createCell(3).setCellValue(l.unit);
                            num(row, 4, l.rate, money);
                        }
                    }
                    default -> {
                        List<EquipmentRate> list = EquipmentRate.listAll(Sort.by("code"));
                        for (EquipmentRate e : list) {
                            Row row = sh.createRow(r++);
                            row.createCell(0).setCellValue(e.code);
                            row.createCell(1).setCellValue(e.name);
                            row.createCell(2).setCellValue(e.unit);
                            num(row, 3, e.rate, money);
                        }
                    }
                }
            }
            sh.createFreezePane(0, 1);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            wb.write(out);
            audit.log("pricing", null, AuditService.ACTION_EXPORT, null, Map.of("type", type, "template", templateOnly));
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static void num(Row row, int col, BigDecimal v, CellStyle style) {
        Cell c = row.createCell(col);
        c.setCellValue(v == null ? 0 : v.doubleValue());
        c.setCellStyle(style);
    }

    public static String sheetName(String type) {
        return switch (type) {
            case MATERIALS -> "วัสดุ";
            case LABOR -> "ค่าแรง";
            default -> "เครื่องจักร";
        };
    }

    // ================================================================= import

    private record ParsedRow(int rowNo, String[] cells) {
    }

    @Transactional
    public ImportResult importFile(String type, InputStream in) {
        checkType(type);
        if (!currentUser.canViewCost()) {
            throw ApiException.forbidden("cost_view_required", "นำเข้าฐานราคาได้เฉพาะผู้ที่มีสิทธิ์เห็นต้นทุน");
        }
        List<ParsedRow> rows = read(in, HEADERS.get(type).length);
        List<ImportError> errors = new ArrayList<>();
        Set<String> seenCodes = new HashSet<>();
        for (ParsedRow r : rows) {
            validate(type, r, errors, seenCodes);
        }
        if (!errors.isEmpty()) {
            return new ImportResult(false, 0, 0, 0, errors);
        }
        int[] counts = new int[3]; // created, updated, unchanged
        UUID by = currentUser.id();
        for (ParsedRow r : rows) {
            String[] c = r.cells();
            switch (type) {
                case MATERIALS -> upsertMaterial(c, by, counts);
                case LABOR -> upsertLabor(c, by, counts);
                default -> upsertEquipment(c, by, counts);
            }
        }
        audit.log("pricing", null, AuditService.ACTION_UPDATE, null,
                Map.of("import", type, "created", counts[0], "updated", counts[1], "unchanged", counts[2]));
        return new ImportResult(true, counts[0], counts[1], counts[2], List.of());
    }

    private List<ParsedRow> read(InputStream in, int columns) {
        List<ParsedRow> rows = new ArrayList<>();
        DataFormatter fmt = new DataFormatter();
        try (Workbook wb = WorkbookFactory.create(in)) {
            Sheet sh = wb.getSheetAt(0);
            for (int i = 1; i <= sh.getLastRowNum(); i++) {
                Row row = sh.getRow(i);
                if (row == null) {
                    continue;
                }
                String[] cells = new String[columns];
                boolean empty = true;
                for (int c = 0; c < columns; c++) {
                    Cell cell = row.getCell(c);
                    String v;
                    if (cell == null) {
                        v = "";
                    } else if (cell.getCellType() == CellType.NUMERIC
                            || (cell.getCellType() == CellType.FORMULA && cell.getCachedFormulaResultType() == CellType.NUMERIC)) {
                        v = BigDecimal.valueOf(cell.getNumericCellValue()).stripTrailingZeros().toPlainString();
                    } else {
                        v = fmt.formatCellValue(cell).trim();
                    }
                    cells[c] = v;
                    if (!v.isEmpty()) {
                        empty = false;
                    }
                }
                if (!empty) {
                    rows.add(new ParsedRow(i + 1, cells));
                }
            }
        } catch (IOException | RuntimeException e) {
            throw ApiException.badRequest("invalid_excel", "อ่านไฟล์ไม่ได้ กรุณาใช้ไฟล์ .xlsx ตามแบบฟอร์มที่ดาวน์โหลดจากระบบ");
        }
        if (rows.size() > 20000) {
            throw ApiException.badRequest("too_many_rows", "นำเข้าได้ครั้งละไม่เกิน 20,000 แถว");
        }
        return rows;
    }

    private static void validate(String type, ParsedRow r, List<ImportError> errors, Set<String> seen) {
        String[] c = r.cells();
        if (c[0].isEmpty()) {
            errors.add(new ImportError(r.rowNo(), "ไม่มีรหัส"));
            return;
        }
        if (c[0].length() > 50) {
            errors.add(new ImportError(r.rowNo(), "รหัสยาวเกิน 50 ตัวอักษร"));
        }
        if (!seen.add(c[0].toLowerCase())) {
            errors.add(new ImportError(r.rowNo(), "รหัส " + c[0] + " ซ้ำในไฟล์"));
        }
        if (c[1].isEmpty()) {
            errors.add(new ImportError(r.rowNo(), "ไม่มีชื่อรายการ"));
        }
        switch (type) {
            case MATERIALS -> {
                requireText(r, c[2], "หน่วย", errors);
                requireMoney(r, c[4], "ราคาต้นทุน", errors);
                requireMoney(r, c[5], "ราคาขาย", errors);
            }
            case LABOR -> {
                if (tradeCode(c[2]) == null) {
                    errors.add(new ImportError(r.rowNo(), "ประเภทช่าง \"" + c[2] + "\" ไม่รู้จัก (ใช้: " + String.join(", ", TRADE_TH.values()) + ")"));
                }
                requireText(r, c[3], "หน่วย", errors);
                requireMoney(r, c[4], "ค่าแรง", errors);
            }
            default -> {
                requireText(r, c[2], "หน่วย", errors);
                requireMoney(r, c[3], "ราคา", errors);
            }
        }
    }

    private static void requireText(ParsedRow r, String v, String label, List<ImportError> errors) {
        if (v.isEmpty()) {
            errors.add(new ImportError(r.rowNo(), "ไม่มี" + label));
        }
    }

    private static void requireMoney(ParsedRow r, String v, String label, List<ImportError> errors) {
        BigDecimal d = money(v);
        if (d == null || d.signum() < 0) {
            errors.add(new ImportError(r.rowNo(), label + " \"" + v + "\" ไม่ใช่ตัวเลขที่ถูกต้อง"));
        }
    }

    static BigDecimal money(String v) {
        if (v == null || v.isBlank()) {
            return BigDecimal.ZERO;
        }
        try {
            return new BigDecimal(v.replace(",", "").replace("฿", "").trim()).setScale(2, java.math.RoundingMode.HALF_UP);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    static String tradeCode(String v) {
        String s = v == null ? "" : v.trim().toLowerCase();
        if (s.isEmpty()) {
            return "other";
        }
        for (Map.Entry<String, String> e : TRADE_TH.entrySet()) {
            if (e.getKey().equals(s) || e.getValue().equals(v.trim()) || e.getValue().replace("ช่าง", "").equals(v.trim())) {
                return e.getKey();
            }
        }
        return null;
    }

    private void upsertMaterial(String[] c, UUID by, int[] counts) {
        Material m = Material.findByCode(c[0]);
        UUID catId = null;
        if (!c[3].isEmpty()) {
            MaterialCategory cat = MaterialCategory.findByName(c[3]);
            if (cat == null) {
                cat = new MaterialCategory();
                cat.name = c[3].trim();
                cat.createdBy = by;
                cat.persist();
            }
            catId = cat.id;
        }
        BigDecimal cost = money(c[4]);
        BigDecimal sell = money(c[5]);
        if (m == null) {
            m = new Material();
            m.code = c[0].trim();
            m.createdBy = by;
            fillMaterial(m, c, catId, cost, sell);
            m.priceUpdatedAt = LocalDate.now();
            m.persist();
            counts[0]++;
            return;
        }
        boolean priceChanged = m.costPrice.compareTo(cost) != 0 || m.sellPrice.compareTo(sell) != 0;
        boolean changed = priceChanged || !m.name.equals(c[1]) || !m.unit.equals(c[2])
                || !java.util.Objects.equals(m.categoryId, catId)
                || !java.util.Objects.equals(m.supplierName, c[6].isEmpty() ? null : c[6]);
        if (!changed) {
            counts[2]++;
            return;
        }
        PriceHistory.record("material", m.id, "cost_price", m.costPrice, cost, by);
        PriceHistory.record("material", m.id, "sell_price", m.sellPrice, sell, by);
        fillMaterial(m, c, catId, cost, sell);
        if (priceChanged) {
            m.priceUpdatedAt = LocalDate.now();
        }
        counts[1]++;
    }

    private static void fillMaterial(Material m, String[] c, UUID catId, BigDecimal cost, BigDecimal sell) {
        m.name = c[1].trim();
        m.unit = c[2].trim();
        m.categoryId = catId;
        m.costPrice = cost;
        m.sellPrice = sell;
        m.supplierName = c[6].isEmpty() ? null : c[6].trim();
    }

    private void upsertLabor(String[] c, UUID by, int[] counts) {
        LaborRate l = LaborRate.findByCode(c[0]);
        BigDecimal rate = money(c[4]);
        String trade = tradeCode(c[2]);
        if (l == null) {
            l = new LaborRate();
            l.code = c[0].trim();
            l.name = c[1].trim();
            l.trade = trade;
            l.unit = c[3].trim();
            l.rate = rate;
            l.createdBy = by;
            l.persist();
            counts[0]++;
            return;
        }
        if (l.rate.compareTo(rate) == 0 && l.name.equals(c[1]) && l.unit.equals(c[3]) && l.trade.equals(trade)) {
            counts[2]++;
            return;
        }
        PriceHistory.record("labor", l.id, "rate", l.rate, rate, by);
        l.name = c[1].trim();
        l.trade = trade;
        l.unit = c[3].trim();
        l.rate = rate;
        counts[1]++;
    }

    private void upsertEquipment(String[] c, UUID by, int[] counts) {
        EquipmentRate e = EquipmentRate.findByCode(c[0]);
        BigDecimal rate = money(c[3]);
        if (e == null) {
            e = new EquipmentRate();
            e.code = c[0].trim();
            e.name = c[1].trim();
            e.unit = c[2].trim();
            e.rate = rate;
            e.createdBy = by;
            e.persist();
            counts[0]++;
            return;
        }
        if (e.rate.compareTo(rate) == 0 && e.name.equals(c[1]) && e.unit.equals(c[2])) {
            counts[2]++;
            return;
        }
        PriceHistory.record("equipment", e.id, "rate", e.rate, rate, by);
        e.name = c[1].trim();
        e.unit = c[2].trim();
        e.rate = rate;
        counts[1]++;
    }
}
