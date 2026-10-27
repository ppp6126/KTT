package com.ktt.common;

import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * เก็บไฟล์ในดิสก์ของเซิร์ฟเวอร์ (ktt.storage.dir) เช่น /var/lib/ktt/files/2026/10/uuid.jpg
 * ต้อง backup โฟลเดอร์นี้พร้อมฐานข้อมูล
 */
@ApplicationScoped
public class FileStorage {

    /** นามสกุลที่อนุญาต: รูปหน้างาน, แบบ, เอกสาร */
    public static final Set<String> ALLOWED_EXT = Set.of(
            "jpg", "jpeg", "png", "webp", "gif", "heic", "pdf", "doc", "docx", "xls", "xlsx", "csv",
            "dwg", "dxf", "zip", "txt");

    public static final Set<String> IMAGE_EXT = Set.of("jpg", "jpeg", "png", "webp", "gif");

    private final Path root;

    public FileStorage(@ConfigProperty(name = "ktt.storage.dir") String dir) {
        this.root = Path.of(dir).toAbsolutePath().normalize();
        try {
            Files.createDirectories(root);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot create storage dir " + root, e);
        }
    }

    public static String extension(String fileName) {
        if (fileName == null) {
            return "";
        }
        int i = fileName.lastIndexOf('.');
        return i < 0 ? "" : fileName.substring(i + 1).toLowerCase(Locale.ROOT);
    }

    public static void checkAllowed(String fileName) {
        if (!ALLOWED_EXT.contains(extension(fileName))) {
            throw ApiException.badRequest("file_type_not_allowed",
                    "ไม่รองรับไฟล์ประเภทนี้ (รองรับ: รูปภาพ, PDF, Word, Excel, DWG/DXF, ZIP)");
        }
    }

    /** ย้ายไฟล์ที่อัปโหลดเข้าคลัง คืน key สำหรับเก็บใน DB */
    public String store(Path source, String originalName) {
        LocalDate d = LocalDate.now();
        String ext = extension(originalName);
        String key = "%d/%02d/%s%s".formatted(d.getYear(), d.getMonthValue(), UUID.randomUUID(), ext.isEmpty() ? "" : "." + ext);
        Path target = resolve(key);
        try {
            Files.createDirectories(target.getParent());
            Files.copy(source, target, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return key;
    }

    /** เขียนไฟล์ที่ key คงที่ (เช่น โลโก้บริษัท) */
    public void storeAt(Path source, String key) {
        Path target = resolve(key);
        try {
            Files.createDirectories(target.getParent());
            Files.copy(source, target, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public Path resolve(String key) {
        Path p = root.resolve(key).normalize();
        if (!p.startsWith(root)) {
            throw ApiException.badRequest("invalid_key", "invalid file key");
        }
        return p;
    }

    public boolean exists(String key) {
        return Files.exists(resolve(key));
    }

    public void delete(String key) {
        try {
            Files.deleteIfExists(resolve(key));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public static String guessMime(String fileName) {
        return switch (extension(fileName)) {
            case "jpg", "jpeg" -> "image/jpeg";
            case "png" -> "image/png";
            case "webp" -> "image/webp";
            case "gif" -> "image/gif";
            case "heic" -> "image/heic";
            case "pdf" -> "application/pdf";
            case "doc" -> "application/msword";
            case "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            case "xls" -> "application/vnd.ms-excel";
            case "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            case "csv" -> "text/csv";
            case "zip" -> "application/zip";
            case "txt" -> "text/plain";
            default -> "application/octet-stream";
        };
    }

    /** Content-Disposition ที่รองรับชื่อไฟล์ภาษาไทย */
    public static String disposition(String type, String fileName) {
        String safe = fileName == null ? "file" : fileName.replaceAll("[\\r\\n\"]", "_");
        String ascii = safe.replaceAll("[^\\x20-\\x7E]", "_");
        String encoded = java.net.URLEncoder.encode(safe, java.nio.charset.StandardCharsets.UTF_8).replace("+", "%20");
        return type + "; filename=\"" + ascii + "\"; filename*=UTF-8''" + encoded;
    }
}
