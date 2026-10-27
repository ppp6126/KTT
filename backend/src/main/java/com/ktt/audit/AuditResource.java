package com.ktt.audit;

import com.fasterxml.jackson.databind.JsonNode;
import com.ktt.auth.User;
import com.ktt.common.PageResult;
import com.ktt.security.Perm;
import io.quarkus.hibernate.orm.panache.PanacheQuery;
import io.quarkus.panache.common.Page;
import io.quarkus.panache.common.Parameters;
import io.quarkus.panache.common.Sort;
import jakarta.annotation.security.RolesAllowed;
import jakarta.transaction.Transactional;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/** US-17: ผู้บริหารดู Audit Log */
@Path("/api/audit-logs")
@Produces(MediaType.APPLICATION_JSON)
public class AuditResource {

    private static final ZoneId BANGKOK = ZoneId.of("Asia/Bangkok");

    public record AuditRow(
            UUID id,
            Instant createdAt,
            UUID userId,
            String userName,
            String userEmail,
            String entityType,
            UUID entityId,
            String action,
            JsonNode before,
            JsonNode after,
            String ip,
            String userAgent) {
    }

    @GET
    @RolesAllowed(Perm.AUDIT_READ)
    @Transactional
    public PageResult<AuditRow> list(@QueryParam("entityType") String entityType,
                                     @QueryParam("entityId") UUID entityId,
                                     @QueryParam("userId") UUID userId,
                                     @QueryParam("action") String action,
                                     @QueryParam("from") LocalDate from,
                                     @QueryParam("to") LocalDate to,
                                     @QueryParam("page") @DefaultValue("0") @Min(0) int page,
                                     @QueryParam("size") @DefaultValue("50") @Min(1) @Max(200) int size) {
        StringBuilder where = new StringBuilder("1 = 1");
        Parameters p = new Parameters();
        if (entityType != null && !entityType.isBlank()) {
            where.append(" and entityType = :entityType");
            p.and("entityType", entityType);
        }
        if (entityId != null) {
            where.append(" and entityId = :entityId");
            p.and("entityId", entityId);
        }
        if (userId != null) {
            where.append(" and userId = :userId");
            p.and("userId", userId);
        }
        if (action != null && !action.isBlank()) {
            where.append(" and action = :action");
            p.and("action", action);
        }
        if (from != null) {
            where.append(" and createdAt >= :from");
            p.and("from", from.atStartOfDay(BANGKOK).toInstant());
        }
        if (to != null) {
            where.append(" and createdAt < :to");
            p.and("to", to.plusDays(1).atStartOfDay(BANGKOK).toInstant());
        }
        PanacheQuery<AuditLog> q = AuditLog.find(where.toString(), Sort.descending("createdAt"), p);
        long total = q.count();
        List<AuditLog> logs = q.page(Page.of(page, size)).list();

        Set<UUID> userIds = logs.stream().map(l -> l.userId).filter(java.util.Objects::nonNull).collect(Collectors.toSet());
        Map<UUID, String[]> users = new HashMap<>();
        if (!userIds.isEmpty()) {
            // รวมผู้ใช้ที่ถูกลบแล้วด้วย จึงใช้ native query ข้าม @SQLRestriction
            @SuppressWarnings("unchecked")
            List<Object[]> rows = User.getEntityManager()
                    .createNativeQuery("select id, name, email from users where id in (:ids)")
                    .setParameter("ids", userIds)
                    .getResultList();
            for (Object[] r : rows) {
                users.put((UUID) r[0], new String[]{(String) r[1], (String) r[2]});
            }
        }
        List<AuditRow> items = logs.stream().map(l -> {
            String[] u = l.userId == null ? null : users.get(l.userId);
            return new AuditRow(l.id, l.createdAt, l.userId, u == null ? null : u[0], u == null ? null : u[1],
                    l.entityType, l.entityId, l.action, l.before, l.after, l.ip, l.userAgent);
        }).toList();
        return new PageResult<>(items, total, page, size);
    }
}
