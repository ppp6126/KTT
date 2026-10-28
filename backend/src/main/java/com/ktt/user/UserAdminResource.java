package com.ktt.user;

import com.ktt.common.PageResult;
import com.ktt.security.Perm;
import com.ktt.user.UserDtos.CreateUserRequest;
import com.ktt.user.UserDtos.CreatedUser;
import com.ktt.user.UserDtos.PermissionDto;
import com.ktt.user.UserDtos.ResetPasswordRequest;
import com.ktt.user.UserDtos.RoleDto;
import com.ktt.user.UserDtos.RoleRequest;
import com.ktt.user.UserDtos.TemporaryPassword;
import com.ktt.user.UserDtos.UpdateUserRequest;
import com.ktt.user.UserDtos.UserRow;
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

import java.util.List;
import java.util.UUID;

@Path("/api")
@Produces(MediaType.APPLICATION_JSON)
public class UserAdminResource {

    @Inject
    UserAdminService users;

    @Inject
    RoleService roles;

    // ---------------------------------------------------------------- users

    @GET
    @Path("/users")
    @RolesAllowed(Perm.USER_READ)
    public PageResult<UserRow> list(@QueryParam("q") String q,
                                    @QueryParam("roleId") UUID roleId,
                                    @QueryParam("active") Boolean active,
                                    @QueryParam("page") @DefaultValue("0") @Min(0) int page,
                                    @QueryParam("size") @DefaultValue("20") @Min(1) @Max(200) int size) {
        return users.list(q, roleId, active, page, size);
    }

    /** รายชื่อผู้ใช้ที่ใช้งานอยู่ (สำหรับเลือกผู้รับผิดชอบ) ทุกคนที่ login แล้วเรียกได้ */
    @GET
    @Path("/users/options")
    @io.quarkus.security.Authenticated
    @jakarta.transaction.Transactional
    public List<java.util.Map<String, Object>> options() {
        List<com.ktt.auth.User> list = com.ktt.auth.User.list("active = true order by name");
        return list.stream().map(u -> java.util.Map.<String, Object>of("id", u.id, "name", u.name, "role", u.role.name)).toList();
    }

    @GET
    @Path("/users/{id}")
    @RolesAllowed(Perm.USER_READ)
    public UserRow get(@PathParam("id") UUID id) {
        return users.get(id);
    }

    @POST
    @Path("/users")
    @RolesAllowed(Perm.USER_MANAGE)
    public Response create(@Valid CreateUserRequest req) {
        CreatedUser created = users.create(req);
        return Response.status(201).entity(created).build();
    }

    @PUT
    @Path("/users/{id}")
    @RolesAllowed(Perm.USER_MANAGE)
    public UserRow update(@PathParam("id") UUID id, @Valid UpdateUserRequest req) {
        return users.update(id, req);
    }

    @DELETE
    @Path("/users/{id}")
    @RolesAllowed(Perm.USER_MANAGE)
    public Response delete(@PathParam("id") UUID id) {
        users.delete(id);
        return Response.noContent().build();
    }

    @POST
    @Path("/users/{id}/reset-password")
    @RolesAllowed(Perm.USER_MANAGE)
    public TemporaryPassword resetPassword(@PathParam("id") UUID id, @Valid ResetPasswordRequest req) {
        return new TemporaryPassword(users.resetPassword(id, req == null ? null : req.temporaryPassword()));
    }

    @POST
    @Path("/users/{id}/reset-mfa")
    @RolesAllowed(Perm.USER_MANAGE)
    public Response resetMfa(@PathParam("id") UUID id) {
        users.resetMfa(id);
        return Response.noContent().build();
    }

    @POST
    @Path("/users/{id}/unlock")
    @RolesAllowed(Perm.USER_MANAGE)
    public Response unlock(@PathParam("id") UUID id) {
        users.unlock(id);
        return Response.noContent().build();
    }

    @POST
    @Path("/users/{id}/revoke-sessions")
    @RolesAllowed(Perm.USER_MANAGE)
    public Response revokeSessions(@PathParam("id") UUID id) {
        users.revokeSessions(id);
        return Response.noContent().build();
    }

    // ---------------------------------------------------------------- roles & permissions

    @GET
    @Path("/permissions")
    @RolesAllowed({Perm.ROLE_MANAGE, Perm.USER_READ})
    public List<PermissionDto> permissions() {
        return roles.permissions();
    }

    @GET
    @Path("/roles")
    @RolesAllowed({Perm.ROLE_MANAGE, Perm.USER_READ})
    public List<RoleDto> roles() {
        return roles.list();
    }

    @GET
    @Path("/roles/{id}")
    @RolesAllowed(Perm.ROLE_MANAGE)
    public RoleDto role(@PathParam("id") UUID id) {
        return roles.get(id);
    }

    @POST
    @Path("/roles")
    @RolesAllowed(Perm.ROLE_MANAGE)
    public Response createRole(@Valid RoleRequest req) {
        return Response.status(201).entity(roles.create(req)).build();
    }

    @PUT
    @Path("/roles/{id}")
    @RolesAllowed(Perm.ROLE_MANAGE)
    public RoleDto updateRole(@PathParam("id") UUID id, @Valid RoleRequest req) {
        return roles.update(id, req);
    }

    @DELETE
    @Path("/roles/{id}")
    @RolesAllowed(Perm.ROLE_MANAGE)
    public Response deleteRole(@PathParam("id") UUID id) {
        roles.delete(id);
        return Response.noContent().build();
    }
}
