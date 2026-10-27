package com.ktt.customer;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

/** ผู้ติดต่อของลูกค้า (เช่น ผู้จัดการฝ่ายจัดซื้อของบริษัทลูกค้า) */
@Entity
@Table(name = "contacts")
@SQLRestriction("deleted_at is null")
public class Contact extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "customer_id")
    public Customer customer;

    public String name;
    public String position;
    public String phone;
    public String email;
}
