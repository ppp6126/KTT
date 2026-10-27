package com.ktt.site;

import java.util.List;

/** ผลตรวจ QC รวม: มีข้อไม่ผ่าน = fail, ยังมีข้อไม่ได้ตรวจ = pending, ผ่านทุกข้อ (ไม่นับ N/A) = pass */
public final class QcRules {

    private QcRules() {
    }

    public static String result(List<SiteDtos.QcItem> items) {
        boolean anyFail = false;
        boolean anyPending = false;
        boolean anyPass = false;
        for (SiteDtos.QcItem i : items) {
            String r = i.result();
            if ("fail".equals(r)) {
                anyFail = true;
            } else if ("pass".equals(r)) {
                anyPass = true;
            } else if (!"na".equals(r)) {
                anyPending = true;
            }
        }
        if (anyFail) {
            return "fail";
        }
        if (anyPending || !anyPass) {
            return "pending";
        }
        return "pass";
    }
}
