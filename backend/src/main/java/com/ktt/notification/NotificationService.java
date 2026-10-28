package com.ktt.notification;

import com.ktt.auth.User;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

/** แจ้งเตือนในระบบ (กระดิ่งมุมขวาบน). เรื่องเดียวกัน (type + ref) แจ้งผู้ใช้คนหนึ่งได้วันละครั้ง */
@ApplicationScoped
public class NotificationService {

    @Inject
    EntityManager em;

    @Transactional(Transactional.TxType.REQUIRED)
    public void notify(UUID userId, String type, String title, String body, String link, String refType, UUID refId) {
        em.createNativeQuery("""
                        insert into notifications (user_id, type, title, body, link, ref_type, ref_id)
                        values (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                        on conflict do nothing
                        """)
                .setParameter(1, userId)
                .setParameter(2, type)
                .setParameter(3, title)
                .setParameter(4, body)
                .setParameter(5, link)
                .setParameter(6, refType)
                .setParameter(7, refId)
                .executeUpdate();
    }

    @Transactional(Transactional.TxType.REQUIRED)
    public void notifyAll(Collection<UUID> userIds, String type, String title, String body, String link, String refType, UUID refId) {
        for (UUID id : userIds) {
            notify(id, type, title, body, link, refType, refId);
        }
    }

    /** ผู้ใช้ที่ใช้งานอยู่และมีสิทธิ์นี้ (owner มีทุกสิทธิ์) */
    @Transactional(Transactional.TxType.REQUIRED)
    public List<UUID> usersWithPermission(String permission) {
        List<User> users = User.list("""
                select distinct u from User u join u.role r left join r.permissions p
                where u.active = true and (r.code = 'owner' or p.code = ?1)
                """, permission);
        return users.stream().map(u -> u.id).toList();
    }
}
