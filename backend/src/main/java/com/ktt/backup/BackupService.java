package com.ktt.backup;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ktt.audit.AuditService;
import com.ktt.common.ApiException;
import com.ktt.common.FileStorage;
import com.ktt.common.SqlValues;
import com.ktt.common.UserNames;
import com.ktt.docnum.DocNumberService;
import com.ktt.security.CurrentUser;
import com.ktt.security.Perm;
import com.ktt.settings.AppSettings;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import javax.sql.DataSource;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.Statement;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * สำรอง/ส่งออกข้อมูลทั้งระบบเป็นไฟล์ ZIP: ตารางละ 1 ไฟล์ CSV (UTF-8 BOM เปิดด้วย Excel ได้) + manifest.json
 * และเลือกรวมไฟล์แนบได้ ไม่รวมข้อมูลลับสำหรับเข้าสู่ระบบ (รหัสผ่าน TOTP token session)
 * การกู้คืนทั้งฐานข้อมูลให้ใช้ pg_dump/pg_restore ตามสคริปต์ใน README; ไฟล์นี้ใช้ส่งต่อข้อมูลหรือเก็บเป็นหลักฐาน
 */
@ApplicationScoped
public class BackupService {

    private static final Logger LOG = Logger.getLogger(BackupService.class);

    /** ไม่ส่งออกทั้งตาราง (ข้อมูลยืนยันตัวตนชั่วคราว) */
    static final Set<String> SKIP_TABLES = Set.of("mfa_challenges", "mfa_recovery_codes", "password_reset_tokens",
            "user_sessions", "user_identities", "flyway_schema_history");
    /** ไม่ส่งออกคอลัมน์ลับ */
    static final java.util.regex.Pattern FILE_NAME = java.util.regex.Pattern.compile("ktt-backup-[0-9-]+(-files)?\\.zip");
    static final Set<String> SKIP_COLUMNS = Set.of("users.password_hash", "users.totp_secret", "quotations.public_token_hash");

    public record RunDto(UUID id, String kind, String status, Instant startedAt, Instant finishedAt, String fileName, Long sizeBytes,
                         Integer tableCount, Long rowCount, String error, String createdByName, boolean fileAvailable) {
    }

    public record Settings(boolean scheduled, int keepDays, String directory) {
    }

    @Inject
    DataSource dataSource;

    @Inject
    EntityManager em;

    @Inject
    CurrentUser currentUser;

    @Inject
    AuditService audit;

    @Inject
    AppSettings settings;

    @Inject
    FileStorage storage;

    @Inject
    ObjectMapper mapper;

    @Inject
    BackupRuns runLog;

    @ConfigProperty(name = "ktt.backup.dir", defaultValue = "./data/backups")
    String backupDir;

    public void requireManage() {
        if (!currentUser.can(Perm.BACKUP_MANAGE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์สำรองข้อมูล");
        }
    }

    // ================================================================= runs

    @Transactional
    @SuppressWarnings("unchecked")
    public List<RunDto> runs() {
        requireManage();
        List<Object[]> rows = em.createNativeQuery("""
                select id, kind, status, started_at, finished_at, file_name, size_bytes, table_count, row_count, error, created_by
                from backup_runs order by started_at desc limit 100""").getResultList();
        Map<UUID, String> names = UserNames.of(rows.stream().map(r -> SqlValues.uuid(r[10])).filter(java.util.Objects::nonNull).toList());
        return rows.stream().map(r -> {
            String file = (String) r[5];
            return new RunDto(SqlValues.uuid(r[0]), (String) r[1], (String) r[2], SqlValues.instant(r[3]), SqlValues.instant(r[4]), file,
                    r[6] == null ? null : ((Number) r[6]).longValue(), r[7] == null ? null : ((Number) r[7]).intValue(),
                    r[8] == null ? null : ((Number) r[8]).longValue(), (String) r[9], names.get(SqlValues.uuid(r[10])),
                    file != null && Files.exists(dir().resolve(file)));
        }).toList();
    }

    @Transactional
    public Settings settingsView() {
        requireManage();
        return new Settings(settings.getBool("backup.scheduled", true), settings.getInt("backup.keep_days", 30), dir().toAbsolutePath().toString());
    }

    @Transactional
    public Settings updateSettings(boolean scheduled, int keepDays) {
        requireManage();
        if (keepDays < 1 || keepDays > 3650) {
            throw ApiException.badRequest("invalid_keep_days", "จำนวนวันที่เก็บต้องอยู่ระหว่าง 1 ถึง 3650");
        }
        settings.setValue("backup.scheduled", scheduled, currentUser.id());
        settings.setValue("backup.keep_days", keepDays, currentUser.id());
        audit.log("settings", null, AuditService.ACTION_UPDATE, null, Map.of("backup.scheduled", scheduled, "backup.keep_days", keepDays));
        return settingsView();
    }

    @Transactional
    public Path file(UUID runId) {
        requireManage();
        String name = (String) em.createNativeQuery("select file_name from backup_runs where id = ?1 and status = 'ok'")
                .setParameter(1, runId).getResultStream().findFirst().orElse(null);
        Path p = name == null || !FILE_NAME.matcher(name).matches() ? null : dir().resolve(name);
        if (p == null || !Files.exists(p)) {
            throw ApiException.notFound("ไม่พบไฟล์สำรอง (อาจถูกลบตามระยะเวลาเก็บแล้ว)");
        }
        audit.log("backup", runId, AuditService.ACTION_EXPORT, null, Map.of("file", name));
        return p;
    }

    @Transactional
    public void delete(UUID runId) {
        requireManage();
        String name = (String) em.createNativeQuery("select file_name from backup_runs where id = ?1")
                .setParameter(1, runId).getResultStream().findFirst().orElse(null);
        if (name != null && FILE_NAME.matcher(name).matches()) {
            try {
                Files.deleteIfExists(dir().resolve(name));
            } catch (IOException e) {
                throw new ApiException(500, "delete_failed", "ลบไฟล์ไม่สำเร็จ");
            }
        }
        em.createNativeQuery("delete from backup_runs where id = ?1").setParameter(1, runId).executeUpdate();
        audit.log("backup", runId, AuditService.ACTION_DELETE, null, null);
    }

    // ================================================================= export

    /** สำรองข้อมูลตอนนี้ (ผู้ใช้กด) คืน id ของรายการ */
    public UUID runNow(boolean includeFiles) {
        requireManage();
        return export("manual", currentUser.id(), includeFiles);
    }

    /** ใช้โดยงานตั้งเวลา: ไม่ตรวจสิทธิ์ */
    public UUID export(String kind, UUID userId, boolean includeFiles) {
        UUID runId = runLog.start(kind, userId);
        String stamp = LocalDateTime.now(DocNumberService.BANGKOK).format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss"));
        String fileName = "ktt-backup-" + stamp + (includeFiles ? "-files" : "") + ".zip";
        Path tmp = null;
        try {
            Files.createDirectories(dir());
            tmp = Files.createTempFile(dir(), ".ktt-backup-", ".part");
            long rows = 0;
            int tables = 0;
            Map<String, Object> manifest = new LinkedHashMap<>();
            List<Map<String, Object>> tableInfo = new ArrayList<>();
            try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(tmp));
                 Connection c = dataSource.getConnection()) {
                c.setReadOnly(true);
                c.setAutoCommit(false); // ให้ทุกตารางอ่านจาก snapshot เดียวกัน
                try (Statement st = c.createStatement()) {
                    st.execute("set transaction isolation level repeatable read");
                }
                for (String t : tables(c)) {
                    zip.putNextEntry(new ZipEntry("tables/" + t + ".csv"));
                    long n = writeTable(c, t, zip);
                    zip.closeEntry();
                    rows += n;
                    tables++;
                    tableInfo.add(Map.of("table", t, "rows", n));
                }
                int files = 0;
                if (includeFiles) {
                    files = writeAttachments(c, zip);
                }
                c.commit();
                manifest.put("app", "KTT");
                manifest.put("createdAt", Instant.now().toString());
                manifest.put("schemaVersion", schemaVersion(c));
                manifest.put("tables", tableInfo);
                manifest.put("attachmentFiles", files);
                manifest.put("excludedTables", SKIP_TABLES);
                manifest.put("excludedColumns", SKIP_COLUMNS);
                zip.putNextEntry(new ZipEntry("manifest.json"));
                zip.write(mapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(manifest));
                zip.closeEntry();
            }
            Path target = dir().resolve(fileName);
            Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            runLog.finish(runId, "ok", fileName, Files.size(target), tables, rows, null);
            LOG.infof("backup %s: %d tables, %d rows", fileName, tables, rows);
        } catch (Exception e) {
            LOG.error("backup failed", e);
            if (tmp != null) {
                try {
                    Files.deleteIfExists(tmp);
                } catch (IOException ignored) {
                    // ไฟล์ชั่วคราวลบไม่ได้ ไม่กระทบผลลัพธ์
                }
            }
            runLog.finish(runId, "failed", null, null, null, null, e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
        }
        return runId;
    }

    private List<String> tables(Connection c) throws java.sql.SQLException {
        List<String> out = new ArrayList<>();
        try (Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1")) {
            while (rs.next()) {
                String t = rs.getString(1);
                if (!SKIP_TABLES.contains(t) && t.matches("[a-z0-9_]+")) {
                    out.add(t);
                }
            }
        }
        return out;
    }

    private String schemaVersion(Connection c) {
        try (Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("select max(version) from flyway_schema_history where success")) {
            return rs.next() ? rs.getString(1) : null;
        } catch (java.sql.SQLException e) {
            return null; // ไม่มีตาราง flyway (เช่นทดสอบ) ไม่ถือเป็นข้อผิดพลาด
        }
    }

    private long writeTable(Connection c, String table, ZipOutputStream zip) throws Exception {
        Writer w = new BufferedWriter(new OutputStreamWriter(new NonClosing(zip), StandardCharsets.UTF_8));
        long n = 0;
        try (Statement st = c.createStatement()) {
            st.setFetchSize(1000);
            try (ResultSet rs = st.executeQuery("select * from " + table)) {
                ResultSetMetaData md = rs.getMetaData();
                int cols = md.getColumnCount();
                List<Integer> keep = new ArrayList<>();
                List<String> header = new ArrayList<>();
                for (int i = 1; i <= cols; i++) {
                    String col = md.getColumnName(i);
                    if (!SKIP_COLUMNS.contains(table + "." + col)) {
                        keep.add(i);
                        header.add(col);
                    }
                }
                w.write('﻿');
                w.write(CsvWriter.line(header));
                while (rs.next()) {
                    List<String> vals = new ArrayList<>(keep.size());
                    for (int i : keep) {
                        Object v = rs.getObject(i);
                        vals.add(v == null ? null : v instanceof java.sql.Array a ? CsvWriter.array(a.getArray()) : v.toString());
                    }
                    w.write(CsvWriter.line(vals));
                    n++;
                }
            }
        }
        w.flush();
        return n;
    }

    private int writeAttachments(Connection c, ZipOutputStream zip) throws Exception {
        int n = 0;
        try (Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("select file_key from attachments where deleted_at is null")) {
            while (rs.next()) {
                String key = rs.getString(1);
                if (key == null || !storage.exists(key)) {
                    continue;
                }
                zip.putNextEntry(new ZipEntry("files/" + key));
                Files.copy(storage.resolve(key), zip);
                zip.closeEntry();
                n++;
            }
        }
        return n;
    }

    // ================================================================= housekeeping

    /** ลบไฟล์สำรองอัตโนมัติที่เก่ากว่า keep_days (ไฟล์ที่กดสำรองเองเก็บไว้จนกว่าจะลบ) */
    @Transactional
    @SuppressWarnings("unchecked")
    public int purgeOld() {
        int keep = settings.getInt("backup.keep_days", 30);
        List<Object[]> old = em.createNativeQuery("""
                        select id, file_name from backup_runs where kind = 'scheduled' and started_at < now() - make_interval(days => ?1)""")
                .setParameter(1, keep).getResultList();
        for (Object[] r : old) {
            if (r[1] != null && FILE_NAME.matcher((String) r[1]).matches()) {
                try {
                    Files.deleteIfExists(dir().resolve((String) r[1]));
                } catch (IOException e) {
                    LOG.warnf("cannot delete old backup %s", r[1]);
                    continue;
                }
            }
            em.createNativeQuery("delete from backup_runs where id = ?1").setParameter(1, r[0]).executeUpdate();
        }
        return old.size();
    }

    @Transactional
    public boolean scheduledEnabled() {
        return settings.getBool("backup.scheduled", true);
    }

    Path dir() {
        return Path.of(backupDir);
    }

    /** ป้องกัน writer ปิด ZipOutputStream ระหว่างตาราง */
    private static final class NonClosing extends java.io.FilterOutputStream {
        NonClosing(java.io.OutputStream out) {
            super(out);
        }

        @Override
        public void write(byte[] b, int off, int len) throws IOException {
            out.write(b, off, len);
        }

        @Override
        public void close() throws IOException {
            flush();
        }
    }
}
