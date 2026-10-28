package com.ktt.attachment;

import com.ktt.common.ApiException;
import com.ktt.common.FileStorage;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import java.util.List;
import java.util.UUID;

/** สิทธิ์ตรวจใน AttachmentService (attachment.* + สิทธิ์ของรายการที่ไฟล์สังกัด) */
@Path("/api/attachments")
@Produces(MediaType.APPLICATION_JSON)
@Authenticated
public class AttachmentResource {

    @Inject
    AttachmentService service;

    @GET
    public List<AttachmentService.AttachmentDto> list(@QueryParam("ownerType") String ownerType,
                                                      @QueryParam("ownerId") UUID ownerId) {
        if (ownerType == null || ownerId == null) {
            throw ApiException.badRequest("missing_owner", "ต้องระบุ ownerType และ ownerId");
        }
        return service.list(ownerType, ownerId);
    }

    @POST
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    public Response upload(@RestForm("ownerType") String ownerType,
                           @RestForm("ownerId") String ownerId,
                           @RestForm("category") String category,
                           @RestForm("file") FileUpload file) {
        if (file == null || ownerType == null || ownerId == null) {
            throw ApiException.badRequest("no_file", "กรุณาเลือกไฟล์");
        }
        var dto = service.upload(ownerType, parseId(ownerId), category, file.uploadedFile(), file.fileName(), file.size());
        return Response.status(201).entity(dto).build();
    }

    @GET
    @Path("/{id}/file")
    public Response download(@PathParam("id") UUID id, @QueryParam("download") @DefaultValue("false") boolean download) {
        Attachment a = service.forDownload(id);
        return Response.ok(service.path(a).toFile())
                .type(a.mime)
                .header("Content-Disposition", FileStorage.disposition(download ? "attachment" : "inline", a.fileName))
                .header("Cache-Control", "private, max-age=3600")
                .header("X-Content-Type-Options", "nosniff")
                .build();
    }

    @DELETE
    @Path("/{id}")
    public Response delete(@PathParam("id") UUID id) {
        service.delete(id);
        return Response.noContent().build();
    }

    private static UUID parseId(String s) {
        try {
            return UUID.fromString(s.trim());
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("invalid_owner", "ownerId ไม่ถูกต้อง");
        }
    }
}
