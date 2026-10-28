package com.ktt.purchase;

import com.ktt.common.PageResult;
import com.ktt.purchase.PurchaseDtos.DecisionRequest;
import com.ktt.purchase.PurchaseDtos.EvaluationRequest;
import com.ktt.purchase.PurchaseDtos.PoDto;
import com.ktt.purchase.PurchaseDtos.PoRequest;
import com.ktt.purchase.PurchaseDtos.PoRow;
import com.ktt.purchase.PurchaseDtos.PrDto;
import com.ktt.purchase.PurchaseDtos.PrRequest;
import com.ktt.purchase.PurchaseDtos.PrRow;
import com.ktt.purchase.PurchaseDtos.QuoteRequest;
import com.ktt.purchase.PurchaseDtos.ReceiveRequest;
import com.ktt.purchase.PurchaseDtos.SupplierDto;
import com.ktt.purchase.PurchaseDtos.SupplierOption;
import com.ktt.purchase.PurchaseDtos.SupplierRequest;
import com.ktt.purchase.PurchaseDtos.SupplierRow;
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
public class PurchaseResource {

    @Inject
    SupplierService suppliers;

    @Inject
    PurchaseService purchase;

    // ---------------------------------------------------------------- suppliers

    @GET
    @Path("/suppliers")
    @RolesAllowed({Perm.PURCHASE_READ, Perm.AP_READ, Perm.SUBCONTRACT_READ})
    public PageResult<SupplierRow> suppliers(@QueryParam("q") String q, @QueryParam("kind") String kind,
                                             @QueryParam("active") Boolean active,
                                             @QueryParam("page") @DefaultValue("0") @Min(0) int page,
                                             @QueryParam("size") @DefaultValue("20") @Min(1) @Max(200) int size) {
        return suppliers.list(q, kind, active, page, size);
    }

    @GET
    @Path("/suppliers/options")
    @RolesAllowed({Perm.PURCHASE_READ, Perm.PURCHASE_REQUEST, Perm.AP_READ, Perm.SUBCONTRACT_READ, Perm.LABOR_READ})
    public List<SupplierOption> supplierOptions(@QueryParam("kind") String kind) {
        return suppliers.options(kind);
    }

    @GET
    @Path("/suppliers/{id}")
    @RolesAllowed({Perm.PURCHASE_READ, Perm.AP_READ, Perm.SUBCONTRACT_READ})
    public SupplierDto supplier(@PathParam("id") UUID id) {
        return suppliers.get(id);
    }

    @POST
    @Path("/suppliers")
    @RolesAllowed({Perm.PURCHASE_WRITE, Perm.AP_WRITE, Perm.SUBCONTRACT_WRITE})
    public Response createSupplier(@Valid SupplierRequest req) {
        return Response.status(201).entity(suppliers.save(null, req)).build();
    }

    @PUT
    @Path("/suppliers/{id}")
    @RolesAllowed({Perm.PURCHASE_WRITE, Perm.AP_WRITE, Perm.SUBCONTRACT_WRITE})
    public SupplierDto updateSupplier(@PathParam("id") UUID id, @Valid SupplierRequest req) {
        return suppliers.save(id, req);
    }

    @DELETE
    @Path("/suppliers/{id}")
    @RolesAllowed({Perm.PURCHASE_WRITE, Perm.AP_WRITE, Perm.SUBCONTRACT_WRITE})
    public Response deleteSupplier(@PathParam("id") UUID id) {
        suppliers.delete(id);
        return Response.noContent().build();
    }

    @POST
    @Path("/suppliers/{id}/evaluations")
    @RolesAllowed({Perm.PURCHASE_WRITE, Perm.PROJECT_WRITE})
    public SupplierDto evaluate(@PathParam("id") UUID id, @Valid EvaluationRequest req) {
        return suppliers.evaluate(id, req);
    }

    // ---------------------------------------------------------------- PR

    @GET
    @Path("/purchase-requests")
    @RolesAllowed({Perm.PURCHASE_READ, Perm.PURCHASE_REQUEST})
    public PageResult<PrRow> prs(@QueryParam("status") String status, @QueryParam("projectId") UUID projectId,
                                 @QueryParam("q") String q,
                                 @QueryParam("page") @DefaultValue("0") @Min(0) int page,
                                 @QueryParam("size") @DefaultValue("20") @Min(1) @Max(200) int size) {
        return purchase.listPr(status, projectId, q, page, size);
    }

    @GET
    @Path("/purchase-requests/{id}")
    @RolesAllowed({Perm.PURCHASE_READ, Perm.PURCHASE_REQUEST})
    public PrDto pr(@PathParam("id") UUID id) {
        return purchase.getPr(id);
    }

    @POST
    @Path("/purchase-requests")
    @RolesAllowed({Perm.PURCHASE_REQUEST, Perm.PURCHASE_WRITE})
    public Response createPr(@Valid PrRequest req) {
        return Response.status(201).entity(purchase.createPr(req)).build();
    }

    @PUT
    @Path("/purchase-requests/{id}")
    @RolesAllowed({Perm.PURCHASE_REQUEST, Perm.PURCHASE_WRITE})
    public PrDto updatePr(@PathParam("id") UUID id, @Valid PrRequest req) {
        return purchase.updatePr(id, req);
    }

    @POST
    @Path("/purchase-requests/{id}/submit")
    @RolesAllowed({Perm.PURCHASE_REQUEST, Perm.PURCHASE_WRITE})
    public PrDto submitPr(@PathParam("id") UUID id) {
        return purchase.submitPr(id);
    }

    @POST
    @Path("/purchase-requests/{id}/approve")
    @RolesAllowed(Perm.PURCHASE_APPROVE)
    public PrDto approvePr(@PathParam("id") UUID id, @Valid DecisionRequest req) {
        return purchase.decidePr(id, true, req == null ? null : req.comment());
    }

    @POST
    @Path("/purchase-requests/{id}/reject")
    @RolesAllowed(Perm.PURCHASE_APPROVE)
    public PrDto rejectPr(@PathParam("id") UUID id, @Valid DecisionRequest req) {
        return purchase.decidePr(id, false, req == null ? null : req.comment());
    }

    @POST
    @Path("/purchase-requests/{id}/cancel")
    @RolesAllowed({Perm.PURCHASE_REQUEST, Perm.PURCHASE_WRITE})
    public PrDto cancelPr(@PathParam("id") UUID id) {
        return purchase.cancelPr(id);
    }

    @POST
    @Path("/purchase-requests/{id}/quotes")
    @RolesAllowed(Perm.PURCHASE_WRITE)
    public PrDto addQuote(@PathParam("id") UUID id, @Valid QuoteRequest req) {
        return purchase.saveQuote(id, null, req);
    }

    @PUT
    @Path("/purchase-requests/{id}/quotes/{quoteId}")
    @RolesAllowed(Perm.PURCHASE_WRITE)
    public PrDto updateQuote(@PathParam("id") UUID id, @PathParam("quoteId") UUID quoteId, @Valid QuoteRequest req) {
        return purchase.saveQuote(id, quoteId, req);
    }

    @DELETE
    @Path("/purchase-requests/{id}/quotes/{quoteId}")
    @RolesAllowed(Perm.PURCHASE_WRITE)
    public PrDto deleteQuote(@PathParam("id") UUID id, @PathParam("quoteId") UUID quoteId) {
        return purchase.deleteQuote(id, quoteId);
    }

    @POST
    @Path("/purchase-requests/{id}/quotes/{quoteId}/order")
    @RolesAllowed(Perm.PURCHASE_WRITE)
    public Response order(@PathParam("id") UUID id, @PathParam("quoteId") UUID quoteId) {
        return Response.status(201).entity(purchase.orderFromQuote(id, quoteId)).build();
    }

    // ---------------------------------------------------------------- PO

    @GET
    @Path("/purchase-orders")
    @RolesAllowed({Perm.PURCHASE_READ, Perm.AP_READ, Perm.STOCK_WRITE})
    public PageResult<PoRow> pos(@QueryParam("status") String status, @QueryParam("supplierId") UUID supplierId,
                                 @QueryParam("projectId") UUID projectId, @QueryParam("q") String q,
                                 @QueryParam("page") @DefaultValue("0") @Min(0) int page,
                                 @QueryParam("size") @DefaultValue("20") @Min(1) @Max(200) int size) {
        return purchase.listPo(status, supplierId, projectId, q, page, size);
    }

    @GET
    @Path("/purchase-orders/{id}")
    @RolesAllowed({Perm.PURCHASE_READ, Perm.AP_READ, Perm.STOCK_WRITE})
    public PoDto po(@PathParam("id") UUID id) {
        return purchase.getPo(id);
    }

    @POST
    @Path("/purchase-orders")
    @RolesAllowed(Perm.PURCHASE_WRITE)
    public Response createPo(@Valid PoRequest req) {
        return Response.status(201).entity(purchase.createPo(req)).build();
    }

    @PUT
    @Path("/purchase-orders/{id}")
    @RolesAllowed(Perm.PURCHASE_WRITE)
    public PoDto updatePo(@PathParam("id") UUID id, @Valid PoRequest req) {
        return purchase.updatePo(id, req);
    }

    @POST
    @Path("/purchase-orders/{id}/submit")
    @RolesAllowed(Perm.PURCHASE_WRITE)
    public PoDto submitPo(@PathParam("id") UUID id) {
        return purchase.submitPo(id);
    }

    @POST
    @Path("/purchase-orders/{id}/approve")
    @RolesAllowed(Perm.PURCHASE_APPROVE)
    public PoDto approvePo(@PathParam("id") UUID id, @Valid DecisionRequest req) {
        return purchase.decidePo(id, true, req == null ? null : req.comment());
    }

    @POST
    @Path("/purchase-orders/{id}/reject")
    @RolesAllowed(Perm.PURCHASE_APPROVE)
    public PoDto rejectPo(@PathParam("id") UUID id, @Valid DecisionRequest req) {
        return purchase.decidePo(id, false, req == null ? null : req.comment());
    }

    @POST
    @Path("/purchase-orders/{id}/cancel")
    @RolesAllowed(Perm.PURCHASE_WRITE)
    public PoDto cancelPo(@PathParam("id") UUID id) {
        return purchase.cancelPo(id);
    }

    @POST
    @Path("/purchase-orders/{id}/close")
    @RolesAllowed(Perm.PURCHASE_WRITE)
    public PoDto closePo(@PathParam("id") UUID id) {
        return purchase.closePo(id);
    }

    @DELETE
    @Path("/purchase-orders/{id}")
    @RolesAllowed(Perm.PURCHASE_WRITE)
    public Response deletePo(@PathParam("id") UUID id) {
        purchase.deletePo(id);
        return Response.noContent().build();
    }

    @POST
    @Path("/purchase-orders/{id}/receipts")
    @RolesAllowed({Perm.PURCHASE_WRITE, Perm.STOCK_WRITE})
    public PoDto receive(@PathParam("id") UUID id, @Valid ReceiveRequest req) {
        return purchase.receive(id, req);
    }

    @POST
    @Path("/goods-receipts/{id}/void")
    @RolesAllowed({Perm.PURCHASE_WRITE, Perm.STOCK_WRITE})
    public PoDto voidReceipt(@PathParam("id") UUID id) {
        return purchase.voidReceipt(id);
    }
}
