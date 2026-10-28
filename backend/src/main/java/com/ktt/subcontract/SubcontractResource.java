package com.ktt.subcontract;

import com.ktt.security.Perm;
import com.ktt.subcontract.SubcontractDtos.AmountRequest;
import com.ktt.subcontract.SubcontractDtos.ClaimRequest;
import com.ktt.subcontract.SubcontractDtos.Dto;
import com.ktt.subcontract.SubcontractDtos.Row;
import com.ktt.subcontract.SubcontractDtos.SaveRequest;
import com.ktt.subcontract.SubcontractDtos.StatusRequest;
import jakarta.annotation.security.RolesAllowed;
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

@Path("/api/subcontracts")
@Produces(MediaType.APPLICATION_JSON)
public class SubcontractResource {

    @Inject
    SubcontractService service;

    @GET
    @RolesAllowed(Perm.SUBCONTRACT_READ)
    public List<Row> list(@QueryParam("projectId") UUID projectId, @QueryParam("status") String status) {
        return service.list(projectId, status);
    }

    @GET
    @Path("/{id}")
    @RolesAllowed(Perm.SUBCONTRACT_READ)
    public Dto get(@PathParam("id") UUID id) {
        return service.get(id);
    }

    @POST
    @RolesAllowed(Perm.SUBCONTRACT_WRITE)
    public Response create(@Valid SaveRequest req) {
        return Response.status(201).entity(service.save(null, req)).build();
    }

    @PUT
    @Path("/{id}")
    @RolesAllowed(Perm.SUBCONTRACT_WRITE)
    public Dto update(@PathParam("id") UUID id, @Valid SaveRequest req) {
        return service.save(id, req);
    }

    @POST
    @Path("/{id}/status")
    @RolesAllowed(Perm.SUBCONTRACT_WRITE)
    public Dto status(@PathParam("id") UUID id, @Valid StatusRequest req) {
        return service.changeStatus(id, req.status());
    }

    @POST
    @Path("/{id}/claims")
    @RolesAllowed(Perm.SUBCONTRACT_WRITE)
    public Dto addClaim(@PathParam("id") UUID id, @Valid ClaimRequest req) {
        return service.addClaim(id, req);
    }

    @POST
    @Path("/{id}/claims/{claimId}/approve")
    @RolesAllowed(Perm.SUBCONTRACT_WRITE)
    public Dto approveClaim(@PathParam("id") UUID id, @PathParam("claimId") UUID claimId) {
        return service.approveClaim(id, claimId);
    }

    @DELETE
    @Path("/{id}/claims/{claimId}")
    @RolesAllowed(Perm.SUBCONTRACT_WRITE)
    public Dto deleteClaim(@PathParam("id") UUID id, @PathParam("claimId") UUID claimId) {
        return service.deleteClaim(id, claimId);
    }

    @POST
    @Path("/{id}/retention-release")
    @RolesAllowed(Perm.SUBCONTRACT_WRITE)
    public Dto release(@PathParam("id") UUID id, @Valid AmountRequest req) {
        return service.releaseRetention(id, req.amount());
    }
}
