package com.ktt.calendar;

import com.ktt.calendar.CalendarService.EventDto;
import com.ktt.calendar.CalendarService.EventRequest;
import com.ktt.calendar.CalendarService.Item;
import io.quarkus.security.Authenticated;
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

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** ปฏิทินเปิดให้ทุกคนที่เข้าสู่ระบบ แต่ละแหล่งข้อมูลกรองตามสิทธิ์ของผู้ใช้ */
@Path("/api/calendar")
@Produces(MediaType.APPLICATION_JSON)
@Authenticated
public class CalendarResource {

    @Inject
    CalendarService service;

    @GET
    public List<Item> items(@QueryParam("from") LocalDate from, @QueryParam("to") LocalDate to, @QueryParam("sources") String sources) {
        return service.items(from, to, sources);
    }

    @GET
    @Path("/events/{id}")
    public EventDto event(@PathParam("id") UUID id) {
        return service.get(id);
    }

    @POST
    @Path("/events")
    public Response create(@Valid EventRequest req) {
        return Response.status(201).entity(service.save(null, req)).build();
    }

    @PUT
    @Path("/events/{id}")
    public EventDto update(@PathParam("id") UUID id, @Valid EventRequest req) {
        return service.save(id, req);
    }

    @DELETE
    @Path("/events/{id}")
    public Response delete(@PathParam("id") UUID id) {
        service.delete(id);
        return Response.noContent().build();
    }
}
