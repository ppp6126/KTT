package com.ktt.site;

import com.ktt.common.PageResult;
import com.ktt.security.Perm;
import com.ktt.site.SiteDtos.DailyReportDto;
import com.ktt.site.SiteDtos.DailyReportRequest;
import com.ktt.site.SiteDtos.DailyReportRow;
import com.ktt.site.SiteDtos.IssueDto;
import com.ktt.site.SiteDtos.IssueRequest;
import com.ktt.site.SiteDtos.ProgressReportDto;
import com.ktt.site.SiteDtos.PunchDto;
import com.ktt.site.SiteDtos.PunchRequest;
import com.ktt.site.SiteDtos.QcDto;
import com.ktt.site.SiteDtos.QcRequest;
import com.ktt.site.SiteDtos.QcTemplateDto;
import com.ktt.site.SiteDtos.QcTemplateRequest;
import com.ktt.site.SiteDtos.SafetyDto;
import com.ktt.site.SiteDtos.SafetyRequest;
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
import java.util.List;
import java.util.UUID;

@Path("/api")
@Produces(MediaType.APPLICATION_JSON)
@RolesAllowed({Perm.PROJECT_READ, Perm.PROJECT_READ_ALL})
public class SiteResource {

    @Inject
    DailyReportService daily;

    @Inject
    SiteRecordService records;

    // ---------------------------------------------------------------- daily reports

    @GET
    @Path("/projects/{projectId}/daily-reports")
    public PageResult<DailyReportRow> dailyList(@PathParam("projectId") UUID projectId,
                                                @QueryParam("page") @DefaultValue("0") @Min(0) int page,
                                                @QueryParam("size") @DefaultValue("30") @Min(1) @Max(200) int size) {
        return daily.list(projectId, page, size);
    }

    @POST
    @Path("/projects/{projectId}/daily-reports")
    public Response dailyCreate(@PathParam("projectId") UUID projectId, @Valid DailyReportRequest req) {
        return Response.status(201).entity(daily.create(projectId, req)).build();
    }

    @GET
    @Path("/daily-reports/{id}")
    public DailyReportDto dailyGet(@PathParam("id") UUID id) {
        return daily.get(id);
    }

    @PUT
    @Path("/daily-reports/{id}")
    public DailyReportDto dailyUpdate(@PathParam("id") UUID id, @Valid DailyReportRequest req) {
        return daily.update(id, req);
    }

    @POST
    @Path("/daily-reports/{id}/submit")
    public DailyReportDto dailySubmit(@PathParam("id") UUID id) {
        return daily.submit(id);
    }

    @POST
    @Path("/daily-reports/{id}/acknowledge")
    @RolesAllowed(Perm.PROJECT_WRITE)
    public DailyReportDto dailyAck(@PathParam("id") UUID id) {
        return daily.acknowledge(id);
    }

    @DELETE
    @Path("/daily-reports/{id}")
    public Response dailyDelete(@PathParam("id") UUID id) {
        daily.delete(id);
        return Response.noContent().build();
    }

    // ---------------------------------------------------------------- issues / risks

    @GET
    @Path("/projects/{projectId}/issues")
    public List<IssueDto> issues(@PathParam("projectId") UUID projectId, @QueryParam("kind") String kind) {
        return records.issues(projectId, kind);
    }

    @POST
    @Path("/projects/{projectId}/issues")
    public Response issueCreate(@PathParam("projectId") UUID projectId, @Valid IssueRequest req) {
        return Response.status(201).entity(records.saveIssue(projectId, null, req)).build();
    }

    @PUT
    @Path("/projects/{projectId}/issues/{id}")
    public IssueDto issueUpdate(@PathParam("projectId") UUID projectId, @PathParam("id") UUID id, @Valid IssueRequest req) {
        return records.saveIssue(projectId, id, req);
    }

    @DELETE
    @Path("/projects/{projectId}/issues/{id}")
    public Response issueDelete(@PathParam("projectId") UUID projectId, @PathParam("id") UUID id) {
        records.deleteIssue(projectId, id);
        return Response.noContent().build();
    }

    // ---------------------------------------------------------------- punch list

    @GET
    @Path("/projects/{projectId}/punch")
    public List<PunchDto> punch(@PathParam("projectId") UUID projectId) {
        return records.punch(projectId);
    }

    @POST
    @Path("/projects/{projectId}/punch")
    public Response punchCreate(@PathParam("projectId") UUID projectId, @Valid PunchRequest req) {
        return Response.status(201).entity(records.savePunch(projectId, null, req)).build();
    }

    @PUT
    @Path("/projects/{projectId}/punch/{id}")
    public PunchDto punchUpdate(@PathParam("projectId") UUID projectId, @PathParam("id") UUID id, @Valid PunchRequest req) {
        return records.savePunch(projectId, id, req);
    }

    @DELETE
    @Path("/projects/{projectId}/punch/{id}")
    public Response punchDelete(@PathParam("projectId") UUID projectId, @PathParam("id") UUID id) {
        records.deletePunch(projectId, id);
        return Response.noContent().build();
    }

    // ---------------------------------------------------------------- QC

    @GET
    @Path("/qc-templates")
    public List<QcTemplateDto> qcTemplates() {
        return records.qcTemplates();
    }

    @POST
    @Path("/qc-templates")
    @RolesAllowed(Perm.PROJECT_WRITE)
    public Response qcTemplateCreate(@Valid QcTemplateRequest req) {
        return Response.status(201).entity(records.saveQcTemplate(null, req)).build();
    }

    @PUT
    @Path("/qc-templates/{id}")
    @RolesAllowed(Perm.PROJECT_WRITE)
    public QcTemplateDto qcTemplateUpdate(@PathParam("id") UUID id, @Valid QcTemplateRequest req) {
        return records.saveQcTemplate(id, req);
    }

    @DELETE
    @Path("/qc-templates/{id}")
    @RolesAllowed(Perm.PROJECT_WRITE)
    public Response qcTemplateDelete(@PathParam("id") UUID id) {
        records.deleteQcTemplate(id);
        return Response.noContent().build();
    }

    @GET
    @Path("/projects/{projectId}/qc")
    public List<QcDto> qc(@PathParam("projectId") UUID projectId) {
        return records.qc(projectId);
    }

    @POST
    @Path("/projects/{projectId}/qc")
    public Response qcCreate(@PathParam("projectId") UUID projectId, @Valid QcRequest req) {
        return Response.status(201).entity(records.saveQc(projectId, null, req)).build();
    }

    @PUT
    @Path("/projects/{projectId}/qc/{id}")
    public QcDto qcUpdate(@PathParam("projectId") UUID projectId, @PathParam("id") UUID id, @Valid QcRequest req) {
        return records.saveQc(projectId, id, req);
    }

    @DELETE
    @Path("/projects/{projectId}/qc/{id}")
    public Response qcDelete(@PathParam("projectId") UUID projectId, @PathParam("id") UUID id) {
        records.deleteQc(projectId, id);
        return Response.noContent().build();
    }

    // ---------------------------------------------------------------- safety

    @GET
    @Path("/projects/{projectId}/safety")
    public List<SafetyDto> safety(@PathParam("projectId") UUID projectId) {
        return records.safety(projectId);
    }

    @POST
    @Path("/projects/{projectId}/safety")
    public Response safetyCreate(@PathParam("projectId") UUID projectId, @Valid SafetyRequest req) {
        return Response.status(201).entity(records.saveSafety(projectId, null, req)).build();
    }

    @PUT
    @Path("/projects/{projectId}/safety/{id}")
    public SafetyDto safetyUpdate(@PathParam("projectId") UUID projectId, @PathParam("id") UUID id, @Valid SafetyRequest req) {
        return records.saveSafety(projectId, id, req);
    }

    @DELETE
    @Path("/projects/{projectId}/safety/{id}")
    public Response safetyDelete(@PathParam("projectId") UUID projectId, @PathParam("id") UUID id) {
        records.deleteSafety(projectId, id);
        return Response.noContent().build();
    }

    // ---------------------------------------------------------------- progress report

    @GET
    @Path("/projects/{projectId}/progress-report")
    public ProgressReportDto progressReport(@PathParam("projectId") UUID projectId, @QueryParam("from") LocalDate from,
                                            @QueryParam("to") LocalDate to) {
        return records.progressReport(projectId, from, to);
    }
}
