package com.ktt.permit;

import com.ktt.attachment.AttachmentAccess;
import com.ktt.common.ApiException;
import com.ktt.permit.PermitDtos.PermitDto;
import com.ktt.permit.PermitDtos.RenewRequest;
import com.ktt.permit.PermitDtos.SaveRequest;
import com.ktt.permit.PermitDtos.StatusRequest;
import com.ktt.security.CurrentUser;
import com.ktt.security.Perm;
import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.List;
import java.util.UUID;

@Path("/api/permits")
@Produces(MediaType.APPLICATION_JSON)
@RolesAllowed({Perm.PERMIT_READ, Perm.PERMIT_WRITE})
public class PermitResource {

    @Inject
    PermitService service;

    @GET
    public List<PermitDto> list(@QueryParam("filter") String filter, @QueryParam("projectId") UUID projectId,
                                @QueryParam("kind") String kind, @QueryParam("q") String q) {
        return service.list(filter, projectId, kind, q);
    }

    @GET
    @Path("/{id}")
    public PermitDto get(@PathParam("id") UUID id) {
        return service.get(id);
    }

    @POST
    @RolesAllowed(Perm.PERMIT_WRITE)
    public Response create(@Valid SaveRequest req) {
        return Response.status(201).entity(service.save(null, req)).build();
    }

    @PUT
    @Path("/{id}")
    @RolesAllowed(Perm.PERMIT_WRITE)
    public PermitDto update(@PathParam("id") UUID id, @Valid SaveRequest req) {
        return service.save(id, req);
    }

    @POST
    @Path("/{id}/renew")
    @RolesAllowed(Perm.PERMIT_WRITE)
    public PermitDto renew(@PathParam("id") UUID id, @Valid RenewRequest req) {
        return service.renew(id, req);
    }

    @POST
    @Path("/{id}/status")
    @RolesAllowed(Perm.PERMIT_WRITE)
    public PermitDto status(@PathParam("id") UUID id, @Valid StatusRequest req) {
        return service.setStatus(id, req.status());
    }

    @DELETE
    @Path("/{id}")
    @RolesAllowed(Perm.PERMIT_WRITE)
    public Response delete(@PathParam("id") UUID id) {
        service.delete(id);
        return Response.noContent().build();
    }

    /** ไฟล์แนบของใบอนุญาต (สำเนาเอกสาร) */
    @ApplicationScoped
    public static class Attachments implements AttachmentAccess {

        @Inject
        CurrentUser currentUser;

        @Override
        public String ownerType() {
            return "permit";
        }

        @Override
        public void check(UUID ownerId, boolean write) {
            if (!currentUser.can(write ? Perm.PERMIT_WRITE : Perm.PERMIT_READ) && !currentUser.can(Perm.PERMIT_WRITE)) {
                throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์ดูเอกสารนี้");
            }
            if (Permit.findById(ownerId) == null) {
                throw ApiException.notFound("ไม่พบเอกสาร");
            }
        }
    }
}
