package com.ktt.lead;

import com.ktt.common.PageResult;
import com.ktt.lead.LeadDtos.ActivityDto;
import com.ktt.lead.LeadDtos.ActivityRequest;
import com.ktt.lead.LeadDtos.LeadDetail;
import com.ktt.lead.LeadDtos.LeadRequest;
import com.ktt.lead.LeadDtos.LeadRow;
import com.ktt.lead.LeadDtos.PipelineSummary;
import com.ktt.lead.LeadDtos.StatusRequest;
import com.ktt.security.Perm;
import jakarta.annotation.security.RolesAllowed;
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

import java.util.List;
import java.util.UUID;

@Path("/api/leads")
@Produces(MediaType.APPLICATION_JSON)
public class LeadResource {

    @Inject
    LeadService service;

    @GET
    @RolesAllowed({Perm.LEAD_READ, Perm.LEAD_READ_ALL})
    public PageResult<LeadRow> list(@QueryParam("q") String q,
                                    @QueryParam("status") String status,
                                    @QueryParam("ownerId") UUID ownerId,
                                    @QueryParam("customerId") UUID customerId,
                                    @QueryParam("sort") String sort,
                                    @QueryParam("page") @DefaultValue("0") @Min(0) int page,
                                    @QueryParam("size") @DefaultValue("20") @Min(1) @Max(200) int size) {
        return service.list(q, status, ownerId, customerId, sort, page, size);
    }

    @GET
    @Path("/board")
    @RolesAllowed({Perm.LEAD_READ, Perm.LEAD_READ_ALL})
    public List<LeadRow> board(@QueryParam("q") String q, @QueryParam("ownerId") UUID ownerId) {
        return service.board(q, ownerId);
    }

    @GET
    @Path("/summary")
    @RolesAllowed({Perm.LEAD_READ, Perm.LEAD_READ_ALL})
    public List<PipelineSummary> summary() {
        return service.summary();
    }

    @GET
    @Path("/{id}")
    @RolesAllowed({Perm.LEAD_READ, Perm.LEAD_READ_ALL})
    public LeadDetail get(@PathParam("id") UUID id) {
        return service.get(id);
    }

    @POST
    @RolesAllowed(Perm.LEAD_WRITE)
    public Response create(@Valid LeadRequest req) {
        return Response.status(201).entity(service.create(req)).build();
    }

    @PUT
    @Path("/{id}")
    @RolesAllowed(Perm.LEAD_WRITE)
    public LeadRow update(@PathParam("id") UUID id, @Valid LeadRequest req) {
        return service.update(id, req);
    }

    @PUT
    @Path("/{id}/status")
    @RolesAllowed(Perm.LEAD_WRITE)
    public LeadRow changeStatus(@PathParam("id") UUID id, @Valid StatusRequest req) {
        return service.changeStatus(id, req);
    }

    @DELETE
    @Path("/{id}")
    @RolesAllowed(Perm.LEAD_DELETE)
    public Response delete(@PathParam("id") UUID id) {
        service.delete(id);
        return Response.noContent().build();
    }

    @POST
    @Path("/{id}/activities")
    @RolesAllowed(Perm.LEAD_WRITE)
    public Response addActivity(@PathParam("id") UUID id, @Valid ActivityRequest req) {
        ActivityDto dto = service.addActivity(id, req);
        return Response.status(201).entity(dto).build();
    }

    @DELETE
    @Path("/{id}/activities/{activityId}")
    @RolesAllowed(Perm.LEAD_WRITE)
    public Response deleteActivity(@PathParam("id") UUID id, @PathParam("activityId") UUID activityId) {
        service.deleteActivity(id, activityId);
        return Response.noContent().build();
    }
}
