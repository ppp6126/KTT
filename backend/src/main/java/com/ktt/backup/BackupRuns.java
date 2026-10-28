package com.ktt.backup;

import com.ktt.common.SqlValues;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;

import java.util.UUID;

/** บันทึกสถานะการสำรองในธุรกรรมแยก เพื่อให้เห็นสถานะ running/failed แม้การส่งออกล้มเหลว */
@ApplicationScoped
public class BackupRuns {

    @Inject
    EntityManager em;

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public UUID start(String kind, UUID userId) {
        Object id = em.createNativeQuery("insert into backup_runs (kind, created_by) values (?1, ?2) returning id")
                .setParameter(1, kind).setParameter(2, userId).getSingleResult();
        return SqlValues.uuid(id);
    }

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public void finish(UUID id, String status, String file, Long size, Integer tables, Long rows, String error) {
        em.createNativeQuery("""
                        update backup_runs set status = ?2, finished_at = now(), file_name = ?3, size_bytes = ?4, table_count = ?5,
                        row_count = ?6, error = ?7 where id = ?1""")
                .setParameter(1, id).setParameter(2, status).setParameter(3, file).setParameter(4, size)
                .setParameter(5, tables).setParameter(6, rows)
                .setParameter(7, error == null ? null : error.substring(0, Math.min(error.length(), 2000)))
                .executeUpdate();
    }
}
