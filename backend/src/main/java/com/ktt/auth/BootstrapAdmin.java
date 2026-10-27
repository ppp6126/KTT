package com.ktt.auth;

import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.util.Optional;

/** ตอนเริ่มระบบครั้งแรก (ยังไม่มีผู้ใช้) สร้างผู้ใช้บทบาท owner และบังคับเปลี่ยนรหัสผ่านเมื่อ login */
@ApplicationScoped
public class BootstrapAdmin {

    private static final Logger LOG = Logger.getLogger(BootstrapAdmin.class);

    @Inject
    PasswordHasher hasher;

    @ConfigProperty(name = "ktt.bootstrap.admin-email")
    String email;

    @ConfigProperty(name = "ktt.bootstrap.admin-name")
    String name;

    @ConfigProperty(name = "ktt.bootstrap.admin-password")
    Optional<String> password;

    @Transactional
    void onStart(@Observes StartupEvent ev) {
        if (User.count() > 0) {
            return;
        }
        if (password.isEmpty() || password.get().isBlank()) {
            LOG.warn("ยังไม่มีผู้ใช้ในระบบ: ตั้งค่า KTT_ADMIN_PASSWORD เพื่อสร้างผู้ดูแลคนแรก");
            return;
        }
        Role owner = Role.findByCode(Role.OWNER);
        if (owner == null) {
            LOG.error("ไม่พบบทบาท owner (migration V5 ยังไม่ถูกรัน?)");
            return;
        }
        User u = new User();
        u.email = email.trim().toLowerCase();
        u.name = name;
        u.role = owner;
        u.passwordHash = hasher.hash(password.get());
        u.mustChangePassword = true;
        u.active = true;
        u.persist();
        LOG.infof("สร้างผู้ใช้เริ่มต้น %s (บทบาท owner) แล้ว ระบบจะบังคับเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรก", u.email);
    }
}
