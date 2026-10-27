package com.ktt.auth;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.util.List;
import java.util.UUID;

/** แคตตาล็อกสิทธิ์ (ระบบกำหนดผ่าน migration) */
@Entity
@Table(name = "permissions")
public class Permission extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    public UUID id;

    public String code;
    public String module;
    public String action;
    public String description;
    public int sortOrder;

    public static List<Permission> listOrdered() {
        return list("order by sortOrder, code");
    }
}
