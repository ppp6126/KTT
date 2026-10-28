package com.ktt.ap;

import com.ktt.ap.ApDtos.BillDto;
import com.ktt.ap.ApDtos.BillRequest;
import com.ktt.ap.ApDtos.BillRow;
import com.ktt.ap.ApDtos.CertDto;
import com.ktt.ap.ApDtos.PvDto;
import com.ktt.ap.ApDtos.PvRequest;
import com.ktt.ap.ApDtos.PvRow;
import com.ktt.ap.ApDtos.ReasonRequest;
import com.ktt.common.PageResult;
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

import java.time.LocalDate;
import java.util.UUID;

// ไม่ใช้ @Path("/api/ap") ระดับคลาส: RESTEasy Reactive จับ /api/ap เป็น prefix ของ /api/approvals ทำให้หน้าอนุมัติใบเสนอราคา 404
@Path("/api")
@Produces(MediaType.APPLICATION_JSON)
public class ApResource {

    @Inject
    ApService service;

    public record PayRequest(LocalDate paidDate, String bankRef) {
    }

    @GET
    @Path("/ap/bills")
    @RolesAllowed(Perm.AP_READ)
    public PageResult<BillRow> bills(@QueryParam("status") String status, @QueryParam("supplierId") UUID supplierId,
                                     @QueryParam("projectId") UUID projectId, @QueryParam("q") String q,
                                     @QueryParam("open") @DefaultValue("false") boolean open,
                                     @QueryParam("page") @DefaultValue("0") @Min(0) int page,
                                     @QueryParam("size") @DefaultValue("20") @Min(1) @Max(200) int size) {
        return service.listBills(status, supplierId, projectId, q, open, page, size);
    }

    @GET
    @Path("/ap/bills/{id}")
    @RolesAllowed(Perm.AP_READ)
    public BillDto bill(@PathParam("id") UUID id) {
        return service.getBill(id);
    }

    @POST
    @Path("/ap/bills")
    @RolesAllowed(Perm.AP_WRITE)
    public Response create(@Valid BillRequest req) {
        return Response.status(201).entity(service.createBill(req)).build();
    }

    @POST
    @Path("/ap/bills/from-po/{poId}")
    @RolesAllowed(Perm.AP_WRITE)
    public Response fromPo(@PathParam("poId") UUID poId) {
        return Response.status(201).entity(service.fromPo(poId)).build();
    }

    @PUT
    @Path("/ap/bills/{id}")
    @RolesAllowed(Perm.AP_WRITE)
    public BillDto update(@PathParam("id") UUID id, @Valid BillRequest req) {
        return service.updateBill(id, req);
    }

    @POST
    @Path("/ap/bills/{id}/approve")
    @RolesAllowed(Perm.AP_APPROVE)
    public BillDto approve(@PathParam("id") UUID id) {
        return service.approveBill(id);
    }

    @POST
    @Path("/ap/bills/{id}/void")
    @RolesAllowed(Perm.AP_APPROVE)
    public BillDto voidBill(@PathParam("id") UUID id, @Valid ReasonRequest req) {
        return service.voidBill(id, req == null ? null : req.reason());
    }

    @DELETE
    @Path("/ap/bills/{id}")
    @RolesAllowed(Perm.AP_WRITE)
    public Response delete(@PathParam("id") UUID id) {
        service.deleteBill(id);
        return Response.noContent().build();
    }

    @GET
    @Path("/ap/vouchers")
    @RolesAllowed(Perm.AP_READ)
    public PageResult<PvRow> vouchers(@QueryParam("status") String status, @QueryParam("supplierId") UUID supplierId,
                                      @QueryParam("page") @DefaultValue("0") @Min(0) int page,
                                      @QueryParam("size") @DefaultValue("20") @Min(1) @Max(200) int size) {
        return service.listPv(status, supplierId, page, size);
    }

    @GET
    @Path("/ap/vouchers/{id}")
    @RolesAllowed(Perm.AP_READ)
    public PvDto voucher(@PathParam("id") UUID id) {
        return service.getPv(id);
    }

    @POST
    @Path("/ap/vouchers")
    @RolesAllowed(Perm.AP_WRITE)
    public Response createPv(@Valid PvRequest req) {
        return Response.status(201).entity(service.createPv(req)).build();
    }

    @POST
    @Path("/ap/vouchers/{id}/approve")
    @RolesAllowed(Perm.AP_APPROVE)
    public PvDto approvePv(@PathParam("id") UUID id) {
        return service.approvePv(id);
    }

    @POST
    @Path("/ap/vouchers/{id}/pay")
    @RolesAllowed(Perm.AP_WRITE)
    public PvDto pay(@PathParam("id") UUID id, PayRequest req) {
        return service.payPv(id, req == null ? null : req.paidDate(), req == null ? null : req.bankRef());
    }

    @POST
    @Path("/ap/vouchers/{id}/void")
    @RolesAllowed(Perm.AP_APPROVE)
    public PvDto voidPv(@PathParam("id") UUID id, @Valid ReasonRequest req) {
        return service.voidPv(id, req == null ? null : req.reason());
    }

    @GET
    @Path("/ap/wht-certificates/{id}")
    @RolesAllowed({Perm.AP_READ, Perm.TAX_REPORT})
    public CertDto certificate(@PathParam("id") UUID id) {
        return service.certificate(id);
    }
}
