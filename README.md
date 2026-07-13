# 🛡️ 6767Guard — ระบบตรวจจับอีเมล/ลิงก์ฟิชชิง

Mini Application สำหรับตรวจสอบข้อความ อีเมล ลิงก์ และ QR Code ที่น่าสงสัยว่าเป็นฟิชชิง (Phishing) หรือไม่
ประเมินความเสี่ยงเป็นคะแนน 0–100 พร้อมอธิบายสัญญาณอันตรายที่ตรวจพบ และบันทึกผลลง Google Sheets แบบเรียลไทม์

> Final Project วิชา CS100 — Smart Mini Application Development with AI Vibe Coding

## 🔗 ลิงก์โปรเจกต์

| รายการ | ลิงก์ |
|---|---|
| 🌐 Web Application | https://tanarat3815-art.github.io/6767guard/ |
| 📊 Google Sheets (ฐานข้อมูล) | https://docs.google.com/spreadsheets/d/1_VkMJ7mYsPpvCJB-Xqz-dwvwIFJwhhJjWg6K_39Rxks/edit?usp=sharing |

## 👥 สมาชิกกลุ่ม

| ชื่อ | รหัสนักศึกษา |
|---|---|
| Tanarat Chooklin | 1690702491 |
| Kittikorn Onpleng | 1690701774 |
| Thanayot Tuntikulphakdee | 1690702962 |

## ✨ ฟีเจอร์หลัก

- **วิเคราะห์ความเสี่ยงด้วยโมเดล Machine Learning** (Logistic Regression) จากคุณลักษณะ 10 ด้าน เช่น คำล่อลวง, ลิงก์ http ไม่เข้ารหัส, การใช้เลข IP, บริการย่อลิงก์, นามสกุลโดเมนเสี่ยง
- **ตรวจจับโดเมนเลียนแบบแบรนด์** (Typosquatting) ด้วย Levenshtein Distance เช่น `kbannk.com` ปลอมเป็น `kbank.com`
- **ตรวจจับโดเมนปลอมตัวอักษรต่างภาษา** (Homograph / Punycode Attack)
- **สแกน QR Code** ถอดลิงก์จากรูปภาพมาวิเคราะห์ (ป้องกันภัย Quishing)
- **Blocklist / Brands แบบไดนามิก** — แอดมินเพิ่มโดเมนอันตรายใน Google Sheets ได้ทันทีโดยไม่ต้องแก้โค้ด
- **ระบบรายงานจากผู้ใช้** (Human-in-the-loop) — ผู้ใช้ช่วยรายงานโดเมนอันตราย/ปลอดภัย รอแอดมินตรวจสอบก่อนเข้าบัญชีดำ
- **บันทึกและแสดงประวัติการตรวจสอบ** ผ่าน Google Apps Script + Google Sheets

## 🔒 ความปลอดภัยที่ออกแบบไว้

| จุด | การป้องกัน |
|---|---|
| ฝั่งเว็บ (Frontend) | ป้องกัน Stored XSS โดยแสดงข้อมูลจากฐานข้อมูลด้วย `textContent` แทน `innerHTML` |
| ฝั่งเซิร์ฟเวอร์ (Backend) | ป้องกัน Formula Injection, ตรวจสอบชนิด/ความยาวข้อมูลทุกฟิลด์ก่อนเขียนลงชีต, ใช้ LockService กันข้อมูลชนกัน |
| ฐานข้อมูล | ส่งออกเฉพาะฟิลด์ที่จำเป็น (Data Minimization) ไม่เปิดเผยข้อความที่ผู้ใช้คนอื่นวางไว้ |
| ระบบรายงาน | ไม่เพิ่มโดเมนเข้าบัญชีดำอัตโนมัติ ต้องผ่านการรีวิวโดยแอดมิน — ป้องกันการปั่นรายงาน (Poisoning) |

## 📁 ไฟล์ในโปรเจกต์

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | Frontend — หน้าเว็บ, โมเดลวิเคราะห์ความเสี่ยง, การเชื่อมต่อ API |
| `Code.gs` | Backend — Google Apps Script รับ/ส่งข้อมูลกับ Google Sheets (สำเนาของโค้ดที่ deploy จริง) |

## ⚙️ เทคโนโลยีที่ใช้

HTML / CSS / JavaScript · Logistic Regression · Google Apps Script · Google Sheets · jsQR · GitHub Pages

## 🧠 หลักการทำงานโดยย่อ

1. รับข้อความ/ลิงก์จากผู้ใช้ (พิมพ์ วาง หรือสแกน QR)
2. สกัดคุณลักษณะ 10 ด้าน (Feature Extraction)
3. คำนวณคะแนนความเสี่ยงด้วยโมเดล + กฎความปลอดภัย (Safety Override)
4. แบ่งระดับ: 🟢 ปลอดภัย (0–29) / 🟠 น่าสงสัย (30–59) / 🔴 อันตราย (60–100)
5. แสดงผลพร้อมเหตุผล และบันทึกลง Google Sheets
