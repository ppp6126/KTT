package com.ktt.purchase;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

/** ผู้ขายวัสดุ และ/หรือ ผู้รับเหมาช่วง (personType กำหนดว่าใช้ ภ.ง.ด.3 หรือ ภ.ง.ด.53) */
@Entity
@Table(name = "suppliers")
@SQLRestriction("deleted_at is null")
public class Supplier extends BaseEntity {

    public String code;
    public String name;
    public String kind = "supplier";
    public String personType = "company";
    public String taxId;
    public String branchNo;
    public String address;
    public String phone;
    public String email;
    public String contactName;
    public String category;
    public int creditDays;
    public boolean vatRegistered = true;
    public String bankName;
    public String bankAccount;
    public String notes;
    public boolean active = true;
}
