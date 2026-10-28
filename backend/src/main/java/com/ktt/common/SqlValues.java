package com.ktt.common;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

/** แปลงค่าจาก native query (ชนิดขึ้นกับไดรเวอร์) ให้เป็นชนิดที่ต้องการ */
public final class SqlValues {

    private SqlValues() {
    }

    public static Instant instant(Object o) {
        if (o == null) {
            return null;
        }
        if (o instanceof Instant i) {
            return i;
        }
        if (o instanceof OffsetDateTime odt) {
            return odt.toInstant();
        }
        if (o instanceof Timestamp ts) {
            return ts.toInstant();
        }
        return Instant.parse(o.toString());
    }

    public static LocalDate date(Object o) {
        if (o == null) {
            return null;
        }
        if (o instanceof LocalDate d) {
            return d;
        }
        if (o instanceof java.sql.Date d) {
            return d.toLocalDate();
        }
        return LocalDate.parse(o.toString());
    }

    public static BigDecimal decimal(Object o) {
        if (o == null) {
            return null;
        }
        if (o instanceof BigDecimal b) {
            return b;
        }
        if (o instanceof Number n) {
            return new BigDecimal(n.toString());
        }
        return new BigDecimal(o.toString());
    }

    public static BigDecimal decimal0(Object o) {
        BigDecimal b = decimal(o);
        return b == null ? BigDecimal.ZERO : b;
    }

    public static long count(Object o) {
        return o == null ? 0 : ((Number) o).longValue();
    }

    public static UUID uuid(Object o) {
        if (o == null) {
            return null;
        }
        if (o instanceof UUID u) {
            return u;
        }
        return UUID.fromString(o.toString());
    }

    public static String str(Object o) {
        return o == null ? null : o.toString();
    }
}
