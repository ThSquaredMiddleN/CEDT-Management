# src/core

บริการของกลางที่ทุกโมดูลใช้ร่วมกัน (ดูแผนของกลาง หัวข้อ 2.3)

- เขียนตารางกลางผ่านบริการในโฟลเดอร์นี้เท่านั้น เช่น `notify()`, `audit()`, `saveFile()`, `can()`
- `notify.ts` — `notify(tx, { userIds, type, module, subjectId, message, link, payload })` เขียนแจ้งเตือนหนึ่งแถวต่อผู้รับหนึ่งคน (ตัดผู้รับซ้ำ, รายการผู้รับว่างไม่ทำอะไร, คืนจำนวนแถว). `type` ต้องขึ้นต้นด้วย `<module>.` และ `link` เป็น path ในเว็บที่ขึ้นต้นด้วย `/` เท่านั้น ไม่ใช่ URL เต็ม ข้อความว่างจะ throw
- `audit.ts` — `audit(tx, { actorId, action, subjectType, subjectId, before, after, note })` เขียนหนึ่งแถวใน `audit_logs` ตารางนี้เพิ่มได้อย่างเดียว (UPDATE, DELETE, TRUNCATE ถูก trigger ปฏิเสธ). `action` ต้องเป็น `<module>.<สิ่งของ>.<การกระทำ>` (`module` คือส่วนแรก) ไม่เช่นนั้น throw. คีย์ที่มี password, token, secret หรือ api key ถูกตัดออกจาก `before` / `after` ทุกระดับ. `before` / `after` เป็น `undefined` หรือ `null` จะเก็บเป็น SQL NULL. โมดูล LINE เรียก `audit()` เมื่อผูกและยกเลิกการผูกบัญชี (`line.account.link`, `line.account.unlink`; ไม่เก็บ LINE user ID ในแถว audit)
- ทุกบริการรับ `tx` เพื่อทำงานใน transaction เดียวกับงานของโมดูล
- โค้ดในนี้ห้าม import จาก `src/modules/`
- ทุกบริการมี test ของตัวเองใน `test/core/`
- PR ที่แก้โฟลเดอร์นี้หรือ `prisma/schema/core.prisma` ติด label `shared`
