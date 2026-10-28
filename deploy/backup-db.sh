#!/usr/bin/env bash
# สำรองฐานข้อมูลเต็มรูปแบบ (กู้คืนได้ทั้งระบบ) + ไฟล์แนบ ใช้คู่กับ cron บนเซิร์ฟเวอร์ เช่น
#   30 2 * * *  /opt/ktt/deploy/backup-db.sh >> /var/log/ktt-backup.log 2>&1
# ต่างจากไฟล์ ZIP ในหน้า "สำรองข้อมูล" ซึ่งเป็น CSV สำหรับส่งต่อข้อมูล (ไม่รวมรหัสผ่าน)
set -euo pipefail

: "${PGHOST:=localhost}" "${PGPORT:=5432}" "${PGUSER:=ktt}" "${PGDATABASE:=ktt}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/ktt}"
FILES_DIR="${KTT_STORAGE_DIR:-/var/lib/ktt/files}"
KEEP_DAYS="${KEEP_DAYS:-30}"
STAMP="$(TZ=Asia/Bangkok date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/files"
umask 077

# 1) ฐานข้อมูล: custom format บีบอัดในตัว กู้ทีละตารางได้
pg_dump --format=custom --no-owner --file "$BACKUP_DIR/db/ktt-$STAMP.dump"

# 2) ไฟล์แนบ: rsync แบบ snapshot (ไฟล์ที่ไม่เปลี่ยนใช้ hard link ไม่เปลืองที่)
LAST="$(ls -1d "$BACKUP_DIR"/files/*/ 2>/dev/null | tail -n 1 || true)"
if [ -n "$LAST" ]; then
  rsync -a --delete --link-dest="$LAST" "$FILES_DIR/" "$BACKUP_DIR/files/$STAMP/"
else
  rsync -a "$FILES_DIR/" "$BACKUP_DIR/files/$STAMP/"
fi

# 3) ลบของเก่า
find "$BACKUP_DIR/db" -name 'ktt-*.dump' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR/files" -mindepth 1 -maxdepth 1 -type d -mtime +"$KEEP_DAYS" -exec rm -rf {} +

echo "$(date -Is) backup ok: $BACKUP_DIR/db/ktt-$STAMP.dump"

# กู้คืน (ทำบนฐานข้อมูลว่าง หยุด backend ก่อน):
#   createdb ktt && pg_restore --no-owner -d ktt /var/backups/ktt/db/ktt-YYYYMMDD-HHMMSS.dump
#   rsync -a /var/backups/ktt/files/YYYYMMDD-HHMMSS/ /var/lib/ktt/files/
# ควรคัดลอก $BACKUP_DIR ไปเก็บนอกเครื่องด้วย (ฮาร์ดดิสก์ภายนอก หรือที่เก็บของบริษัท)
