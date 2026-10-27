package com.ktt.auth;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.util.HashSet;
import java.util.Set;
import java.util.TreeSet;

@Entity
@Table(name = "roles")
@SQLRestriction("deleted_at is null")
public class Role extends BaseEntity {

    public static final String OWNER = "owner";

    public String code;
    public String name;
    public String description;

    @Column(name = "is_system")
    public boolean system;

    @ManyToMany
    @JoinTable(name = "role_permissions",
            joinColumns = @JoinColumn(name = "role_id"),
            inverseJoinColumns = @JoinColumn(name = "permission_id"))
    public Set<Permission> permissions = new HashSet<>();

    public Set<String> permissionCodes() {
        Set<String> codes = new TreeSet<>();
        for (Permission p : permissions) {
            codes.add(p.code);
        }
        return codes;
    }

    public static Role findByCode(String code) {
        return find("code", code).firstResult();
    }
}
