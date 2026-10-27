# KTT ระบบหลังบ้านงานรับเหมาก่อสร้าง

ระบบจัดการลูกค้า ฐานราคา BOQ และใบเสนอราคา (Phase 1 ตาม SRS)

| ส่วน | เทคโนโลยี |
|---|---|
| backend | Java 21, Quarkus 3 (REST, Hibernate Panache, Flyway, SmallRye JWT) |
| frontend | Angular 22 (standalone, signals, zoneless) + Angular Material 3 + Tailwind utilities |
| database | PostgreSQL 16 |

## โครงสร้าง

```
backend/    Quarkus API (com.ktt.*)
  src/main/resources/db/migration/   ตารางทั้งหมดของ Phase 1 (V1-V5)
frontend/   Angular
docs/       เอกสารออกแบบ (auth-design.md)
deploy/     ตัวอย่าง nginx สำหรับ production
```

## เริ่มพัฒนา

ต้องมี Java 21, Maven 3.9+, Node 22+, Docker

```bash
# 1) ฐานข้อมูล + Mailpit
docker compose up -d

# 2) backend  (http://localhost:8080, Swagger: http://localhost:8080/q/swagger-ui)
cd backend
mvn quarkus:dev

# 3) frontend (http://localhost:4200 ส่ง /api ไป :8080 ผ่าน proxy.conf.json)
cd frontend
npm install
npm start
```

เข้าสู่ระบบครั้งแรกด้วย `admin@ktt.local` / `Admin@12345` ระบบจะให้ตั้งรหัสผ่านใหม่ แล้วตั้ง 2FA ด้วยแอป Authenticator (บทบาท owner บังคับใช้)

ในโหมด dev อีเมลรีเซ็ตรหัสผ่านไม่ถูกส่งจริง ลิงก์จะแสดงใน log ของ Quarkus (`[DEV] Password reset link ...`)

## ทดสอบ

```bash
cd backend && mvn test                     # unit test (TOTP, Argon2, เลขผู้เสียภาษี)
cd backend && mvn test -Dtest=AuthFlowIT   # ทดสอบ flow login ครบ กับ PostgreSQL จริง (ต้องมี Docker)
cd frontend && npx ng test --watch=false
```

## สิ่งที่ทำแล้ว

- ฐานข้อมูล Phase 1 ครบทุกตาราง (ผู้ใช้/สิทธิ์, CRM, ฐานราคา, BOQ, ใบเสนอราคา, การอนุมัติ, audit, เลขที่เอกสาร)
- ระบบ auth ครบ: login, 2FA (TOTP + รหัสสำรอง), refresh token rotation, จัดการ session, ลืม/เปลี่ยนรหัสผ่าน, ล็อกบัญชี, rate limit, RBAC, audit log (รายละเอียดใน [docs/auth-design.md](docs/auth-design.md))
- หน้าจัดการผู้ใช้ บทบาทและสิทธิ์ ประวัติการใช้งาน บัญชีของฉัน
- ทะเบียนลูกค้า (US-01): ค้นหา เพิ่ม แก้ไข ลบ ผู้ติดต่อ ตรวจเลขผู้เสียภาษี 13 หลัก PDPA

## ถัดไป (Phase 1)

1. Lead pipeline แบบ Kanban + กิจกรรม + ไฟล์แนบ (US-02 ถึง US-04)
2. ฐานราคากลาง วัสดุ/ค่าแรง/เครื่องจักร + นำเข้า Excel (US-05, US-06)
3. BOQ แบบลำดับชั้น + Template + Factor F (US-07 ถึง US-10)
4. ใบเสนอราคา + Revision + PDF ภาษาไทย + อนุมัติส่วนลด (US-11 ถึง US-15)
