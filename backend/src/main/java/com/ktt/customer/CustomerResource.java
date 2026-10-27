package com.ktt.customer;

import com.ktt.common.PageResult;
import com.ktt.customer.CustomerDtos.CustomerDto;
import com.ktt.customer.CustomerDtos.CustomerRequest;
import com.ktt.customer.CustomerDtos.CustomerRow;
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

@Path("/api/customers")
@Produces(MediaType.APPLICATION_JSON)
public class CustomerResource {

    @Inject
    CustomerService service;

    @GET
    @RolesAllowed(Perm.CUSTOMER_READ)
    public PageResult<CustomerRow> list(@QueryParam("q") String q,
                                        @QueryParam("type") String type,
                                        @QueryParam("source") String source,
                                        @QueryParam("sort") @DefaultValue("name") String sort,
                                        @QueryParam("dir") @DefaultValue("asc") String dir,
                                        @QueryParam("page") @DefaultValue("0") @Min(0) int page,
                                        @QueryParam("size") @DefaultValue("20") @Min(1) @Max(200) int size) {
        return service.list(q, type, source, sort, dir, page, size);
    }

    @GET
    @Path("/{id}")
    @RolesAllowed(Perm.CUSTOMER_READ)
    public CustomerDto get(@PathParam("id") UUID id) {
        return service.get(id);
    }

    @POST
    @RolesAllowed(Perm.CUSTOMER_WRITE)
    public Response create(@Valid CustomerRequest req) {
        return Response.status(201).entity(service.create(req)).build();
    }

    @PUT
    @Path("/{id}")
    @RolesAllowed(Perm.CUSTOMER_WRITE)
    public CustomerDto update(@PathParam("id") UUID id, @Valid CustomerRequest req) {
        return service.update(id, req);
    }

    @DELETE
    @Path("/{id}")
    @RolesAllowed(Perm.CUSTOMER_DELETE)
    public Response delete(@PathParam("id") UUID id) {
        service.delete(id);
        return Response.noContent().build();
    }
}
