package com.ktt.notification;

import com.ktt.common.SqlValues;
import com.ktt.security.CurrentUser;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Path("/api/notifications")
@Produces(MediaType.APPLICATION_JSON)
@Authenticated
public class NotificationResource {

    @Inject
    EntityManager em;

    @Inject
    CurrentUser currentUser;

    public record NotificationDto(UUID id, String type, String title, String body, String link, Instant readAt, Instant createdAt) {
    }

    @GET
    @Transactional
    public List<NotificationDto> list(@QueryParam("unread") @DefaultValue("false") boolean unreadOnly,
                                      @QueryParam("limit") @DefaultValue("30") int limit) {
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("""
                        select id, type, title, body, link, read_at, created_at from notifications
                        where user_id = ?1 and (?2 = false or read_at is null)
                        order by created_at desc limit ?3
                        """)
                .setParameter(1, currentUser.id())
                .setParameter(2, unreadOnly)
                .setParameter(3, Math.min(Math.max(limit, 1), 100))
                .getResultList();
        List<NotificationDto> out = new ArrayList<>();
        for (Object[] r : rows) {
            out.add(new NotificationDto(SqlValues.uuid(r[0]), (String) r[1], (String) r[2], (String) r[3], (String) r[4],
                    SqlValues.instant(r[5]), SqlValues.instant(r[6])));
        }
        return out;
    }

    @GET
    @Path("/count")
    @Transactional
    public Map<String, Long> count() {
        Number n = (Number) em.createNativeQuery("select count(*) from notifications where user_id = ?1 and read_at is null")
                .setParameter(1, currentUser.id())
                .getSingleResult();
        return Map.of("unread", n.longValue());
    }

    @POST
    @Path("/{id}/read")
    @Transactional
    public Response read(@PathParam("id") UUID id) {
        em.createNativeQuery("update notifications set read_at = now() where id = ?1 and user_id = ?2 and read_at is null")
                .setParameter(1, id)
                .setParameter(2, currentUser.id())
                .executeUpdate();
        return Response.noContent().build();
    }

    @POST
    @Path("/read-all")
    @Transactional
    public Response readAll() {
        em.createNativeQuery("update notifications set read_at = now() where user_id = ?1 and read_at is null")
                .setParameter(1, currentUser.id())
                .executeUpdate();
        return Response.noContent().build();
    }
}
