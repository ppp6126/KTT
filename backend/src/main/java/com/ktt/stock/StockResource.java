package com.ktt.stock;

import com.ktt.security.Perm;
import com.ktt.stock.StockDtos.LedgerRow;
import com.ktt.stock.StockDtos.MinQtyRequest;
import com.ktt.stock.StockDtos.OnHandRow;
import com.ktt.stock.StockDtos.StockDocDto;
import com.ktt.stock.StockDtos.StockDocRequest;
import com.ktt.stock.StockDtos.WarehouseDto;
import com.ktt.stock.StockDtos.WarehouseRequest;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
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

@Path("/api/stock")
@Produces(MediaType.APPLICATION_JSON)
public class StockResource {

    @Inject
    StockService service;

    @GET
    @Path("/warehouses")
    @RolesAllowed({Perm.STOCK_READ, Perm.PURCHASE_READ, Perm.PURCHASE_REQUEST})
    public List<WarehouseDto> warehouses() {
        return service.warehouses();
    }

    @POST
    @Path("/warehouses")
    @RolesAllowed(Perm.STOCK_WRITE)
    public Response createWarehouse(@Valid WarehouseRequest req) {
        return Response.status(201).entity(service.saveWarehouse(null, req)).build();
    }

    @PUT
    @Path("/warehouses/{id}")
    @RolesAllowed(Perm.STOCK_WRITE)
    public WarehouseDto updateWarehouse(@PathParam("id") UUID id, @Valid WarehouseRequest req) {
        return service.saveWarehouse(id, req);
    }

    @GET
    @Path("/on-hand")
    @RolesAllowed(Perm.STOCK_READ)
    public List<OnHandRow> onHand(@QueryParam("warehouseId") UUID warehouseId, @QueryParam("q") String q,
                                  @QueryParam("low") @DefaultValue("false") boolean low) {
        return service.onHand(warehouseId, q, low);
    }

    @GET
    @Path("/ledger")
    @RolesAllowed(Perm.STOCK_READ)
    public List<LedgerRow> ledger(@QueryParam("materialId") UUID materialId, @QueryParam("warehouseId") UUID warehouseId) {
        return service.ledger(materialId, warehouseId);
    }

    @PUT
    @Path("/min-qty")
    @RolesAllowed(Perm.STOCK_WRITE)
    public Response minQty(@Valid MinQtyRequest req) {
        service.setMinQty(req.materialId(), req.warehouseId(), req.minQty());
        return Response.noContent().build();
    }

    @GET
    @Path("/docs")
    @RolesAllowed(Perm.STOCK_READ)
    public List<StockDocDto> docs(@QueryParam("projectId") UUID projectId, @QueryParam("limit") @DefaultValue("100") int limit) {
        return service.docs(projectId, limit);
    }

    @POST
    @Path("/docs")
    @RolesAllowed(Perm.STOCK_WRITE)
    public Response post(@Valid StockDocRequest req) {
        return Response.status(201).entity(service.post(req)).build();
    }
}
