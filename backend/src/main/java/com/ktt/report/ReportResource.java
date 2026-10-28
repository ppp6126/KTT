package com.ktt.report;

import com.ktt.report.ReportService.CashFlow;
import com.ktt.report.ReportService.CostRow;
import com.ktt.report.ReportService.ProjectCost;
import com.ktt.report.ReportService.UsageRow;
import com.ktt.report.ReportService.VatReport;
import com.ktt.report.ReportService.WhtReport;
import com.ktt.security.Perm;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;

import java.util.List;
import java.util.UUID;

@Path("/api/reports")
@Produces(MediaType.APPLICATION_JSON)
public class ReportResource {

    @Inject
    ReportService service;

    @GET
    @Path("/project-cost/{projectId}")
    @RolesAllowed(Perm.COST_VIEW)
    public ProjectCost projectCost(@PathParam("projectId") UUID projectId) {
        return service.projectCost(projectId);
    }

    @GET
    @Path("/project-cost")
    @RolesAllowed(Perm.COST_VIEW)
    public List<CostRow> costSummary() {
        return service.costSummary();
    }

    @GET
    @Path("/material-usage/{projectId}")
    @RolesAllowed(Perm.COST_VIEW)
    public List<UsageRow> usage(@PathParam("projectId") UUID projectId) {
        return service.materialUsage(projectId);
    }

    @GET
    @Path("/vat-sales")
    @RolesAllowed(Perm.TAX_REPORT)
    public VatReport salesVat(@QueryParam("period") String period) {
        return service.salesVat(period);
    }

    @GET
    @Path("/vat-purchase")
    @RolesAllowed(Perm.TAX_REPORT)
    public VatReport purchaseVat(@QueryParam("period") String period) {
        return service.purchaseVat(period);
    }

    @GET
    @Path("/wht")
    @RolesAllowed(Perm.TAX_REPORT)
    public WhtReport wht(@QueryParam("period") String period, @QueryParam("form") String form) {
        return service.whtReport(period, form);
    }

    @GET
    @Path("/cash-flow")
    @RolesAllowed({Perm.FINANCE_READ, Perm.AP_READ})
    public CashFlow cashFlow(@QueryParam("weeks") @DefaultValue("12") int weeks) {
        return service.cashFlow(weeks);
    }
}
