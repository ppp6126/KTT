# การออกแบบระบบ Login / Auth / สิทธิ์

ระบบหลังบ้าน KTT (Quarkus + Angular) เวอร์ชัน 0.1

## 1. ภาพรวม

| ส่วน | วิธีที่ใช้ |
|---|---|
| ยืนยันตัวตน | อีเมล + รหัสผ่าน (Argon2id) และ TOTP 2FA (บังคับสำหรับบทบาท owner และ admin) |
| Access token | JWT RS256 อายุ 15 นาที เก็บใน memory ของเว็บเท่านั้น ส่งผ่าน `Authorization: Bearer` |
| Refresh token | ค่าสุ่ม 256 บิต อยู่ใน cookie `ktt_rt` แบบ HttpOnly + Secure + SameSite=Strict ที่ path `/api/auth` (DB เก็บแค่ SHA-256) |
| Session | หนึ่งแถวใน `user_sessions` ต่อหนึ่งอุปกรณ์ หมดอายุเมื่อไม่ใช้งาน 30 นาที หรือครบ 12 ชั่วโมง |
| สิทธิ์ | RBAC แบบ `module.action` ใส่ใน claim `groups` ของ JWT ตรวจด้วย `@RolesAllowed` ทุก endpoint |
| ต้นทุน/กำไร | สิทธิ์ `cost.view` ถ้าไม่มี API จะไม่ส่งฟิลด์ต้นทุนออกไปเลย |
| Audit | ทุกการเปลี่ยนแปลงข้อมูลและเหตุการณ์ login ลง `audit_logs` (before/after เป็น jsonb) |

ทำไมไม่เก็บ token ใน localStorage: ถ้ามีช่องโหว่ XSS สคริปต์จะอ่าน localStorage ได้ แต่อ่าน cookie แบบ HttpOnly ไม่ได้ ส่วน access token ใน memory มีอายุแค่ 15 นาที

## 2. ขั้นตอน Login

```
เว็บ                                   Quarkus
 │ POST /api/auth/login {email,pw}  ─►  ตรวจ rate limit ต่อ IP (30 ครั้ง / 5 นาที)
 │                                      ตรวจรหัสผ่าน (ไม่พบอีเมลก็ hash หลอกให้ใช้เวลาเท่ากัน)
 │                                      ผิด 5 ครั้ง → ล็อก 15 นาที
 │                                      ┌ เปิด 2FA → สร้าง mfa_challenges (อายุ 5 นาที)
 │ ◄─ {mfaRequired:true, mfaToken}      │
 │ POST /api/auth/mfa/verify        ─►  │ ตรวจรหัส 6 หลัก (±30 วินาที, ห้ามใช้รหัสเดิมซ้ำ) หรือรหัสสำรอง
 │                                      └ ผิดได้ 5 ครั้งต่อ challenge
 │ ◄─ {accessToken, user} + Set-Cookie ktt_rt
```

ถ้า `user.mustChangePassword` หรือบทบาทบังคับ 2FA แต่ยังไม่ได้ตั้ง token ที่ได้จะมี claim `rst` (`password_change` / `mfa_setup`) และไม่มีสิทธิ์ใดๆ เรียกได้เฉพาะ `/api/auth/**` เว็บจะพาไปหน้า `/setup/password` หรือ `/setup/mfa`

## 3. Refresh และการตรวจจับ token ถูกขโมย

- `POST /api/auth/refresh` (ส่ง cookie อัตโนมัติ) ได้ access token ใหม่ + refresh token ใหม่ทุกครั้ง (rotation)
- token เก่าถูกเก็บเป็น `prev_token_hash`
  - ถูกส่งซ้ำภายใน 20 วินาที (หลายแท็บ refresh พร้อมกัน) → ตอบ 409 ให้เว็บลองใหม่ด้วย cookie ล่าสุด
  - ถูกส่งซ้ำหลังจากนั้น → ถือว่า token รั่ว ยกเลิก session นั้นทันที
- ทุก request ที่มี access token จะตรวจว่า session (`sid`) ยังไม่ถูกยกเลิก (cache 30 วินาที) ดังนั้น logout, ปิดผู้ใช้, เปลี่ยนรหัสผ่าน มีผลภายใน 30 วินาทีแม้ JWT ยังไม่หมดอายุ

## 4. เหตุการณ์ที่ยกเลิก session

| เหตุการณ์ | session ที่ถูกยกเลิก |
|---|---|
| ผู้ใช้ logout | session ปัจจุบัน |
| เปลี่ยนรหัสผ่านเอง | ทุก session ยกเว้นเครื่องที่กำลังใช้ |
| รีเซ็ตรหัสผ่านทางอีเมล / ผู้ดูแลรีเซ็ตให้ | ทุก session |
| เปิด 2FA | ทุก session ยกเว้นเครื่องที่กำลังใช้ |
| ผู้ดูแลเปลี่ยนบทบาท / ปิดบัญชี / ลบผู้ใช้ | ทุก session |
| ไม่ใช้งาน 30 นาที | เว็บ logout อัตโนมัติ และ refresh ฝั่ง server หมดอายุ |

การแก้สิทธิ์ของบทบาท (ไม่ได้ย้ายบทบาท) มีผลเมื่อ access token ถูกออกใหม่ คือภายใน 15 นาที

## 5. บทบาทตั้งต้น

| บทบาท | สิทธิ์ |
|---|---|
| owner เจ้าของ/ผู้บริหาร | ทุกสิทธิ์เสมอ (รวมสิทธิ์ที่เพิ่มในอนาคต) แก้ไขไม่ได้ ต้องมีอย่างน้อย 1 คน |
| admin ผู้ดูแลระบบ | ผู้ใช้ บทบาท audit ตั้งค่า + อ่านข้อมูลธุรกิจ (ไม่เห็นต้นทุน) |
| sales ฝ่ายขาย | ลูกค้า ลีดของตัวเอง ใบเสนอราคา (ไม่เห็นต้นทุน) |
| estimator วิศวกร/ประมาณราคา | ฐานราคา BOQ เห็นต้นทุน อ่านลูกค้า/ลีดทั้งหมด |

ผู้ดูแลสร้างบทบาทเพิ่มและติ๊กสิทธิ์เองได้ที่หน้า "บทบาทและสิทธิ์" รายการสิทธิ์ทั้งหมดอยู่ใน `V5__seed_roles_permissions.sql` และ `Perm.java`

## 6. API

| Method | Path | สิทธิ์ |
|---|---|---|
| POST | /api/auth/login | สาธารณะ |
| POST | /api/auth/mfa/verify | สาธารณะ (ต้องมี mfaToken) |
| POST | /api/auth/refresh | cookie |
| POST | /api/auth/logout | cookie |
| GET | /api/auth/me | login แล้ว |
| POST | /api/auth/password/change | login แล้ว |
| POST | /api/auth/password/forgot | สาธารณะ (ตอบเหมือนกันเสมอ ไม่บอกว่ามีอีเมลนี้หรือไม่) |
| POST | /api/auth/password/reset | สาธารณะ (token จากอีเมล อายุ 30 นาที ใช้ครั้งเดียว) |
| POST | /api/auth/mfa/setup, /mfa/enable, /mfa/disable, /mfa/recovery-codes | login แล้ว |
| GET / DELETE | /api/auth/sessions, /sessions/{id}, POST /sessions/revoke-others | login แล้ว |
| GET/POST/PUT/DELETE | /api/users, /api/users/{id}/reset-password, reset-mfa, unlock, revoke-sessions | user.read / user.manage |
| GET/POST/PUT/DELETE | /api/roles, /api/permissions | role.manage |
| GET | /api/audit-logs | audit.read |

Error ทุกตัวใช้รูปแบบ `{ "code": "invalid_credentials", "message": "ข้อความภาษาไทย", "details": {...} }`

## 7. ค่าที่ต้องตั้งใน production

| ตัวแปร | ความหมาย |
|---|---|
| `DB_URL`, `DB_USER`, `DB_PASSWORD` | PostgreSQL |
| `JWT_PRIVATE_KEY_LOCATION`, `JWT_PUBLIC_KEY_LOCATION` | คู่กุญแจ RSA สำหรับ JWT (`file:/run/secrets/jwt-private.pem`) สร้างใหม่ ห้ามใช้ dev-keys |
| `KTT_DATA_KEY` | กุญแจ AES-256 สำหรับเข้ารหัส TOTP secret (`openssl rand -base64 32`) ห้ามหาย ไม่งั้นทุกคนต้องตั้ง 2FA ใหม่ |
| `KTT_ADMIN_EMAIL`, `KTT_ADMIN_PASSWORD` | ผู้ใช้คนแรก (ใช้ครั้งเดียวตอนฐานข้อมูลว่าง) |
| `KTT_APP_BASE_URL` | URL หน้าเว็บ ใช้สร้างลิงก์ในอีเมลรีเซ็ตรหัสผ่าน |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | อีเมล |

ต้องเสิร์ฟผ่าน HTTPS และให้เว็บกับ API อยู่โดเมนเดียวกัน (เช่น nginx ส่ง `/api` ไป Quarkus) เพราะ cookie เป็น SameSite=Strict

สร้างคู่กุญแจ JWT:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out jwt-private.pem
openssl pkey -in jwt-private.pem -pubout -out jwt-public.pem
```

## 8. ต่อยอดในอนาคต

- Google / LINE Login (Phase 4 พอร์ทัลลูกค้า): ตาราง `user_identities` เตรียมไว้แล้ว ใช้ `quarkus-oidc` แล้วผูกกับ user เดิมด้วยอีเมล
- ถ้ารันหลาย instance: ย้าย rate limit (`LoginThrottle`) และ cache `session-active` ไปไว้ใน Redis
- ลิงก์ให้ลูกค้าอนุมัติใบเสนอราคา: ใช้ `quotations.public_token_hash` แบบเดียวกับ reset token (สุ่ม 256 บิต เก็บแค่ hash หมดอายุตาม valid_until)
