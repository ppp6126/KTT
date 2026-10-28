package com.ktt.pricing;

import com.ktt.common.ApiException;
import com.ktt.common.FileStorage;
import com.ktt.common.PageResult;
import com.ktt.pricing.PricingDtos.CategoryDto;
import com.ktt.pricing.PricingDtos.CategoryRequest;
import com.ktt.pricing.PricingDtos.EquipmentDto;
import com.ktt.pricing.PricingDtos.EquipmentRequest;
import com.ktt.pricing.PricingDtos.ImportResult;
import com.ktt.pricing.PricingDtos.LaborDto;
import com.ktt.pricing.PricingDtos.LaborRequest;
import com.ktt.pricing.PricingDtos.MaterialDto;
import com.ktt.pricing.PricingDtos.MaterialRequest;
import com.ktt.pricing.PricingDtos.PickItem;
import com.ktt.pricing.PricingDtos.PriceHistoryDto;
import com.ktt.security.Perm;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.ws.rs.Consumes;
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
import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Path("/api/pricing")
@Produces(MediaType.APPLICATION_JSON)
public class PricingResource {

    @Inject
    PricingService service;

    @Inject
    PricingExcelService excel;

    // ---------------------------------------------------------------- categories
    @GET
    @Path("/categories")
    @RolesAllowed(Perm.PRICING_READ)
    public List<CategoryDto> categories() {
        return service.categories();
    }

    @POST
    @Path("/categories")
    @RolesAllowed(Perm.PRICING_WRITE)
    public CategoryDto createCategory(@Valid CategoryRequest req) {
        return service.saveCategory(null, req);
    }

    @PUT
    @Path("/categories/{id}")
    @RolesAllowed(Perm.PRICING_WRITE)
    public CategoryDto updateCategory(@PathParam("id") UUID id, @Valid CategoryRequest req) {
        return service.saveCategory(id, req);
    }

    @DELETE
    @Path("/categories/{id}")
    @RolesAllowed(Perm.PRICING_WRITE)
    public Response deleteCategory(@PathParam("id") UUID id) {
        service.deleteCategory(id);
        return Response.noContent().build();
    }

    // ---------------------------------------------------------------- materials
    @GET
    @Path("/materials")
    @RolesAllowed(Perm.PRICING_READ)
    public PageResult<MaterialDto> materials(@QueryParam("q") String q, @QueryParam("categoryId") UUID categoryId,
                                             @QueryParam("page") @DefaultValue("0") @Min(0) int page,
                                             @QueryParam("size") @DefaultValue("50") @Min(1) @Max(500) int size) {
        return service.materials(q, categoryId, page, size);
    }

    @POST
    @Path("/materials")
    @RolesAllowed(Perm.PRICING_WRITE)
    public Response createMaterial(@Valid MaterialRequest req) {
        return Response.status(201).entity(service.saveMaterial(null, req)).build();
    }

    @PUT
    @Path("/materials/{id}")
    @RolesAllowed(Perm.PRICING_WRITE)
    public MaterialDto updateMaterial(@PathParam("id") UUID id, @Valid MaterialRequest req) {
        return service.saveMaterial(id, req);
    }

    @DELETE
    @Path("/materials/{id}")
    @RolesAllowed(Perm.PRICING_WRITE)
    public Response deleteMaterial(@PathParam("id") UUID id) {
        service.deleteMaterial(id);
        return Response.noContent().build();
    }

    // ---------------------------------------------------------------- labor
    @GET
    @Path("/labor")
    @RolesAllowed(Perm.PRICING_READ)
    public PageResult<LaborDto> labor(@QueryParam("q") String q, @QueryParam("trade") String trade,
                                      @QueryParam("page") @DefaultValue("0") @Min(0) int page,
                                      @QueryParam("size") @DefaultValue("50") @Min(1) @Max(500) int size) {
        return service.labor(q, trade, page, size);
    }

    @POST
    @Path("/labor")
    @RolesAllowed(Perm.PRICING_WRITE)
    public Response createLabor(@Valid LaborRequest req) {
        return Response.status(201).entity(service.saveLabor(null, req)).build();
    }

    @PUT
    @Path("/labor/{id}")
    @RolesAllowed(Perm.PRICING_WRITE)
    public LaborDto updateLabor(@PathParam("id") UUID id, @Valid LaborRequest req) {
        return service.saveLabor(id, req);
    }

    @DELETE
    @Path("/labor/{id}")
    @RolesAllowed(Perm.PRICING_WRITE)
    public Response deleteLabor(@PathParam("id") UUID id) {
        service.deleteLabor(id);
        return Response.noContent().build();
    }

    // ---------------------------------------------------------------- equipment
    @GET
    @Path("/equipment")
    @RolesAllowed(Perm.PRICING_READ)
    public PageResult<EquipmentDto> equipment(@QueryParam("q") String q,
                                              @QueryParam("page") @DefaultValue("0") @Min(0) int page,
                                              @QueryParam("size") @DefaultValue("50") @Min(1) @Max(500) int size) {
        return service.equipment(q, page, size);
    }

    @POST
    @Path("/equipment")
    @RolesAllowed(Perm.PRICING_WRITE)
    public Response createEquipment(@Valid EquipmentRequest req) {
        return Response.status(201).entity(service.saveEquipment(null, req)).build();
    }

    @PUT
    @Path("/equipment/{id}")
    @RolesAllowed(Perm.PRICING_WRITE)
    public EquipmentDto updateEquipment(@PathParam("id") UUID id, @Valid EquipmentRequest req) {
        return service.saveEquipment(id, req);
    }

    @DELETE
    @Path("/equipment/{id}")
    @RolesAllowed(Perm.PRICING_WRITE)
    public Response deleteEquipment(@PathParam("id") UUID id) {
        service.deleteEquipment(id);
        return Response.noContent().build();
    }

    // ---------------------------------------------------------------- history / picker
    @GET
    @Path("/history/{type}/{id}")
    @RolesAllowed(Perm.PRICING_READ)
    public List<PriceHistoryDto> history(@PathParam("type") String type, @PathParam("id") UUID id) {
        return service.history(type, id);
    }

    @GET
    @Path("/pick")
    @RolesAllowed({Perm.BOQ_WRITE, Perm.PRICING_READ})
    public List<PickItem> pick(@QueryParam("type") String type, @QueryParam("q") String q) {
        return service.pick(type, q);
    }

    // ---------------------------------------------------------------- excel
    @GET
    @Path("/excel/{type}")
    @Produces("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    @RolesAllowed(Perm.PRICING_IMPORT)
    public Response export(@PathParam("type") String type, @QueryParam("template") @DefaultValue("false") boolean template) {
        byte[] data = excel.export(type, template);
        String name = (template ? "แบบฟอร์ม-" : "ฐานราคา-") + PricingExcelService.sheetName(type) + "-" + LocalDate.now() + ".xlsx";
        return Response.ok(data)
                .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                .header("Content-Disposition", FileStorage.disposition("attachment", name))
                .build();
    }

    @POST
    @Path("/excel/{type}")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @RolesAllowed(Perm.PRICING_IMPORT)
    public ImportResult importExcel(@PathParam("type") String type, @RestForm("file") FileUpload file) {
        PricingExcelService.checkType(type);
        if (file == null || !FileStorage.extension(file.fileName()).equals("xlsx")) {
            throw ApiException.badRequest("invalid_excel", "กรุณาเลือกไฟล์ .xlsx");
        }
        try (InputStream in = Files.newInputStream(file.uploadedFile())) {
            return excel.importFile(type, in);
        } catch (IOException e) {
            throw ApiException.badRequest("invalid_excel", "อ่านไฟล์ไม่ได้");
        }
    }
}
