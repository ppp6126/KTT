package com.ktt.docnum;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;

import java.time.LocalDate;
import java.time.ZoneId;

/**
 * ออกเลขที่เอกสารรูปแบบ {@code PREFIX YYMM-NNN} (ปี พ.ศ. 2 หลัก + เดือน, นับใหม่ทุกเดือน)
 * เช่น INV 6908-001. ใช้ INSERT ... ON CONFLICT ... RETURNING จึงไม่ซ้ำแม้หลายคนออกพร้อมกัน
 */
@ApplicationScoped
public class DocNumberService {

    public static final ZoneId BANGKOK = ZoneId.of("Asia/Bangkok");

    @Inject
    EntityManager em;

    @Transactional(Transactional.TxType.MANDATORY)
    public String next(String prefix, LocalDate date) {
        String period = period(date);
        Number n = (Number) em.createNativeQuery("""
                        insert into doc_counters (prefix, period, last_no) values (?1, ?2, 1)
                        on conflict (prefix, period) do update set last_no = doc_counters.last_no + 1
                        returning last_no
                        """)
                .setParameter(1, prefix)
                .setParameter(2, period)
                .getSingleResult();
        return format(prefix, period, n.intValue());
    }

    public static String period(LocalDate date) {
        int be = date.getYear() + 543;
        return "%02d%02d".formatted(be % 100, date.getMonthValue());
    }

    public static String format(String prefix, String period, int no) {
        return prefix + " " + period + "-" + (no < 1000 ? "%03d".formatted(no) : String.valueOf(no));
    }

    public static LocalDate today() {
        return LocalDate.now(BANGKOK);
    }
}
