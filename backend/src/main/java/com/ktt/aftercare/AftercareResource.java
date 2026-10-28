package com.ktt.aftercare;

import com.ktt.aftercare.AftercareDtos.ActionRequest;
import com.ktt.aftercare.AftercareDtos.ResolveRequest;
import com.ktt.aftercare.AftercareDtos.ScheduleRequest;
import com.ktt.aftercare.AftercareDtos.SurveyDto;
import com.ktt.aftercare.AftercareDtos.SurveyRequest;
import com.ktt.aftercare.AftercareDtos.SurveySummary;
import com.ktt.aftercare.AftercareDtos.TicketDto;
import com.ktt.aftercare.AftercareDtos.TicketRequest;
import com.ktt.aftercare.AftercareDtos.TicketRow;
import com.ktt.aftercare.AftercareDtos.TicketStats;
import com.ktt.aftercare.AftercareDtos.WarrantyOverride;
import com.ktt.aftercare.AftercareDtos.WarrantyRow;
import com.ktt.attachment.AttachmentAccess;
import com.ktt.common.ApiException;
import com.ktt.common.PageResult;
import com.ktt.docnum.DocNumberService;
import com.ktt.security.CurrentUser;
import com.ktt.security.Perm;
import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Path("/api/service")
@Produces(MediaType.APPLICATION_JSON)
@RolesAllowed({Perm.SERVICE_READ, Perm.SERVICE_WRITE})
public class AftercareResource {

    @Inject
    AftercareService service;

    // ---------------------------------------------------------------- tickets

    @GET
    @Path("/tickets")
    public PageResult<TicketRow> tickets(@QueryParam("status") String status, @QueryParam("projectId") UUID projectId,
                                         @QueryParam("q") String q,
                                         @QueryParam("page") @DefaultValue("0") @Min(0) int page,
                                         @QueryParam("size") @DefaultValue("20") @Min(1) @Max(200) int size) {
        return service.list(status, projectId, q, page, size);
    }

    @GET
    @Path("/tickets/stats")
    public TicketStats stats() {
        return service.stats();
    }

    @GET
    @Path("/tickets/{id}")
    public TicketDto ticket(@PathParam("id") UUID id) {
        return service.get(id);
    }

    @POST
    @Path("/tickets")
    @RolesAllowed(Perm.SERVICE_WRITE)
    public Response create(@Valid TicketRequest req) {
        return Response.status(201).entity(service.create(req)).build();
    }

    @PUT
    @Path("/tickets/{id}")
    @RolesAllowed(Perm.SERVICE_WRITE)
    public TicketDto update(@PathParam("id") UUID id, @Valid TicketRequest req) {
        return service.update(id, req);
    }

    @POST
    @Path("/tickets/{id}/schedule")
    @RolesAllowed(Perm.SERVICE_WRITE)
    public TicketDto schedule(@PathParam("id") UUID id, @Valid ScheduleRequest req) {
        return service.schedule(id, req);
    }

    @POST
    @Path("/tickets/{id}/resolve")
    @RolesAllowed(Perm.SERVICE_WRITE)
    public TicketDto resolve(@PathParam("id") UUID id, @Valid ResolveRequest req) {
        return service.resolve(id, req);
    }

    @POST
    @Path("/tickets/{id}/action")
    @RolesAllowed(Perm.SERVICE_WRITE)
    public TicketDto action(@PathParam("id") UUID id, @Valid ActionRequest req) {
        return service.action(id, req);
    }

    @DELETE
    @Path("/tickets/{id}")
    @RolesAllowed(Perm.SERVICE_WRITE)
    public Response delete(@PathParam("id") UUID id) {
        service.delete(id);
        return Response.noContent().build();
    }

    // ---------------------------------------------------------------- warranty

    @GET
    @Path("/warranties")
    public List<WarrantyRow> warranties(@QueryParam("state") String state) {
        return service.warranties(state);
    }

    @PUT
    @Path("/warranties/{projectId}")
    @RolesAllowed(Perm.SERVICE_WRITE)
    public Response setWarranty(@PathParam("projectId") UUID projectId, WarrantyOverride req) {
        service.setWarrantyUntil(projectId, req == null ? null : req.warrantyUntil());
        return Response.noContent().build();
    }

    // ---------------------------------------------------------------- surveys

    @GET
    @Path("/surveys")
    public List<SurveyDto> surveys(@QueryParam("projectId") UUID projectId, @QueryParam("from") LocalDate from,
                                   @QueryParam("to") LocalDate to) {
        return service.surveys(projectId, from, to);
    }

    @GET
    @Path("/surveys/summary")
    public SurveySummary summary(@QueryParam("from") LocalDate from, @QueryParam("to") LocalDate to) {
        LocalDate t = to != null ? to : DocNumberService.today();
        LocalDate f = from != null ? from : t.minusMonths(12);
        if (f.isAfter(t)) {
            throw ApiException.badRequest("invalid_range", "ช่วงวันที่ไม่ถูกต้อง");
        }
        return service.summary(f, t);
    }

    @POST
    @Path("/surveys")
    @RolesAllowed(Perm.SERVICE_WRITE)
    public Response createSurvey(@Valid SurveyRequest req) {
        return Response.status(201).entity(service.createSurvey(req)).build();
    }

    @DELETE
    @Path("/surveys/{id}")
    @RolesAllowed(Perm.SERVICE_WRITE)
    public Response deleteSurvey(@PathParam("id") UUID id) {
        service.deleteSurvey(id);
        return Response.noContent().build();
    }

    /** รูปก่อน/หลังซ่อม และเอกสารประกอบงานแจ้งซ่อม */
    @ApplicationScoped
    public static class Attachments implements AttachmentAccess {

        @Inject
        CurrentUser currentUser;

        @Override
        public String ownerType() {
            return "service_ticket";
        }

        @Override
        public void check(UUID ownerId, boolean write) {
            boolean ok = write ? currentUser.can(Perm.SERVICE_WRITE) : currentUser.can(Perm.SERVICE_READ) || currentUser.can(Perm.SERVICE_WRITE);
            if (!ok) {
                throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์ดูไฟล์งานแจ้งซ่อม");
            }
            if (ServiceTicket.findById(ownerId) == null) {
                throw ApiException.notFound("ไม่พบงานแจ้งซ่อม");
            }
        }
    }
}
