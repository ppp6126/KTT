package com.ktt.lead;

import com.ktt.docnum.DocNumberService;
import com.ktt.notification.NotificationService;
import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;

import java.time.Instant;
import java.util.List;

/** ทุกเช้า 07:30 แจ้งผู้รับผิดชอบลีดที่ถึงวันนัดติดตามผลแล้ว */
@ApplicationScoped
public class LeadReminderJob {

    @Inject
    NotificationService notifications;

    @Scheduled(cron = "0 30 7 * * ?", timeZone = "Asia/Bangkok", identity = "lead-followup")
    @Transactional
    void remind() {
        Instant endOfToday = DocNumberService.today().plusDays(1).atStartOfDay(DocNumberService.BANGKOK).toInstant();
        List<Lead> due = Lead.list("status not in ('won', 'lost') and nextFollowupAt is not null and nextFollowupAt < ?1 and owner is not null",
                endOfToday);
        for (Lead l : due) {
            notifications.notify(l.owner.id, "lead_followup", "ถึงวันติดตามลูกค้า: " + l.title,
                    l.customer.name, "/leads/" + l.id, "lead", l.id);
        }
    }
}
