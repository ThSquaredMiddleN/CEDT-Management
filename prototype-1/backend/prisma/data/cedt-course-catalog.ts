/**
 * CEDT course catalog for Course Change (ลด / ถอนรายวิชา).
 *
 * Source: the course lists of the existing CEDT drop / withdraw Google Forms, as provided by the
 * Product Owner (DATA-001, 2026-10-09). Codes and names are copied verbatim — nothing invented.
 * Credits, sections and instructors are NOT part of the source and are deliberately absent.
 *
 * The two forms' lists differ slightly, but the list we received is merged, so every course is
 * announced for both drop and withdraw until the per-form split is provided
 * (docs/course-change/DATABASE.md §12).
 */

export const CATALOG_SOURCE = "cedt-google-forms";

export const CEDT_COURSE_CATALOG: { code: string; name: string }[] = [
  { code: "2110104", name: "การทำโปรแกรมคอมพิวเตอร์" },
  { code: "2110222", name: "บทนำสู่วิศวกรรมคอมพิวเตอร์และเทคโนโลยีดิจิทัล" },
  { code: "2110252", name: "ตรรกศาสตร์ของดิจิตอลคอมพิวเตอร์" },
  { code: "2110204", name: "โครงสร้างดิสครีต" },
  { code: "2110328", name: "โครงสร้างข้อมูลและขั้นตอนวิธี" },
  { code: "2110215", name: "วิธีวิทยาการทำโปรแกรม 1" },
  { code: "2110322", name: "ระบบฐานข้อมูล" },
  { code: "2110503", name: "การฝึกพัฒนาซอฟต์แวร์ Backend" },
  { code: "2110507", name: "การฝึกพัฒนาซอฟต์แวร์ 2 Frontend" },
  { code: "2110423", name: "วิศวกรรมซอฟต์แวร์" },
  { code: "2110426", name: "การปฏิบัติการวิศวกรรมซอฟต์แวร์" },
  { code: "2110205", name: "สถิติสำหรับวิทยาศาสตร์กายภาพ" },
  { code: "2110201", name: "คณิตศาสตร์วิศวกรรมคอมพิวเตอร์" },
  { code: "2110203", name: "คณิตศาสตร์วิศวกรรมคอมพิวเตอร์ 2" },
  { code: "2110403", name: "วิทยาศาสตร์ข้อมูลและวิศวกรรมข้อมูลเบื้องต้น" },
  { code: "5500203", name: "ภาษาอังกฤษที่จำเป็นสำหรับวิศวกรรมคอมพิวเตอร์และเทคโนโลยีดิจิทัล" },
  { code: "2110356", name: "ระบบฝังตัว" },
  { code: "2110313", name: "ระบบปฏิบัติการและโปรแกรมระบบ" },
  { code: "2110471", name: "ข่ายคอมพิวเตอร์ 1" },
  { code: "5500205", name: "ทักษะการสื่อสารและการนำเสนอสำหรับวิศวกรรมคอมพิวเตอร์และเทคโนโลยี" },
  { code: "2110405", name: "ปัญญาประดิษฐ์และการเรียนรู้ของเครื่อง" },
  { code: "2110488", name: "โครงการงานรวบยอดวิศวกรรมคอมพิวเตอร์ 1" },
  { code: "5500305", name: "การเขียนเชิงเทคนิคสำหรับวิศวกรรมคอมพิวเตอร์และเทคโนโลยีดิจิทัล" },
  { code: "2110506", name: "ระบบที่กำหนดโดยซอฟต์แวร์ 1" },
  { code: "2110575", name: "ระบบอินเทอร์เน็ตของสรรพสิ่งและวิธีการแก้ปัญหาทางดิจิทัล" },
  { code: "2110413", name: "ความมั่นคงของคอมพิวเตอร์" },
  { code: "2110489", name: "โครงการงานรวบยอดวิศวกรรมคอมพิวเตอร์ 2" },
  // Special topics
  { code: "2110582", name: "SP PRC TOP DT I" },
  { code: "2110583", name: "SP PRC TOP DT II" },
  { code: "2110584", name: "SP PRC TOP DT III" },
  { code: "2110585", name: "SP PRC TOP DT IV" },
  { code: "2110586", name: "SP PRC TOP DT V" },
  { code: "2110587", name: "SP PRC TOP DT VI" },
  { code: "2110588", name: "SP PRC TOP DT VII" },
  { code: "2110589", name: "SP PRC TOP DT VIII" },
  { code: "2110590", name: "SP PRC TOP DT IX" },
];
