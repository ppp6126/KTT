package com.ktt.boq;

import com.ktt.boq.BoqDtos.BoqDto;
import com.ktt.boq.BoqDtos.BoqHeaderRequest;
import com.ktt.boq.BoqDtos.BoqSummary;
import com.ktt.boq.BoqDtos.CopyRequest;
import com.ktt.boq.BoqDtos.CreateBoqRequest;
import com.ktt.boq.BoqDtos.FactorTableDto;
import com.ktt.boq.BoqDtos.FactorTableRequest;
import com.ktt.boq.BoqDtos.GovForm;
import com.ktt.boq.BoqDtos.ItemsRequest;
import com.ktt.boq.BoqDtos.SaveAsTemplateRequest;
import com.ktt.boq.BoqDtos.TemplateDto;
import com.ktt.boq.BoqDtos.TemplateRequest;
import com.ktt.boq.BoqDtos.TemplateSummary;
import com.ktt.common.ApiException;
import com.ktt.security.Perm;
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

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Path("/api")
@Produces(MediaType.APPLICATION_JSON)
public class BoqResource {

    @Inject
    BoqService boqs;

    @Inject
    BoqTemplateService templates;

    // ---------------------------------------------------------------- BOQ
    @GET
    @Path("/boqs")
    @RolesAllowed(Perm.BOQ_READ)
    public List<BoqSummary> list(@QueryParam("leadId") UUID leadId) {
        if (leadId == null) {
            throw ApiException.badRequest("lead_required", "ต้องระบุ leadId");
        }
        return boqs.listForLead(leadId);
    }

    @GET
    @Path("/boqs/{id}")
    @RolesAllowed(Perm.BOQ_READ)
    public BoqDto get(@PathParam("id") UUID id) {
        return boqs.get(id);
    }

    @POST
    @Path("/boqs")
    @RolesAllowed(Perm.BOQ_WRITE)
    public Response create(@Valid CreateBoqRequest req) {
        return Response.status(201).entity(boqs.create(req)).build();
    }

    @PUT
    @Path("/boqs/{id}")
    @RolesAllowed(Perm.BOQ_WRITE)
    public BoqDto updateHeader(@PathParam("id") UUID id, @Valid BoqHeaderRequest req) {
        return boqs.updateHeader(id, req);
    }

    @PUT
    @Path("/boqs/{id}/items")
    @RolesAllowed(Perm.BOQ_WRITE)
    public BoqDto saveItems(@PathParam("id") UUID id, @Valid ItemsRequest req) {
        return boqs.saveItems(id, req.items());
    }

    @POST
    @Path("/boqs/{id}/copy")
    @RolesAllowed(Perm.BOQ_WRITE)
    public Response copy(@PathParam("id") UUID id, @Valid CopyRequest req) {
        return Response.status(201).entity(boqs.copy(id, req)).build();
    }

    @POST
    @Path("/boqs/{id}/refresh-prices")
    @RolesAllowed(Perm.BOQ_WRITE)
    public BoqDto refreshPrices(@PathParam("id") UUID id) {
        return boqs.refreshPrices(id);
    }

    @POST
    @Path("/boqs/{id}/insert-template/{templateId}")
    @RolesAllowed(Perm.BOQ_WRITE)
    public BoqDto insertTemplate(@PathParam("id") UUID id, @PathParam("templateId") UUID templateId) {
        return boqs.insertTemplate(id, templateId);
    }

    @POST
    @Path("/boqs/{id}/save-as-template")
    @RolesAllowed(Perm.BOQ_WRITE)
    public Map<String, UUID> saveAsTemplate(@PathParam("id") UUID id, @Valid SaveAsTemplateRequest req) {
        return Map.of("templateId", boqs.saveAsTemplate(id, req));
    }

    @DELETE
    @Path("/boqs/{id}")
    @RolesAllowed(Perm.BOQ_WRITE)
    public Response delete(@PathParam("id") UUID id) {
        boqs.delete(id);
        return Response.noContent().build();
    }

    @GET
    @Path("/boqs/{id}/gov-form")
    @RolesAllowed(Perm.BOQ_READ)
    public GovForm govForm(@PathParam("id") UUID id) {
        return boqs.govForm(id);
    }

    // ---------------------------------------------------------------- templates
    @GET
    @Path("/boq-templates")
    @RolesAllowed(Perm.BOQ_READ)
    public List<TemplateSummary> templates() {
        return templates.list();
    }

    @GET
    @Path("/boq-templates/{id}")
    @RolesAllowed(Perm.BOQ_READ)
    public TemplateDto template(@PathParam("id") UUID id) {
        return templates.get(id);
    }

    @POST
    @Path("/boq-templates")
    @RolesAllowed(Perm.BOQ_WRITE)
    public Response createTemplate(@Valid TemplateRequest req) {
        return Response.status(201).entity(templates.save(null, req)).build();
    }

    @PUT
    @Path("/boq-templates/{id}")
    @RolesAllowed(Perm.BOQ_WRITE)
    public TemplateDto updateTemplate(@PathParam("id") UUID id, @Valid TemplateRequest req) {
        return templates.save(id, req);
    }

    @DELETE
    @Path("/boq-templates/{id}")
    @RolesAllowed(Perm.BOQ_WRITE)
    public Response deleteTemplate(@PathParam("id") UUID id) {
        templates.delete(id);
        return Response.noContent().build();
    }

    // ---------------------------------------------------------------- factor F
    @GET
    @Path("/factor-f-tables")
    @RolesAllowed(Perm.BOQ_READ)
    public List<FactorTableDto> factorTables() {
        return templates.factorTables();
    }

    @GET
    @Path("/factor-f-tables/{id}")
    @RolesAllowed(Perm.BOQ_READ)
    public FactorTableDto factorTable(@PathParam("id") UUID id) {
        return templates.factorTable(id);
    }

    @GET
    @Path("/factor-f-tables/{id}/calc")
    @RolesAllowed(Perm.BOQ_READ)
    public Map<String, BigDecimal> calc(@PathParam("id") UUID id, @QueryParam("cost") BigDecimal cost) {
        if (cost == null) {
            throw ApiException.badRequest("cost_required", "ต้องระบุค่างานต้นทุน");
        }
        return Map.of("factor", templates.calc(id, cost));
    }

    @POST
    @Path("/factor-f-tables")
    @RolesAllowed(Perm.BOQ_WRITE)
    public Response createFactorTable(@Valid FactorTableRequest req) {
        return Response.status(201).entity(templates.saveFactorTable(null, req)).build();
    }

    @PUT
    @Path("/factor-f-tables/{id}")
    @RolesAllowed(Perm.BOQ_WRITE)
    public FactorTableDto updateFactorTable(@PathParam("id") UUID id, @Valid FactorTableRequest req) {
        return templates.saveFactorTable(id, req);
    }

    @DELETE
    @Path("/factor-f-tables/{id}")
    @RolesAllowed(Perm.BOQ_WRITE)
    public Response deleteFactorTable(@PathParam("id") UUID id) {
        templates.deleteFactorTable(id);
        return Response.noContent().build();
    }
}
