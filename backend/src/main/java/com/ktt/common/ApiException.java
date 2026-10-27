package com.ktt.common;

import java.util.Map;

/**
 * ข้อผิดพลาดที่ส่งกลับไปยัง client ในรูปแบบ {@code {code, message, details}}.
 * code เป็นภาษาอังกฤษให้ frontend ใช้ตัดสินใจ, message เป็นภาษาไทยไว้แสดงผู้ใช้
 */
public class ApiException extends RuntimeException {

    private final int status;
    private final String code;
    private final transient Map<String, Object> details;

    public ApiException(int status, String code, String message) {
        this(status, code, message, null);
    }

    public ApiException(int status, String code, String message, Map<String, Object> details) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
    }

    public int status() {
        return status;
    }

    public String code() {
        return code;
    }

    public Map<String, Object> details() {
        return details;
    }

    public static ApiException badRequest(String code, String message) {
        return new ApiException(400, code, message);
    }

    public static ApiException unauthorized(String code, String message) {
        return new ApiException(401, code, message);
    }

    public static ApiException forbidden(String code, String message) {
        return new ApiException(403, code, message);
    }

    public static ApiException notFound(String message) {
        return new ApiException(404, "not_found", message);
    }

    public static ApiException conflict(String code, String message) {
        return new ApiException(409, code, message);
    }

    public static ApiException locked(String code, String message) {
        return new ApiException(423, code, message);
    }

    public static ApiException tooManyRequests(String message) {
        return new ApiException(429, "too_many_requests", message);
    }
}
