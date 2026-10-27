package com.ktt.common;

import jakarta.enterprise.context.RequestScoped;

/** ข้อมูลของ request ปัจจุบัน (IP, User-Agent) เติมโดย {@link RequestInfoFilter} */
@RequestScoped
public class RequestInfo {

    private String ip;
    private String userAgent;

    public String ip() {
        return ip;
    }

    public String userAgent() {
        return userAgent;
    }

    void set(String ip, String userAgent) {
        this.ip = ip;
        if (userAgent != null && userAgent.length() > 500) {
            userAgent = userAgent.substring(0, 500);
        }
        this.userAgent = userAgent;
    }
}
