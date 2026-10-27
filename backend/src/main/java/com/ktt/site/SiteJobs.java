package com.ktt.site;

import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.jboss.logging.Logger;

@ApplicationScoped
public class SiteJobs {

    private static final Logger LOG = Logger.getLogger(SiteJobs.class);

    @Inject
    DailyReportService dailyReports;

    /** 17:30 ทุกวัน (เวลาไทย) เตือนโฟร์แมนที่ยังไม่ส่งรายงานประจำวัน */
    @Scheduled(cron = "0 30 17 * * ?", timeZone = "Asia/Bangkok", identity = "daily-report-reminder")
    void remindDailyReports() {
        int n = dailyReports.remindMissing();
        if (n > 0) {
            LOG.infof("daily report reminders sent: %d", n);
        }
    }
}
