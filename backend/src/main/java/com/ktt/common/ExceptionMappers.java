package com.ktt.common;

import io.quarkus.hibernate.validator.runtime.jaxrs.ResteasyReactiveViolationException;
import io.quarkus.security.AuthenticationFailedException;
import io.quarkus.security.ForbiddenException;
import io.quarkus.security.UnauthorizedException;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import jakarta.validation.Path;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.jboss.logging.Logger;
import org.jboss.resteasy.reactive.server.ServerExceptionMapper;

import java.util.LinkedHashMap;
import java.util.Map;

/** แปลง exception ทั้งหมดเป็น JSON รูปแบบเดียวกัน */
public class ExceptionMappers {

    private static final Logger LOG = Logger.getLogger(ExceptionMappers.class);

    public record ErrorBody(String code, String message, Map<String, Object> details) {
    }

    @ServerExceptionMapper
    public Response mapApi(ApiException e) {
        return json(e.status(), new ErrorBody(e.code(), e.getMessage(), e.details()));
    }

    /** validation ที่ endpoint (@Valid) โยน subclass นี้ ต้อง map ตรงตัวเพื่อแทน mapper ตั้งต้นของ Quarkus */
    @ServerExceptionMapper
    public Response mapRestValidation(ResteasyReactiveViolationException e) {
        return mapValidation(e);
    }

    @ServerExceptionMapper
    public Response mapValidation(ConstraintViolationException e) {
        Map<String, Object> fields = new LinkedHashMap<>();
        for (ConstraintViolation<?> v : e.getConstraintViolations()) {
            fields.putIfAbsent(lastNode(v.getPropertyPath()), v.getMessage());
        }
        return json(400, new ErrorBody("validation", "ข้อมูลไม่ถูกต้อง", Map.of("fields", fields)));
    }

    @ServerExceptionMapper
    public Response mapUnauthorized(UnauthorizedException e) {
        return json(401, new ErrorBody("unauthorized", "กรุณาเข้าสู่ระบบ", null));
    }

    @ServerExceptionMapper
    public Response mapAuthFailed(AuthenticationFailedException e) {
        return json(401, new ErrorBody("unauthorized", "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่", null));
    }

    @ServerExceptionMapper
    public Response mapForbidden(ForbiddenException e) {
        return json(403, new ErrorBody("forbidden", "คุณไม่มีสิทธิ์ทำรายการนี้", null));
    }

    @ServerExceptionMapper
    public Response mapWebApp(WebApplicationException e) {
        int status = e.getResponse() != null ? e.getResponse().getStatus() : 500;
        String code = status == 404 ? "not_found" : status == 405 ? "method_not_allowed" : "http_" + status;
        return json(status, new ErrorBody(code, e.getMessage(), null));
    }

    @ServerExceptionMapper
    public Response mapUnexpected(Exception e) {
        LOG.error("Unexpected error", e);
        return json(500, new ErrorBody("internal_error", "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง", null));
    }

    private static Response json(int status, ErrorBody body) {
        return Response.status(status).entity(body).type(MediaType.APPLICATION_JSON).build();
    }

    private static String lastNode(Path path) {
        String name = null;
        for (Path.Node node : path) {
            name = node.getName();
        }
        return name == null ? "" : name;
    }
}
