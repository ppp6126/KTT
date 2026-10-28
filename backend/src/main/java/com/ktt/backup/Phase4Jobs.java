package com.ktt.backup;

import com.ktt.permit.PermitService;
import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.jboss.logging.Logger;

/** งานตั้งเวลา Phase 4 (เวลาไทย) */
@ApplicationScoped
public class Phase4Jobs {

    private static final Logger LOG = Logger.getLogger(Phase4Jobs.class);

    @Inject
    BackupService backups;

    @Inject
    PermitService permits;

    /** 02:00 ทุกคืน สำรองข้อมูล (ไม่รวมไฟล์แนบ) แล้วลบไฟล์อัตโนมัติที่เก่าเกินระยะเก็บ */
    @Scheduled(cron = "0 0 2 * * ?", timeZone = "Asia/Bangkok", identity = "nightly-backup", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    void nightlyBackup() {
        if (!backups.scheduledEnabled()) {
            return;
        }
        backups.export("scheduled", null, false);
        int purged = backups.purgeOld();
        if (purged > 0) {
            LOG.infof("purged %d old backups", purged);
        }
    }

    /** 08:00 ทุกวัน แจ้งใบอนุญาต/เอกสารใกล้หมดอายุ */
    @Scheduled(cron = "0 0 8 * * ?", timeZone = "Asia/Bangkok", identity = "permit-expiry")
    void permitExpiry() {
        int n = permits.notifyExpiring();
        if (n > 0) {
            LOG.infof("permit expiry notices: %d", n);
        }
    }
}
