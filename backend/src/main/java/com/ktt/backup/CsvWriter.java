package com.ktt.backup;

import java.util.List;

/** เขียน CSV ตาม RFC 4180: ครอบด้วย " เมื่อมี , " หรือขึ้นบรรทัด; null = ช่องว่าง */
public final class CsvWriter {

    private CsvWriter() {
    }

    public static String cell(String v) {
        if (v == null) {
            return "";
        }
        boolean quote = v.indexOf(',') >= 0 || v.indexOf('"') >= 0 || v.indexOf('\n') >= 0 || v.indexOf('\r') >= 0
                || (!v.isEmpty() && (v.charAt(0) == ' ' || v.charAt(v.length() - 1) == ' '));
        return quote ? '"' + v.replace("\"", "\"\"") + '"' : v;
    }

    public static String line(List<String> values) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append(cell(values.get(i)));
        }
        return sb.append("\r\n").toString();
    }

    /** อาร์เรย์ของ PostgreSQL เขียนเป็นรูปแบบ {a,b} */
    public static String array(Object arr) {
        if (arr instanceof Object[] a) {
            StringBuilder sb = new StringBuilder("{");
            for (int i = 0; i < a.length; i++) {
                if (i > 0) {
                    sb.append(',');
                }
                sb.append(a[i]);
            }
            return sb.append('}').toString();
        }
        return String.valueOf(arr);
    }
}
