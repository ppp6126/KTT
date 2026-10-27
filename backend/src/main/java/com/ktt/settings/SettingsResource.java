package com.ktt.settings;

import com.ktt.common.ApiException;
import com.ktt.common.FileStorage;
import com.ktt.security.Perm;
import io.quarkus.security.Authenticated;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import java.util.Map;
import java.util.Set;

@Path("/api/settings")
@Produces(MediaType.APPLICATION_JSON)
public class SettingsResource {

    /** รูปของบริษัทที่ใช้บนเอกสาร */
    private static final Set<String> IMAGES = Set.of("logo", "signature");

    @Inject
    SettingsService service;

    @Inject
    FileStorage storage;

    @GET
    @Path("/company")
    @Authenticated
    public Map<String, Object> company() {
        return service.printHeader(storage.exists(key("logo")), storage.exists(key("signature")));
    }

    @PUT
    @Path("/company")
    @RolesAllowed(Perm.SETTINGS_MANAGE)
    public SettingsService.CompanyProfile updateCompany(@Valid SettingsService.CompanyProfile p) {
        return service.updateCompany(p);
    }

    @GET
    @Path("/quotation")
    @Authenticated
    public SettingsService.QuotationSettings quotation() {
        return service.quotation();
    }

    @PUT
    @Path("/quotation")
    @RolesAllowed(Perm.SETTINGS_MANAGE)
    public SettingsService.QuotationSettings updateQuotation(@Valid SettingsService.QuotationSettings q) {
        return service.updateQuotation(q);
    }

    /** โลโก้ / ลายเซ็น (png หรือ jpg) */
    @POST
    @Path("/company/{kind}")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @RolesAllowed(Perm.SETTINGS_MANAGE)
    public Response uploadImage(@PathParam("kind") String kind, @RestForm("file") FileUpload file) {
        checkKind(kind);
        if (file == null) {
            throw ApiException.badRequest("no_file", "กรุณาเลือกไฟล์");
        }
        String ext = FileStorage.extension(file.fileName());
        if (!Set.of("png", "jpg", "jpeg").contains(ext)) {
            throw ApiException.badRequest("file_type_not_allowed", "ใช้ได้เฉพาะไฟล์ PNG หรือ JPG");
        }
        if (file.size() > 2 * 1024 * 1024) {
            throw ApiException.badRequest("file_too_large", "ไฟล์ต้องไม่เกิน 2 MB");
        }
        storage.storeAt(file.uploadedFile(), key(kind));
        return Response.noContent().build();
    }

    @GET
    @Path("/company/{kind}")
    @Authenticated
    public Response image(@PathParam("kind") String kind) {
        checkKind(kind);
        if (!storage.exists(key(kind))) {
            throw ApiException.notFound("ยังไม่ได้อัปโหลด");
        }
        return Response.ok(storage.resolve(key(kind)).toFile())
                .type("image/png")
                .header("Cache-Control", "private, max-age=300")
                .build();
    }

    @DELETE
    @Path("/company/{kind}")
    @RolesAllowed(Perm.SETTINGS_MANAGE)
    public Response deleteImage(@PathParam("kind") String kind) {
        checkKind(kind);
        storage.delete(key(kind));
        return Response.noContent().build();
    }

    private static void checkKind(String kind) {
        if (!IMAGES.contains(kind)) {
            throw ApiException.notFound("ไม่พบ");
        }
    }

    private static String key(String kind) {
        return "company/" + kind;
    }
}
