package com.ktt.auth;

import com.ktt.common.ApiException;
import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * จำกัดจำนวนครั้งที่เรียก endpoint ยืนยันตัวตนต่อ IP (sliding window, เก็บในหน่วยความจำ).
 * ถ้ารันหลาย instance ควรย้ายไปใช้ Redis หรือ rate limit ที่ reverse proxy เพิ่มเติม
 */
@ApplicationScoped
public class LoginThrottle {

    @Inject
    AuthConfig config;

    private final Map<String, Deque<Long>> attempts = new ConcurrentHashMap<>();

    /** นับ 1 ครั้ง ถ้าเกินเกณฑ์จะโยน 429 */
    public void hit(String bucket, String ip) {
        if (ip == null) {
            return;
        }
        long now = System.currentTimeMillis();
        long windowMs = config.ipWindow().toMillis();
        Deque<Long> q = attempts.computeIfAbsent(bucket + "|" + ip, k -> new ArrayDeque<>());
        synchronized (q) {
            while (!q.isEmpty() && q.peekFirst() < now - windowMs) {
                q.pollFirst();
            }
            if (q.size() >= config.ipMaxAttempts()) {
                throw ApiException.tooManyRequests("พยายามหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่");
            }
            q.addLast(now);
        }
    }

    @Scheduled(every = "10m")
    void cleanup() {
        long cutoff = System.currentTimeMillis() - config.ipWindow().toMillis();
        attempts.entrySet().removeIf(e -> {
            synchronized (e.getValue()) {
                return e.getValue().isEmpty() || e.getValue().peekLast() < cutoff;
            }
        });
    }
}
