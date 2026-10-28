package com.ktt.backup;

import com.ktt.backup.BackupService.RunDto;
import com.ktt.backup.BackupService.Settings;
import com.ktt.common.FileStorage;
import com.ktt.security.Perm;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
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

@Path("/api/backups")
@Produces(MediaType.APPLICATION_JSON)
@RolesAllowed(Perm.BACKUP_MANAGE)
public class BackupResource {

    public record SettingsRequest(boolean scheduled, int keepDays) {
    }

    @Inject
    BackupService service;

    @GET
    public List<RunDto> runs() {
        return service.runs();
    }

    @POST
    public RunDto run(@QueryParam("files") @DefaultValue("false") boolean includeFiles) {
        UUID id = service.runNow(includeFiles);
        return service.runs().stream().filter(r -> r.id().equals(id)).findFirst().orElseThrow();
    }

    @GET
    @Path("/settings")
    public Settings settings() {
        return service.settingsView();
    }

    @PUT
    @Path("/settings")
    public Settings updateSettings(SettingsRequest req) {
        return service.updateSettings(req.scheduled(), req.keepDays());
    }

    @GET
    @Path("/{id}/file")
    @Produces("application/zip")
    public Response download(@PathParam("id") UUID id) {
        java.nio.file.Path p = service.file(id);
        return Response.ok(p.toFile())
                .type("application/zip")
                .header("Content-Disposition", FileStorage.disposition("attachment", p.getFileName().toString()))
                .header("Cache-Control", "no-store")
                .build();
    }

    @DELETE
    @Path("/{id}")
    public Response delete(@PathParam("id") UUID id) {
        service.delete(id);
        return Response.noContent().build();
    }
}
