package com.ktt.dashboard;

import com.ktt.dashboard.DashboardService.Dashboard;
import com.ktt.security.Perm;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

@Path("/api/dashboard")
@Produces(MediaType.APPLICATION_JSON)
@RolesAllowed(Perm.DASHBOARD_VIEW)
public class DashboardResource {

    @Inject
    DashboardService service;

    @GET
    public Dashboard summary() {
        return service.summary();
    }
}
