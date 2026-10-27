package com.ktt.quotation;

import com.ktt.common.PageResult;
import com.ktt.quotation.QuotationDtos.CreateRequest;
import com.ktt.quotation.QuotationDtos.DecisionRequest;
import com.ktt.quotation.QuotationDtos.PendingApproval;
import com.ktt.quotation.QuotationDtos.QuotationDto;
import com.ktt.quotation.QuotationDtos.QuotationRow;
import com.ktt.quotation.QuotationDtos.ReasonRequest;
import com.ktt.quotation.QuotationDtos.RevisionRow;
import com.ktt.quotation.QuotationDtos.UpdateRequest;
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

@Path("/api")
@Produces(MediaType.APPLICATION_JSON)
public class QuotationResource {

    @Inject
    QuotationService service;

    @GET
    @Path("/quotations")
    @RolesAllowed(Perm.QUOTATION_READ)
    public PageResult<QuotationRow> list(@QueryParam("q") String q, @QueryParam("status") String status,
                                         @QueryParam("leadId") UUID leadId, @QueryParam("customerId") UUID customerId,
                                         @QueryParam("all") @DefaultValue("false") boolean allRevisions,
                                         @QueryParam("page") @DefaultValue("0") @Min(0) int page,
                                         @QueryParam("size") @DefaultValue("20") @Min(1) @Max(200) int size) {
        return service.list(q, status, leadId, customerId, !allRevisions, page, size);
    }

    @GET
    @Path("/quotations/{id}")
    @RolesAllowed(Perm.QUOTATION_READ)
    public QuotationDto get(@PathParam("id") UUID id) {
        return service.get(id);
    }

    @GET
    @Path("/quotations/{id}/revisions")
    @RolesAllowed(Perm.QUOTATION_READ)
    public List<RevisionRow> revisions(@PathParam("id") UUID id) {
        return service.revisions(id);
    }

    @POST
    @Path("/quotations")
    @RolesAllowed(Perm.QUOTATION_WRITE)
    public Response create(@Valid CreateRequest req) {
        return Response.status(201).entity(service.create(req)).build();
    }

    @PUT
    @Path("/quotations/{id}")
    @RolesAllowed(Perm.QUOTATION_WRITE)
    public QuotationDto update(@PathParam("id") UUID id, @Valid UpdateRequest req) {
        return service.update(id, req);
    }

    @POST
    @Path("/quotations/{id}/send")
    @RolesAllowed(Perm.QUOTATION_SEND)
    public QuotationDto send(@PathParam("id") UUID id) {
        return service.send(id);
    }

    @POST
    @Path("/quotations/{id}/accept")
    @RolesAllowed(Perm.QUOTATION_WRITE)
    public QuotationDto accept(@PathParam("id") UUID id) {
        return service.accept(id);
    }

    @POST
    @Path("/quotations/{id}/reject")
    @RolesAllowed(Perm.QUOTATION_WRITE)
    public QuotationDto reject(@PathParam("id") UUID id, @Valid ReasonRequest req) {
        return service.reject(id, req == null ? null : req.reason());
    }

    @POST
    @Path("/quotations/{id}/revise")
    @RolesAllowed(Perm.QUOTATION_WRITE)
    public Response revise(@PathParam("id") UUID id) {
        return Response.status(201).entity(service.revise(id)).build();
    }

    @DELETE
    @Path("/quotations/{id}")
    @RolesAllowed(Perm.QUOTATION_WRITE)
    public Response delete(@PathParam("id") UUID id) {
        service.delete(id);
        return Response.noContent().build();
    }

    /** หน้าพิมพ์เรียกเพื่อบันทึกว่ามีการพิมพ์/ส่งออก PDF */
    @POST
    @Path("/quotations/{id}/printed")
    @RolesAllowed(Perm.QUOTATION_EXPORT)
    public Response printed(@PathParam("id") UUID id) {
        service.logPrint(id);
        return Response.noContent().build();
    }

    // ---------------------------------------------------------------- approvals
    @GET
    @Path("/approvals")
    @RolesAllowed(Perm.QUOTATION_APPROVE)
    public List<PendingApproval> pending() {
        return service.pendingApprovals();
    }

    @POST
    @Path("/approvals/{id}/approve")
    @RolesAllowed(Perm.QUOTATION_APPROVE)
    public QuotationDto approve(@PathParam("id") UUID id, @Valid DecisionRequest req) {
        return service.decide(id, true, req == null ? null : req.comment());
    }

    @POST
    @Path("/approvals/{id}/reject")
    @RolesAllowed(Perm.QUOTATION_APPROVE)
    public QuotationDto rejectApproval(@PathParam("id") UUID id, @Valid DecisionRequest req) {
        return service.decide(id, false, req == null ? null : req.comment());
    }
}
