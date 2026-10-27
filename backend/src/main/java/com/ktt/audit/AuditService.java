package com.ktt.audit;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ktt.common.RequestInfo;
import com.ktt.security.CurrentUser;
import io.quarkus.arc.Arc;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;

import java.util.Map;
import java.util.UUID;

/**
 * เขียน audit log ใน transaction เดียวกับการแก้ไขข้อมูล (rollback พร้อมกัน).
 * ฟิลด์ที่เป็นความลับ (password_hash, totp_secret, token) ต้องไม่ถูกส่งเข้ามา
 */
@ApplicationScoped
public class AuditService {

    public static final String ACTION_CREATE = "create";
    public static final String ACTION_UPDATE = "update";
    public static final String ACTION_DELETE = "delete";
    public static final String ACTION_APPROVE = "approve";
    public static final String ACTION_REJECT = "reject";
    public static final String ACTION_EXPORT = "export";
    public static final String ACTION_LOGIN = "login";
    public static final String ACTION_LOGIN_FAILED = "login_failed";
    public static final String ACTION_LOGOUT = "logout";
    public static final String ACTION_LOCKED = "locked";
    public static final String ACTION_MFA_ENABLED = "mfa_enabled";
    public static final String ACTION_MFA_DISABLED = "mfa_disabled";
    public static final String ACTION_PASSWORD_CHANGED = "password_changed";
    public static final String ACTION_PASSWORD_RESET = "password_reset";
    public static final String ACTION_SESSION_REVOKED = "session_revoked";

    @Inject
    ObjectMapper mapper;

    @Inject
    CurrentUser currentUser;

    @Inject
    RequestInfo requestInfo;

    /** บันทึกโดยใช้ผู้ใช้ปัจจุบันเป็นผู้กระทำ */
    @Transactional(Transactional.TxType.MANDATORY)
    public void log(String entityType, UUID entityId, String action, Object before, Object after) {
        UUID actor = isRequestActive() && currentUser.isAuthenticated() ? currentUser.id() : null;
        logAs(actor, entityType, entityId, action, before, after);
    }

    /** บันทึกโดยระบุผู้กระทำเอง (เช่น ตอน login ที่ยังไม่มี token) */
    @Transactional(Transactional.TxType.MANDATORY)
    public void logAs(UUID actorId, String entityType, UUID entityId, String action, Object before, Object after) {
        AuditLog log = new AuditLog();
        log.userId = actorId;
        log.entityType = entityType;
        log.entityId = entityId;
        log.action = action;
        log.before = toJson(before);
        log.after = toJson(after);
        if (isRequestActive()) {
            log.ip = requestInfo.ip();
            log.userAgent = requestInfo.userAgent();
        }
        log.persist();
    }

    /** สรุปเฉพาะฟิลด์ที่เปลี่ยน: คืน [before, after] ที่มีเฉพาะ key ที่ค่าต่างกัน */
    public JsonNode[] diff(Object before, Object after) {
        JsonNode b = toJson(before);
        JsonNode a = toJson(after);
        if (!(b instanceof ObjectNode bo) || !(a instanceof ObjectNode ao)) {
            return new JsonNode[]{b, a};
        }
        ObjectNode db = mapper.createObjectNode();
        ObjectNode da = mapper.createObjectNode();
        ao.fieldNames().forEachRemaining(name -> {
            JsonNode ov = bo.get(name);
            JsonNode nv = ao.get(name);
            if (ov == null ? nv != null && !nv.isNull() : !ov.equals(nv)) {
                db.set(name, ov);
                da.set(name, nv);
            }
        });
        return new JsonNode[]{db, da};
    }

    private JsonNode toJson(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof JsonNode node) {
            return node;
        }
        if (value instanceof Map<?, ?> map) {
            return mapper.valueToTree(map);
        }
        return mapper.valueToTree(value);
    }

    private static boolean isRequestActive() {
        return Arc.container() != null && Arc.container().requestContext().isActive();
    }
}
