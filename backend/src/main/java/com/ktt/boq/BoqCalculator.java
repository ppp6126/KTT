package com.ktt.boq;

import com.ktt.common.Money;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * คำนวณ BOQ แบบลำดับชั้น (หมวด → งานย่อย → รายการ):
 * <ul>
 *   <li>แถวที่ไม่มีลูก = รายการ: ค่าวัสดุ = จำนวน × ราคาวัสดุ, ค่าแรง = จำนวน × ค่าแรง, ค่าเครื่องจักร = จำนวน × ค่าเครื่องจักร</li>
 *   <li>ต้นทุนรายการ = ผลรวม 3 ส่วน, ราคาขาย = ต้นทุน × (1 + ค่าบริหาร% + กำไร% + สำรอง%)</li>
 *   <li>แถวที่มีลูก (หมวด/งานย่อย) = ผลรวมของลูก</li>
 *   <li>Margin = (ราคาขาย − ส่วนลด − ต้นทุน) / (ราคาขาย − ส่วนลด)</li>
 * </ul>
 * Factor F ไม่อยู่ในการคำนวณนี้ (ใช้เฉพาะแบบ ปร.5 ดู BoqService.govForm)
 */
public final class BoqCalculator {

    private BoqCalculator() {
    }

    public record Node(String key, String parentKey, BigDecimal quantity, BigDecimal unitMaterialCost,
                       BigDecimal unitLabor, BigDecimal unitEquipment) {
    }

    public record NodeResult(boolean leaf, BigDecimal materialAmount, BigDecimal laborAmount,
                             BigDecimal equipmentAmount, BigDecimal lineCost, BigDecimal lineSell) {
    }

    public record Input(List<Node> nodes, BigDecimal overheadPct, BigDecimal profitPct, BigDecimal contingencyPct,
                        BigDecimal discountAmount, BigDecimal vatPct) {
    }

    public record Result(Map<String, NodeResult> nodes, BigDecimal subtotalCost, BigDecimal markupPct,
                         BigDecimal subtotalSell, BigDecimal discountAmount, BigDecimal vatAmount,
                         BigDecimal grandTotal, BigDecimal marginPct) {
    }

    public static Result compute(Input in) {
        BigDecimal markup = Money.z(in.overheadPct()).add(Money.z(in.profitPct())).add(Money.z(in.contingencyPct()));
        BigDecimal factor = BigDecimal.ONE.add(markup.divide(Money.HUNDRED, 10, RoundingMode.HALF_UP));

        Set<String> parents = new HashSet<>();
        for (Node n : in.nodes()) {
            if (n.parentKey() != null) {
                parents.add(n.parentKey());
            }
        }

        Map<String, BigDecimal[]> sums = new LinkedHashMap<>();
        Map<String, Node> byKey = new LinkedHashMap<>();
        for (Node n : in.nodes()) {
            byKey.put(n.key(), n);
            sums.put(n.key(), new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO});
        }

        BigDecimal totalCost = BigDecimal.ZERO;
        BigDecimal totalSell = BigDecimal.ZERO;
        // รายการ (ใบ) ก่อน แล้วบวกขึ้นไปยังบรรพบุรุษทุกชั้น
        for (Node n : in.nodes()) {
            if (parents.contains(n.key())) {
                continue;
            }
            BigDecimal mat = QuotationLike.mul(n.quantity(), n.unitMaterialCost());
            BigDecimal lab = QuotationLike.mul(n.quantity(), n.unitLabor());
            BigDecimal eqp = QuotationLike.mul(n.quantity(), n.unitEquipment());
            BigDecimal cost = mat.add(lab).add(eqp);
            BigDecimal sell = Money.round2(cost.multiply(factor));
            BigDecimal[] own = sums.get(n.key());
            add(own, mat, lab, eqp, cost, sell);
            totalCost = totalCost.add(cost);
            totalSell = totalSell.add(sell);
            Set<String> seen = new HashSet<>();
            String p = n.parentKey();
            while (p != null && byKey.containsKey(p) && seen.add(p)) {
                add(sums.get(p), mat, lab, eqp, cost, sell);
                p = byKey.get(p).parentKey();
            }
        }

        Map<String, NodeResult> results = new LinkedHashMap<>();
        for (Map.Entry<String, BigDecimal[]> e : sums.entrySet()) {
            BigDecimal[] s = e.getValue();
            results.put(e.getKey(), new NodeResult(!parents.contains(e.getKey()), s[0], s[1], s[2], s[3], s[4]));
        }

        BigDecimal discount = Money.round2(in.discountAmount());
        BigDecimal net = totalSell.subtract(discount);
        BigDecimal vat = Money.pct(net, in.vatPct());
        BigDecimal margin = net.signum() == 0 ? BigDecimal.ZERO
                : net.subtract(totalCost).multiply(Money.HUNDRED).divide(net, 2, RoundingMode.HALF_UP);
        return new Result(results, Money.round2(totalCost), markup, Money.round2(totalSell), discount, vat,
                Money.round2(net.add(vat)), margin);
    }

    private static void add(BigDecimal[] t, BigDecimal mat, BigDecimal lab, BigDecimal eqp, BigDecimal cost, BigDecimal sell) {
        t[0] = t[0].add(mat);
        t[1] = t[1].add(lab);
        t[2] = t[2].add(eqp);
        t[3] = t[3].add(cost);
        t[4] = t[4].add(sell);
    }

    /** เรียงแถวตามลำดับต้นไม้ (DFS) โดยใช้ sortOrder ภายในพ่อเดียวกัน */
    public static <T> List<T> treeOrder(List<T> items, java.util.function.Function<T, String> key,
                                        java.util.function.Function<T, String> parent,
                                        java.util.function.ToIntFunction<T> sortOrder) {
        Map<String, List<T>> children = new LinkedHashMap<>();
        for (T t : items) {
            children.computeIfAbsent(parent.apply(t), k -> new ArrayList<>()).add(t);
        }
        children.values().forEach(l -> l.sort(java.util.Comparator.comparingInt(sortOrder)));
        List<T> out = new ArrayList<>(items.size());
        walk(null, children, key, out, new HashSet<>());
        return out;
    }

    private static <T> void walk(String parentKey, Map<String, List<T>> children, java.util.function.Function<T, String> key,
                                 List<T> out, Set<String> seen) {
        List<T> list = children.get(parentKey);
        if (list == null) {
            return;
        }
        for (T t : list) {
            String k = key.apply(t);
            if (!seen.add(k)) {
                continue;
            }
            out.add(t);
            walk(k, children, key, out, seen);
        }
    }

    /** ตัวช่วยคูณเงิน */
    static final class QuotationLike {
        private QuotationLike() {
        }

        static BigDecimal mul(BigDecimal a, BigDecimal b) {
            return Money.round2(Money.z(a).multiply(Money.z(b)));
        }
    }
}
