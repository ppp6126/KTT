package com.ktt.finance;

import com.ktt.common.PageResult;
import com.ktt.finance.FinanceDtos.BillingNoteRequest;
import com.ktt.finance.FinanceDtos.CreditNoteRequest;
import com.ktt.finance.FinanceDtos.FromContractRequest;
import com.ktt.finance.FinanceDtos.InvoiceRequest;
import com.ktt.finance.FinanceDtos.PaymentRequest;
import com.ktt.finance.FinanceDtos.Receivables;
import com.ktt.finance.FinanceDtos.SalesDocDto;
import com.ktt.finance.FinanceDtos.SalesDocRow;
import com.ktt.finance.FinanceDtos.VoidRequest;
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

import java.util.UUID;

@Path("/api/finance")
@Produces(MediaType.APPLICATION_JSON)
public class FinanceResource {

    @Inject
    SalesDocService service;

    @GET
    @Path("/docs")
    @RolesAllowed(Perm.FINANCE_READ)
    public PageResult<SalesDocRow> list(@QueryParam("type") String type, @QueryParam("status") String status,
                                        @QueryParam("q") String q, @QueryParam("customerId") UUID customerId,
                                        @QueryParam("projectId") UUID projectId, @QueryParam("contractId") UUID contractId,
                                        @QueryParam("open") @DefaultValue("false") boolean open,
                                        @QueryParam("page") @DefaultValue("0") @Min(0) int page,
                                        @QueryParam("size") @DefaultValue("20") @Min(1) @Max(200) int size) {
        return service.list(type, status, q, customerId, projectId, contractId, open, page, size);
    }

    @GET
    @Path("/docs/{id}")
    @RolesAllowed(Perm.FINANCE_READ)
    public SalesDocDto get(@PathParam("id") UUID id) {
        return service.get(id);
    }

    @POST
    @Path("/invoices")
    @RolesAllowed(Perm.FINANCE_WRITE)
    public Response createInvoice(@Valid InvoiceRequest req) {
        return Response.status(201).entity(service.createInvoice(req)).build();
    }

    @POST
    @Path("/invoices/from-contract")
    @RolesAllowed(Perm.FINANCE_WRITE)
    public Response fromContract(@Valid FromContractRequest req) {
        return Response.status(201).entity(service.fromContract(req)).build();
    }

    @PUT
    @Path("/invoices/{id}")
    @RolesAllowed(Perm.FINANCE_WRITE)
    public SalesDocDto updateInvoice(@PathParam("id") UUID id, @Valid InvoiceRequest req) {
        return service.updateInvoice(id, req);
    }

    @POST
    @Path("/invoices/{id}/payments")
    @RolesAllowed(Perm.FINANCE_WRITE)
    public Response pay(@PathParam("id") UUID id, @Valid PaymentRequest req) {
        return Response.status(201).entity(service.recordPayment(id, req)).build();
    }

    @POST
    @Path("/billing-notes")
    @RolesAllowed(Perm.FINANCE_WRITE)
    public Response billingNote(@Valid BillingNoteRequest req) {
        return Response.status(201).entity(service.createBillingNote(req)).build();
    }

    @POST
    @Path("/credit-notes")
    @RolesAllowed(Perm.FINANCE_VOID)
    public Response creditNote(@Valid CreditNoteRequest req) {
        return Response.status(201).entity(service.createCreditNote(req)).build();
    }

    @POST
    @Path("/docs/{id}/issue")
    @RolesAllowed(Perm.FINANCE_WRITE)
    public SalesDocDto issue(@PathParam("id") UUID id) {
        return service.issue(id);
    }

    @POST
    @Path("/docs/{id}/void")
    @RolesAllowed(Perm.FINANCE_VOID)
    public SalesDocDto voidDoc(@PathParam("id") UUID id, @Valid VoidRequest req) {
        return service.voidDoc(id, req.reason());
    }

    @DELETE
    @Path("/docs/{id}")
    @RolesAllowed(Perm.FINANCE_WRITE)
    public Response delete(@PathParam("id") UUID id) {
        service.delete(id);
        return Response.noContent().build();
    }

    @POST
    @Path("/docs/{id}/printed")
    @RolesAllowed(Perm.FINANCE_READ)
    public Response printed(@PathParam("id") UUID id) {
        service.logPrint(id);
        return Response.noContent().build();
    }

    @GET
    @Path("/receivables")
    @RolesAllowed(Perm.FINANCE_READ)
    public Receivables receivables() {
        return service.receivables();
    }
}
