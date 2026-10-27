package com.ktt.lead;

import com.ktt.auth.User;
import com.ktt.common.BaseEntity;
import com.ktt.customer.Customer;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;

@Entity
@Table(name = "leads")
@SQLRestriction("deleted_at is null")
public class Lead extends BaseEntity {

    /** 7 สถานะตาม FR-02 เรียงตาม pipeline */
    public static final List<String> STATUSES = List.of("new", "site_visit", "estimating", "quoted", "negotiating", "won", "lost");
    public static final Set<String> JOB_TYPES = Set.of("new_house", "extension", "renovation", "interior", "mep",
            "landscape", "structure", "roof", "repair", "subcontract");

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "customer_id")
    public Customer customer;

    public String title;
    public String jobType;
    public String siteAddress;
    public BigDecimal budgetEst;
    public String status = "new";
    public String lostReason;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id")
    public User owner;

    public Instant nextFollowupAt;
}
