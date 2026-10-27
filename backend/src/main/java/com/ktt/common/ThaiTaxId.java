package com.ktt.common;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** เลขประจำตัวผู้เสียภาษี/บัตรประชาชน 13 หลัก พร้อมตรวจ check digit (ค่าว่างถือว่าผ่าน) */
@Documented
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = ThaiTaxId.Validator.class)
public @interface ThaiTaxId {

    String message() default "เลขผู้เสียภาษีไม่ถูกต้อง";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

    class Validator implements ConstraintValidator<ThaiTaxId, String> {
        @Override
        public boolean isValid(String value, ConstraintValidatorContext ctx) {
            return value == null || value.isBlank() || isValidTaxId(value);
        }

        public static boolean isValidTaxId(String value) {
        if (value == null || !value.matches("\\d{13}")) {
            return false;
        }
        int sum = 0;
        for (int i = 0; i < 12; i++) {
            sum += (value.charAt(i) - '0') * (13 - i);
        }
        int check = (11 - (sum % 11)) % 10;
        return check == value.charAt(12) - '0';
        }
    }
}
