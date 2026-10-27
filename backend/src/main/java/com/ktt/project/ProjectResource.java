package com.ktt.project;

import com.ktt.common.PageResult;
import com.ktt.project.ProjectDtos.ProjectDto;
import com.ktt.project.ProjectDtos.ProjectRow;
import com.ktt.project.ProjectDtos.SaveRequest;
import com.ktt.project.ProjectDtos.SaveTasksRequest;
import com.ktt.project.ProjectDtos.ScheduleDto;
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

@Path("/api/projects")
@Produces(MediaType.APPLICATION_JSON)
public class ProjectResource {

    @Inject
    ProjectService service;

    @GET
    @RolesAllowed({Perm.PROJECT_READ, Perm.PROJECT_READ_ALL})
    public PageResult<ProjectRow> list(@QueryParam("q") String q, @QueryParam("status") String status,
                                       @QueryParam("customerId") UUID customerId,
                                       @QueryParam("page") @DefaultValue("0") @Min(0) int page,
                                       @QueryParam("size") @DefaultValue("20") @Min(1) @Max(200) int size) {
        return service.list(q, status, customerId, page, size);
    }

    @GET
    @Path("/{id}")
    @RolesAllowed({Perm.PROJECT_READ, Perm.PROJECT_READ_ALL})
    public ProjectDto get(@PathParam("id") UUID id) {
        return service.get(id);
    }

    @POST
    @RolesAllowed(Perm.PROJECT_WRITE)
    public Response create(@Valid SaveRequest req) {
        return Response.status(201).entity(service.create(req)).build();
    }

    @PUT
    @Path("/{id}")
    @RolesAllowed(Perm.PROJECT_WRITE)
    public ProjectDto update(@PathParam("id") UUID id, @Valid SaveRequest req) {
        return service.update(id, req);
    }

    @DELETE
    @Path("/{id}")
    @RolesAllowed(Perm.PROJECT_WRITE)
    public Response delete(@PathParam("id") UUID id) {
        service.delete(id);
        return Response.noContent().build();
    }

    @GET
    @Path("/{id}/schedule")
    @RolesAllowed({Perm.PROJECT_READ, Perm.PROJECT_READ_ALL})
    public ScheduleDto schedule(@PathParam("id") UUID id) {
        return service.schedule(id);
    }

    @PUT
    @Path("/{id}/schedule")
    @RolesAllowed(Perm.PROJECT_WRITE)
    public ScheduleDto saveSchedule(@PathParam("id") UUID id, @Valid SaveTasksRequest req) {
        return service.saveTasks(id, req.tasks());
    }
}
