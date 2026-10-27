package com.ktt.customer;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "customers")
@SQLRestriction("deleted_at is null")
public class Customer extends BaseEntity {

    public static final String TYPE_PERSON = "person";
    public static final String TYPE_COMPANY = "company";

    /** person / company (คอลัมน์ type: ตั้งชื่อฟิลด์ต่างออกไปเพราะ type เป็นคำเฉพาะใน HQL) */
    @Column(name = "type")
    public String customerType;
    public String name;
    public String taxId;
    public String branchNo;
    public String phone;
    public String email;
    public String lineId;
    public String billingAddress;
    /** facebook / referral / google / other */
    public String source;
    public String note;
    public Instant pdpaConsentAt;

    @OneToMany(mappedBy = "customer")
    @OrderBy("createdAt")
    public List<Contact> contacts = new ArrayList<>();
}
