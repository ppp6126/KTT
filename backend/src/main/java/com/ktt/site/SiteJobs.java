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

    @Inject
    com.ktt.stock.StockService stock;

    /** 07:15 ทุกวัน แจ้งสโตร์เมื่อวัสดุต่ำกว่าจุดสั่งซื้อ */
    @Scheduled(cron = "0 15 7 * * ?", timeZone = "Asia/Bangkok", identity = "low-stock")
    void lowStock() {
        int n = stock.notifyLowStock();
        if (n > 0) {
            LOG.infof("low stock items: %d", n);
        }
    }

    /** 17:30 ทุกวัน (เวลาไทย) เตือนโฟร์แมนที่ยังไม่ส่งรายงานประจำวัน */
    @Scheduled(cron = "0 30 17 * * ?", timeZone = "Asia/Bangkok", identity = "daily-report-reminder")
    void remindDailyReports() {
        int n = dailyReports.remindMissing();
        if (n > 0) {
            LOG.infof("daily report reminders sent: %d", n);
        }
    }
}
