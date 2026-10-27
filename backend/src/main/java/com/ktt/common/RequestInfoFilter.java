package com.ktt.common;

import io.vertx.core.http.HttpServerRequest;
import io.vertx.core.net.SocketAddress;
import jakarta.inject.Inject;
import jakarta.ws.rs.container.ContainerRequestContext;
import org.jboss.resteasy.reactive.server.ServerRequestFilter;

public class RequestInfoFilter {

    @Inject
    RequestInfo requestInfo;

    @ServerRequestFilter(preMatching = true)
    public void capture(ContainerRequestContext ctx, HttpServerRequest request) {
        // quarkus.http.proxy.proxy-address-forwarding=true ทำให้ remoteAddress เป็น IP จริงจาก X-Forwarded-For
        SocketAddress addr = request.remoteAddress();
        String ip = addr != null ? addr.hostAddress() : null;
        requestInfo.set(ip, ctx.getHeaderString("User-Agent"));
    }
}
