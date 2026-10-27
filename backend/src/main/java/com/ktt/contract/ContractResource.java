package com.ktt.contract;

import com.ktt.common.PageResult;
import com.ktt.contract.ContractDtos.ContractDto;
import com.ktt.contract.ContractDtos.ContractRow;
import com.ktt.contract.ContractDtos.CreateRequest;
import com.ktt.contract.ContractDtos.FromQuotationRequest;
import com.ktt.contract.ContractDtos.RetentionRequest;
import com.ktt.contract.ContractDtos.SaveMilestonesRequest;
import com.ktt.contract.ContractDtos.StatusRequest;
import com.ktt.contract.ContractDtos.UpdateRequest;
import com.ktt.contract.ContractDtos.VoDecisionRequest;
import com.ktt.contract.ContractDtos.VoDto;
import com.ktt.contract.ContractDtos.VoRequest;
import com.ktt.contract.ContractDtos.VoRow;
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
public class ContractResource {

    @Inject
    ContractService contracts;

    @Inject
    ChangeOrderService changeOrders;

    @GET
    @Path("/contracts")
    @RolesAllowed({Perm.CONTRACT_READ, Perm.FINANCE_READ})
    public PageResult<ContractRow> list(@QueryParam("q") String q, @QueryParam("status") String status,
                                        @QueryParam("page") @DefaultValue("0") @Min(0) int page,
                                        @QueryParam("size") @DefaultValue("20") @Min(1) @Max(200) int size) {
        return contracts.list(q, status, page, size);
    }

    @GET
    @Path("/contracts/{id}")
    @RolesAllowed({Perm.CONTRACT_READ, Perm.FINANCE_READ})
    public ContractDto get(@PathParam("id") UUID id) {
        return contracts.get(id);
    }

    @GET
    @Path("/projects/{projectId}/contract")
    @RolesAllowed({Perm.CONTRACT_READ, Perm.FINANCE_READ})
    public ContractDto byProject(@PathParam("projectId") UUID projectId) {
        return contracts.byProject(projectId);
    }

    @POST
    @Path("/contracts/from-quotation")
    @RolesAllowed(Perm.CONTRACT_WRITE)
    public Response fromQuotation(@Valid FromQuotationRequest req) {
        return Response.status(201).entity(contracts.fromQuotation(req)).build();
    }

    @POST
    @Path("/contracts")
    @RolesAllowed(Perm.CONTRACT_WRITE)
    public Response create(@Valid CreateRequest req) {
        return Response.status(201).entity(contracts.create(req)).build();
    }

    @PUT
    @Path("/contracts/{id}")
    @RolesAllowed(Perm.CONTRACT_WRITE)
    public ContractDto update(@PathParam("id") UUID id, @Valid UpdateRequest req) {
        return contracts.update(id, req);
    }

    @PUT
    @Path("/contracts/{id}/milestones")
    @RolesAllowed(Perm.CONTRACT_WRITE)
    public ContractDto milestones(@PathParam("id") UUID id, @Valid SaveMilestonesRequest req) {
        return contracts.saveMilestones(id, req.milestones());
    }

    @POST
    @Path("/contracts/{id}/milestones/{msId}/ready")
    @RolesAllowed({Perm.CONTRACT_WRITE, Perm.PROJECT_WRITE})
    public ContractDto milestoneReady(@PathParam("id") UUID id, @PathParam("msId") UUID msId) {
        return contracts.markMilestone(id, msId, true);
    }

    @POST
    @Path("/contracts/{id}/milestones/{msId}/unready")
    @RolesAllowed({Perm.CONTRACT_WRITE, Perm.PROJECT_WRITE})
    public ContractDto milestoneUnready(@PathParam("id") UUID id, @PathParam("msId") UUID msId) {
        return contracts.markMilestone(id, msId, false);
    }

    @POST
    @Path("/contracts/{id}/status")
    @RolesAllowed(Perm.CONTRACT_WRITE)
    public ContractDto status(@PathParam("id") UUID id, @Valid StatusRequest req) {
        return contracts.changeStatus(id, req.status(), req.reason());
    }

    @POST
    @Path("/contracts/{id}/retention-release")
    @RolesAllowed(Perm.FINANCE_WRITE)
    public ContractDto releaseRetention(@PathParam("id") UUID id, @Valid RetentionRequest req) {
        return contracts.releaseRetention(id, req.amount());
    }

    @DELETE
    @Path("/contracts/{id}")
    @RolesAllowed(Perm.CONTRACT_WRITE)
    public Response delete(@PathParam("id") UUID id) {
        contracts.delete(id);
        return Response.noContent().build();
    }

    // ---------------------------------------------------------------- VO

    @POST
    @Path("/contracts/{id}/change-orders")
    @RolesAllowed(Perm.CONTRACT_WRITE)
    public Response createVo(@PathParam("id") UUID id, @Valid VoRequest req) {
        return Response.status(201).entity(changeOrders.create(id, req)).build();
    }

    @GET
    @Path("/change-orders/pending")
    @RolesAllowed(Perm.CONTRACT_APPROVE)
    public List<VoRow> pendingVo() {
        return changeOrders.pending();
    }

    @GET
    @Path("/change-orders/{id}")
    @RolesAllowed({Perm.CONTRACT_READ, Perm.FINANCE_READ})
    public VoDto getVo(@PathParam("id") UUID id) {
        return changeOrders.get(id);
    }

    @PUT
    @Path("/change-orders/{id}")
    @RolesAllowed(Perm.CONTRACT_WRITE)
    public VoDto updateVo(@PathParam("id") UUID id, @Valid VoRequest req) {
        return changeOrders.update(id, req);
    }

    @POST
    @Path("/change-orders/{id}/submit")
    @RolesAllowed(Perm.CONTRACT_WRITE)
    public VoDto submitVo(@PathParam("id") UUID id) {
        return changeOrders.submit(id);
    }

    @POST
    @Path("/change-orders/{id}/approve")
    @RolesAllowed(Perm.CONTRACT_APPROVE)
    public VoDto approveVo(@PathParam("id") UUID id, @Valid VoDecisionRequest req) {
        return changeOrders.decide(id, true, req == null ? null : req.comment(), req == null || req.createMilestone());
    }

    @POST
    @Path("/change-orders/{id}/reject")
    @RolesAllowed(Perm.CONTRACT_APPROVE)
    public VoDto rejectVo(@PathParam("id") UUID id, @Valid VoDecisionRequest req) {
        return changeOrders.decide(id, false, req == null ? null : req.comment(), false);
    }

    @POST
    @Path("/change-orders/{id}/cancel")
    @RolesAllowed(Perm.CONTRACT_WRITE)
    public VoDto cancelVo(@PathParam("id") UUID id) {
        return changeOrders.cancel(id);
    }
}
