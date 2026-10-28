package com.ktt.common;

import io.quarkus.hibernate.orm.panache.Panache;

import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** ดึงชื่อผู้ใช้หลายคนในคิวรีเดียว (ไว้แสดงผู้สร้าง/ผู้รับผิดชอบในรายการ) */
public final class UserNames {

    private UserNames() {
    }

    public static Map<UUID, String> of(Collection<UUID> ids) {
        Map<UUID, String> out = new HashMap<>();
        Set<UUID> unique = new HashSet<>(ids);
        unique.remove(null);
        if (unique.isEmpty()) {
            return out;
        }
        @SuppressWarnings("unchecked")
        List<Object[]> rows = Panache.getEntityManager().createNativeQuery("select id, name from users where id in (:ids)")
                .setParameter("ids", unique).getResultList();
        rows.forEach(r -> out.put(SqlValues.uuid(r[0]), (String) r[1]));
        return out;
    }

    public static String one(UUID id) {
        return id == null ? null : of(java.util.Collections.singletonList(id)).get(id);
    }

    public static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
