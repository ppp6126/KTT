package com.ktt.labor;

import com.ktt.labor.LaborDtos.PayRequest;
import com.ktt.labor.LaborDtos.SaveTimesheetRequest;
import com.ktt.labor.LaborDtos.TimesheetDto;
import com.ktt.labor.LaborDtos.WageLine;
import com.ktt.labor.LaborDtos.WagePaymentDto;
import com.ktt.labor.LaborDtos.WagePaymentRequest;
import com.ktt.labor.LaborDtos.WorkerDto;
import com.ktt.labor.LaborDtos.WorkerRequest;
import com.ktt.security.Perm;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
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

@Path("/api/labor")
@Produces(MediaType.APPLICATION_JSON)
@RolesAllowed({Perm.LABOR_READ, Perm.LABOR_WRITE})
public class LaborResource {

    @Inject
    LaborService service;

    @GET
    @Path("/workers")
    public List<WorkerDto> workers(@QueryParam("active") @DefaultValue("false") boolean active) {
        return service.workers(active);
    }

    @POST
    @Path("/workers")
    @RolesAllowed(Perm.LABOR_WRITE)
    public Response createWorker(@Valid WorkerRequest req) {
        return Response.status(201).entity(service.saveWorker(null, req)).build();
    }

    @PUT
    @Path("/workers/{id}")
    @RolesAllowed(Perm.LABOR_WRITE)
    public WorkerDto updateWorker(@PathParam("id") UUID id, @Valid WorkerRequest req) {
        return service.saveWorker(id, req);
    }

    @GET
    @Path("/timesheets")
    public TimesheetDto timesheet(@QueryParam("projectId") UUID projectId, @QueryParam("from") LocalDate from,
                                  @QueryParam("to") LocalDate to) {
        return service.timesheet(projectId, from, to);
    }

    @PUT
    @Path("/timesheets")
    @RolesAllowed(Perm.LABOR_WRITE)
    public TimesheetDto saveTimesheet(@Valid SaveTimesheetRequest req) {
        return service.saveTimesheet(req.projectId(), req.entries());
    }

    @GET
    @Path("/wage-preview")
    public List<WageLine> preview(@QueryParam("from") LocalDate from, @QueryParam("to") LocalDate to,
                                  @QueryParam("projectId") UUID projectId) {
        return service.preview(from, to, projectId);
    }

    @GET
    @Path("/wage-payments")
    public List<WagePaymentDto> payments() {
        return service.payments();
    }

    @POST
    @Path("/wage-payments")
    @RolesAllowed(Perm.LABOR_WRITE)
    public Response create(@Valid WagePaymentRequest req) {
        return Response.status(201).entity(service.createPayment(req.from(), req.to(), req.projectId(), req.notes())).build();
    }

    @POST
    @Path("/wage-payments/{id}/pay")
    @RolesAllowed(Perm.LABOR_WRITE)
    public WagePaymentDto pay(@PathParam("id") UUID id, @Valid PayRequest req) {
        return service.pay(id, req.paidDate());
    }

    @POST
    @Path("/wage-payments/{id}/void")
    @RolesAllowed(Perm.LABOR_WRITE)
    public WagePaymentDto voidPayment(@PathParam("id") UUID id) {
        return service.voidPayment(id);
    }
}
