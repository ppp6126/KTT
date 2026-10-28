package com.ktt.quotation;

import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.jboss.logging.Logger;

/** ทุกเช้า: เปลี่ยนสถานะใบที่เลยวันหมดอายุ และแจ้งเตือนใบที่ใกล้หมดอายุ (US-18) */
@ApplicationScoped
public class QuotationJobs {

    private static final Logger LOG = Logger.getLogger(QuotationJobs.class);

    @Inject
    QuotationService service;

    @Scheduled(cron = "0 5 7 * * ?", timeZone = "Asia/Bangkok", identity = "quotation-expiry")
    void daily() {
        int expired = service.expireOverdue();
        service.notifyExpiringSoon();
        LOG.infof("Quotation job: %d expired", expired);
    }
}
