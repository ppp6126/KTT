package com.ktt.user;

import com.ktt.audit.AuditService;
import com.ktt.auth.Permission;
import com.ktt.auth.Role;
import com.ktt.auth.User;
import com.ktt.common.ApiException;
import com.ktt.security.CurrentUser;
import com.ktt.user.UserDtos.PermissionDto;
import com.ktt.user.UserDtos.RoleDto;
import com.ktt.user.UserDtos.RoleRequest;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * จัดการบทบาท. การเปลี่ยนสิทธิ์ของบทบาทมีผลกับผู้ใช้เมื่อ access token ถูกออกใหม่ (ภายใน 15 นาที)
 */
@ApplicationScoped
public class RoleService {

    @Inject
    AuditService audit;

    @Inject
    CurrentUser currentUser;

    @Transactional
    public List<PermissionDto> permissions() {
        return Permission.listOrdered().stream()
                .map(p -> new PermissionDto(p.code, p.module, p.action, p.description))
                .toList();
    }

    @Transactional
    public List<RoleDto> list() {
        List<Role> roles = Role.listAll(io.quarkus.panache.common.Sort.by("name"));
        return roles.stream().map(RoleService::toDto).toList();
    }

    @Transactional
    public RoleDto get(UUID id) {
        return toDto(require(id));
    }

    @Transactional
    public RoleDto create(RoleRequest req) {
        String code = normalizeCode(req.code());
        if (Role.findByCode(code) != null) {
            throw ApiException.conflict("role_code_taken", "รหัสบทบาทนี้มีอยู่แล้ว");
        }
        Role r = new Role();
        r.code = code;
        r.name = req.name().trim();
        r.description = req.description();
        r.system = false;
        r.permissions = resolve(req.permissions());
        r.createdBy = currentUser.id();
        r.persist();
        audit.log("role", r.id, AuditService.ACTION_CREATE, null, auditView(r));
        return toDto(r);
    }

    @Transactional
    public RoleDto update(UUID id, RoleRequest req) {
        Role r = require(id);
        if (Role.OWNER.equals(r.code)) {
            throw ApiException.badRequest("owner_role_locked", "บทบาทเจ้าของ/ผู้บริหารมีทุกสิทธิ์เสมอ แก้ไขไม่ได้");
        }
        Map<String, Object> before = auditView(r);
        if (!r.system) {
            String code = normalizeCode(req.code());
            Role other = Role.findByCode(code);
            if (other != null && !other.id.equals(r.id)) {
                throw ApiException.conflict("role_code_taken", "รหัสบทบาทนี้มีอยู่แล้ว");
            }
            r.code = code;
        }
        r.name = req.name().trim();
        r.description = req.description();
        r.permissions = resolve(req.permissions());
        var d = audit.diff(before, auditView(r));
        audit.log("role", r.id, AuditService.ACTION_UPDATE, d[0], d[1]);
        return toDto(r);
    }

    @Transactional
    public void delete(UUID id) {
        Role r = require(id);
        if (r.system) {
            throw ApiException.badRequest("system_role", "ไม่สามารถลบบทบาทตั้งต้นของระบบได้");
        }
        if (User.count("role.id", r.id) > 0) {
            throw ApiException.badRequest("role_in_use", "ยังมีผู้ใช้อยู่ในบทบาทนี้ กรุณาย้ายผู้ใช้ก่อน");
        }
        Map<String, Object> before = auditView(r);
        r.permissions.clear();
        r.softDelete();
        audit.log("role", r.id, AuditService.ACTION_DELETE, before, null);
    }

    private static Set<Permission> resolve(List<String> codes) {
        Set<Permission> result = new HashSet<>();
        if (codes == null || codes.isEmpty()) {
            return result;
        }
        List<Permission> found = Permission.list("code in ?1", codes);
        if (found.size() != new HashSet<>(codes).size()) {
            throw ApiException.badRequest("invalid_permission", "มีรหัสสิทธิ์ที่ไม่รู้จัก");
        }
        result.addAll(found);
        return result;
    }

    private static String normalizeCode(String code) {
        String c = code.trim().toLowerCase().replaceAll("[^a-z0-9_]", "_");
        if (c.isBlank()) {
            throw ApiException.badRequest("invalid_code", "รหัสบทบาทใช้ได้เฉพาะ a-z 0-9 และ _");
        }
        return c;
    }

    private static Role require(UUID id) {
        Role r = Role.findById(id);
        if (r == null) {
            throw ApiException.notFound("ไม่พบบทบาท");
        }
        return r;
    }

    private static RoleDto toDto(Role r) {
        return new RoleDto(r.id, r.code, r.name, r.description, r.system, r.permissionCodes(),
                User.count("role.id", r.id));
    }

    private static Map<String, Object> auditView(Role r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("code", r.code);
        m.put("name", r.name);
        m.put("description", r.description);
        m.put("permissions", r.permissionCodes());
        return m;
    }
}
