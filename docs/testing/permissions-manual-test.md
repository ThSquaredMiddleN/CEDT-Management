# วิธีทดสอบสิทธิ์ (บทบาทและสิทธิ์รายคน) บน localhost

วันที่: 25 พ.ย. 2026 · ใช้กับ `main` หลัง #16–#19 (ขั้นที่ 5a, 5b และ LINE `line.use`)

## 0. เตรียม

- เปิดเว็บที่ **http://localhost:5173** (backend `localhost:3000` ต้องรันอยู่)
- สลับบัญชี: มุมขวาบน → ไอคอนชื่อ → **ออกจากระบบ** แล้วล็อกอินบัญชีใหม่ (หรือเปิดหน้าต่าง Incognito แยกต่อบัญชี จะได้เทียบกันได้)
- ทุกบัญชีด้านล่างรหัสผ่าน `test1234` ยกเว้น `admin@cedt.edu` / `admin1234`

| บัญชี | บทบาท | สิทธิ์ที่ได้ |
|---|---|---|
| `student@test.local` | นิสิต (อัตโนมัติ เพราะมีรหัสนิสิต `6800000001`) | `course_change.use`, `line.use` |
| `teacher@test.local` | อาจารย์ | `bookings.use`, `course_change.view`, `course_change.manage.advise`, `line.use` |
| `staff@test.local` | เจ้าหน้าที่ (สิทธิ์เดิม) | ทุกตัว ยกเว้น `course_change.use` และ `core.permissions.manage` |
| `itadmin@test.local` | IT Admin | `core.users.view`, `core.users.manage`, `core.permissions.manage`, `core.import.manage` |
| `audit@test.local` | Audit | `.view` ทุกโมดูล + `core.users.view` (ดูได้อย่างเดียว) |
| `norole@test.local` | ไม่มี | ไม่มีสิทธิ์ใดเลย |
| `admin@cedt.edu` | เจ้าหน้าที่ + IT Admin | ทุกตัว ยกเว้น `course_change.use` |

กติกาที่กำลังทดสอบ:
- สิทธิ์ที่ใช้จริง = สิทธิ์จากบทบาทที่เปิดใช้งาน + สิทธิ์รายคน + บทบาทนิสิตถ้ามีรหัสนิสิต
- ชื่อสิทธิ์ต้องตรงตัว `manage` **ไม่** รวม `view`
- เข้า `/admin` ได้เมื่อมี `.view` ของโมดูลใดก็ได้ เมนูแต่ละอันแสดงตามสิทธิ์ของมัน
- ไม่ล็อกอิน → ไปหน้า login ล็อกอินแล้วแต่ไม่มีสิทธิ์ → หน้า **"ไม่มีสิทธิ์เข้าถึง"**
- frontend แค่ซ่อนหน้า backend เป็นตัวกันจริง (ข้อ 2)

---

## 1. เมนูและหน้า ต่อบัญชี

ล็อกอินทีละบัญชี ดูเมนูซ้ายของ `/admin` และลองพิมพ์ URL ตรงๆ ✅ = เปิดได้/เห็นเมนู · ⛔ = หน้า "ไม่มีสิทธิ์เข้าถึง" หรือไม่เห็นเมนู

| หน้า / เมนู (สิทธิ์ที่ต้องมี) | student | teacher | staff | itadmin | audit | norole |
|---|---|---|---|---|---|---|
| `/admin` (มี `.view` ใดก็ได้) | ⛔ | ✅ | ✅ | ✅ | ✅ | ⛔ |
| จัดการประกาศ `/admin/announcements` (`announcements.view`) | ⛔ | ⛔ | ✅ | ⛔ | ✅ | ⛔ |
| สร้างประกาศ `/admin/announcements/create` (`announcements.manage`) | ⛔ | ⛔ | ✅ | ⛔ | ⛔ | ⛔ |
| จัดการข่าว `/admin/news` (`news.view`) | ⛔ | ⛔ | ✅ | ⛔ | ✅ | ⛔ |
| สร้างข่าว `/admin/news/create` (`news.manage`) | ⛔ | ⛔ | ✅ | ⛔ | ⛔ | ⛔ |
| แดชบอร์ดห้อง `/admin/dashboard` (`bookings.view`) | ⛔ | ⛔ | ✅ | ⛔ | ✅ | ⛔ |
| ข้อมูลหลัก `/admin/data` (`masterdata.manage`) | ⛔ | ⛔ | ✅ | ⛔ | ⛔ | ⛔ |
| ลด-ถอนฝั่งเจ้าหน้าที่ `/admin/course-change` (`course_change.view`) | ⛔ | ✅ | ✅ | ⛔ | ✅ | ⛔ |
| Receipt checks (`receipts.view`) | ⛔ | ⛔ | ✅ | ⛔ | ✅ | ⛔ |
| การแจ้งเตือน LINE `/admin/line` (`line.use`) | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| สิทธิ์ผู้ใช้ `/admin/access` (`core.permissions.manage`) | ⛔ | ⛔ | ⛔ | ✅ | ⛔ | ⛔ |
| ขอจองห้อง `/requests/new` (`bookings.use`) | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| ลด-ถอนฝั่งนิสิต `/course-change` (`course_change.use`) | ✅ | ↪ ไปหน้าเจ้าหน้าที่ | ↪ | ⛔ | ↪ | ⛔ |
| ตั้งค่า LINE `/line` (`line.use`) | ✅ | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| หน้าแรก ปฏิทิน ประกาศ ข่าว (สาธารณะ) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

↪ = คนที่มี `course_change.view` ถูกพาไป `/admin/course-change`

สิ่งที่ต้องดูเพิ่ม:
- **audit:** เปิดหน้าประกาศ ข่าว คำร้อง ได้ แต่ **ไม่มีปุ่มสร้าง/แก้/อนุมัติ** (มีแค่ `.view`)
- **teacher:** หน้าคำร้องฝั่งเจ้าหน้าที่ ดูได้แต่ไม่มีปุ่มอนุมัติหรือทำรายการหลายรายการ (ไม่มี `course_change.manage`) ขอจองห้องแล้วคำขอเป็น **pending** (ไม่มี `bookings.manage` จึงไม่ได้อนุมัติอัตโนมัติ)
- **staff:** ขอจองห้องแล้วได้ **approved** ทันที (มี `bookings.manage`)
- **itadmin:** เมนูเห็นแค่ หน้าหลัก, สิทธิ์ผู้ใช้ (และคลังอุปกรณ์ ซึ่งยังไม่กันด้วยสิทธิ์ ดูข้อ 5)
- **ไม่ล็อกอิน:** เปิด `/admin` ต้องเด้งไปหน้า login ไม่ใช่หน้า "ไม่มีสิทธิ์"

---

## 2. backend ปฏิเสธจริง (ไม่ใช่แค่ซ่อนปุ่ม)

ล็อกอินบัญชีที่ **ไม่มี** สิทธิ์ แล้วกด F12 → Console วางคำสั่ง ต้องได้ **403** (หรือ 404 ในกรณีที่ระบุ)

```js
const call = (method, url, body) =>
  fetch(`/api/v1${url}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
    // POST/PUT always send a JSON body: an empty body with this Content-Type is rejected (400) before the permission check.
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  }).then((r) => r.status);
```

(ทุกค่าในตารางด้านล่างตรวจกับเซิร์ฟเวอร์ localhost แล้วเมื่อ 25 พ.ย. 2026)

| บัญชี | คำสั่ง | คาดหวัง |
|---|---|---|
| audit | `await call("POST", "/announcements", { title: "x", content: "x" })` | 403 (มี view ไม่มี manage) |
| teacher | `await call("GET", "/receipts")` | 403 |
| student | `await call("GET", "/users")` | 403 |
| norole | `await call("GET", "/bookings")` | 403 (ไม่มีสิทธิ์จองหรือดู) |
| norole | `await call("POST", "/line/unlink")` | 403 (ไม่มี `line.use`) |
| staff | `await call("GET", "/access/catalog")` | 403 (เจ้าหน้าที่เดิมไม่มี `core.permissions.manage`) |
| itadmin | `await call("GET", "/access/catalog")` | 200 |
| ไม่ล็อกอิน | `await call("GET", "/auth/me")` | 200 แต่ `user` เป็น null |

ตรวจว่าสิทธิ์ที่ backend เห็นตรงกับตาราง: `await fetch("/api/v1/auth/me").then((r) => r.json())` ดู `user.permissions`

---

## 3. หน้าจัดการสิทธิ์ `/admin/access`

ล็อกอิน `admin@cedt.edu` (มีทั้งเจ้าหน้าที่และ IT Admin จึงให้บทบาทอื่นได้)

**3.1 ให้บทบาท แล้วเมนูเปลี่ยนตาม**
1. ค้น `teacher` → เลือก `teacher@test.local`
2. "+ เพิ่มบทบาท" → **Audit** → ช่องที่ได้เพิ่มขึ้นเป็นเครื่องหมายสีเขียว / ช่องที่มาจากบทบาทเป็นแม่กุญแจสีฟ้า ชี้แล้วเห็น "ได้จากบทบาท: …"
3. ปุ่มด้านบนเป็น **บันทึก (1)** → กด → ช่องเหตุผลว่างแล้วกดยืนยันไม่ได้ → ใส่เหตุผล → ยืนยัน
4. หน้าต่างอื่นล็อกอิน `teacher@test.local` → เห็นเมนู จัดการประกาศ, ข่าว, แดชบอร์ด, Receipt checks เพิ่มขึ้น

**3.2 สิทธิ์รายคน (checkbox สี่สถานะ)**
1. ยังอยู่ที่ `teacher@test.local` แถว **ใบเสร็จ** คอลัมน์ **จัดการ** → คลิก → เป็น **+ สีเขียว** (จะเพิ่ม)
2. คลิกอีกครั้ง → กลับเป็นว่าง (ยกเลิกร่าง) ตัวนับลดลง
3. คลิกให้เป็น + แล้วบันทึกพร้อมเหตุผล → กลายเป็น **✓ สีฟ้า** ชี้แล้วเห็น "รายคน · เหตุผล: … · ให้โดย …"
4. คลิก ✓ สีฟ้า → เป็น **− สีแดง** (จะถอน) → บันทึก → ช่องว่าง
5. teacher ล็อกอินใหม่ แล้วเปิด Receipt checks: ระหว่างข้อ 3–4 ควรตรวจและลบใบเสร็จได้ หลังข้อ 4 ทำไม่ได้

**3.3 ให้ได้เฉพาะสิทธิ์ที่ตัวเองมี**
1. ล็อกอิน `itadmin@test.local` → `/admin/access` → เลือก `norole@test.local`
2. "+ เพิ่มบทบาท": Audit, เจ้าหน้าที่, อาจารย์ ต้องเป็นสีเทา "(ให้ได้เฉพาะสิทธิ์ที่คุณมี)" เลือกไม่ได้ IT Admin เลือกได้
3. ในตาราง ช่องที่ไม่ใช่ core เป็นสีเทาคลิกไม่ได้ แถว ผู้ใช้ / บทบาทและสิทธิ์ / นำเข้าข้อมูล คลิกได้
4. (ทดสอบ backend) ใน Console: `await call("PUT", "/access/users/<id ของ norole>", { roleIds: ["<id ของบทบาท audit>"], permissions: [], reason: "x" })` → 403 (หา id จาก `await fetch("/api/v1/access/users?q=norole").then(r=>r.json())` และ `/api/v1/access/roles`)

**3.4 บทบาทนิสิตให้หรือถอนไม่ได้**
- เลือก `student@test.local` → หัวข้อแสดง "นิสิต (อัตโนมัติ)" และบทบาทนิสิตไม่อยู่ในตัวเลือก "+ เพิ่มบทบาท"
- แถว ลด-ถอนรายวิชา / LINE คอลัมน์ ใช้งาน เป็นแม่กุญแจ ชี้แล้วเห็นว่ามาจากบทบาทนิสิต

**3.5 กัน IT Admin คนสุดท้าย**
1. ล็อกอิน `admin@cedt.edu` → เลือก `itadmin@test.local` → ถอนบทบาท IT Admin → บันทึก (ตอนนี้ยังเหลือ admin@cedt.edu จึงผ่าน)
2. เลือกตัวเอง (`admin@cedt.edu`) → ถอน IT Admin → บันทึก → ต้องขึ้น **"ต้องมี IT Admin ที่ใช้งานอยู่อย่างน้อยหนึ่งคน"** และร่างยังอยู่
3. ข้อมูลหลัก → ผู้ใช้ → ปิดใช้งาน `admin@cedt.edu` → ต้องถูกปฏิเสธด้วยข้อความเดียวกัน
4. คืนค่า: ให้ IT Admin กับ `itadmin@test.local` กลับ

**3.6 บทบาทที่ปิดใช้งานไม่ให้สิทธิ์**
1. แท็บ **บทบาท** → "+ สร้างบทบาท" key `test_helper` ชื่อ "ผู้ช่วยทดสอบ" ติ๊ก ประกาศ · ดู → บันทึกพร้อมเหตุผล
2. แท็บผู้ใช้ → ให้ `norole@test.local` บทบาท ผู้ช่วยทดสอบ → norole ล็อกอินแล้วเข้า `/admin` และเห็นเมนูประกาศ
3. แท็บบทบาท → เลือก ผู้ช่วยทดสอบ → เอาติ๊ก "เปิดใช้งาน" ออก → บันทึก
4. norole รีเฟรช → `/admin` กลับเป็น "ไม่มีสิทธิ์เข้าถึง" (ป้ายบทบาทของ norole แสดง "(ปิดใช้งาน)")
5. บทบาทระบบ (IT Admin, Audit, นิสิต) เอาติ๊ก "เปิดใช้งาน" ออกแล้วบันทึก → ถูกปฏิเสธ

**3.7 มีการเปลี่ยนแปลงที่ยังไม่บันทึก**
- แก้ช่องใดก็ได้ แล้วเลือกผู้ใช้คนอื่นหรือสลับแท็บ → ต้องถามยืนยันก่อนทิ้งร่าง
- กดรีเฟรชเบราว์เซอร์ → เบราว์เซอร์เตือน

---

## 4. ตรวจ audit log

ทุกการบันทึกในข้อ 3 ต้องเขียนหนึ่งแถวต่อหนึ่งการเปลี่ยนแปลง พร้อมเหตุผลเป็น note รันใน PowerShell:

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -d labsync -c "SELECT id, action, subject_type, note, created_at FROM audit_logs ORDER BY id DESC LIMIT 15;"
```

(ใส่ `-U <user> -h localhost` ตามที่ตั้งไว้ในเครื่อง) ต้องเห็น action เช่น `core.role.assigned`, `core.role.revoked`, `core.permission.granted`, `core.permission.revoked`, `core.role.created`, `core.role.updated` และการบันทึกที่ถูกปฏิเสธ (ข้อ 3.5 ข้อ 2) ต้อง **ไม่มี** แถว

---

## 5. ข้อจำกัดที่รู้อยู่แล้ว (ไม่ต้องรายงานเป็นบั๊ก)

- **คลังอุปกรณ์** `/admin/storage` และ `/student/storage` ยังไม่กันด้วยสิทธิ์ (storage ยังไม่มี backend และยังไม่ประกาศ `storage.*`)
- `course_change.manage.advise` ประกาศแล้วแต่ยังไม่มี route ไหนตรวจ
- ผู้ใช้ที่สร้างผ่านข้อมูลหลักได้บทบาท **เจ้าหน้าที่ (สิทธิ์เดิม)** อัตโนมัติ ต้องปรับในหน้าสิทธิ์ผู้ใช้เอง
- สิทธิ์โหลดใหม่ทุก request: ถ้าเปลี่ยนสิทธิ์คนที่ล็อกอินค้างอยู่ ให้เขารีเฟรชหน้าเพื่อให้เมนูเปลี่ยน (backend ใช้สิทธิ์ใหม่ทันที)

---

## 6. คืนค่าหลังทดสอบ

- ถอนบทบาท Audit และสิทธิ์รายคนที่ให้ teacher, ถอน ผู้ช่วยทดสอบ จาก norole, ให้ IT Admin กับ itadmin กลับ (ทำในหน้าสิทธิ์ผู้ใช้ได้หมด)
- บทบาท `test_helper` ลบไม่ได้ (บทบาทไม่ลบจริง) ปล่อยไว้แบบปิดใช้งานได้
- audit log ลบไม่ได้ (เพิ่มได้อย่างเดียวโดยออกแบบ)
- ถ้าอยากกลับไปเหมือนก่อนทดสอบทั้งหมด: กู้จากไฟล์ backup ที่ทำไว้ก่อน migrate (`pg_restore --clean -d labsync <ไฟล์ .dump>`) ซึ่งจะกลับไปเป็นข้อมูลก่อนขั้นที่ 2–5 แล้วต้อง `npx prisma migrate deploy` ใหม่
