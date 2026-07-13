// ========================================================
//  6767Guard — Backend (Google Apps Script)  v4
//    - doPost            : บันทึกผลตรวจ + นับโดเมนซ้ำ
//    - doGet             : อ่านประวัติล่าสุด (เฉพาะฟิลด์ที่หน้าเว็บใช้)
//    - doGet?mode=config : ส่งรายชื่อ Blocklist + Brands (ไดนามิก)
//
//  แท็บที่ใช้:
//    Logs      : A=Timestamp B=RiskScore C=RiskLevel D=Signals E=InputPreview F=Domain
//    Blocklist : A = โดเมนอันตราย (แถวแรกเป็นหัวตาราง)
//    Brands    : A = โดเมนแบรนด์จริง (แถวแรกเป็นหัวตาราง)
//    Reports   : สร้างอัตโนมัติ — รายงานจากผู้ใช้ รอแอดมินรีวิว
//
//  ความปลอดภัยที่ใส่ไว้ (v4):
//    1. clean()      กัน Formula Injection (=IMPORTXML ฯลฯ) + จำกัดความยาวทุกฟิลด์
//    2. validate     riskScore ต้องเป็นเลข 0-100, riskLevel ต้องอยู่ใน whitelist
//    3. doGet        ไม่ส่ง inputPreview/domain ออกไป (data minimization)
//    4. LockService  กัน race condition ตอนมีคนบันทึกพร้อมกัน
//    5. อ่านเฉพาะช่วงเซลล์ที่จำเป็น ไม่อ่านทั้งชีต → ไม่หน่วงเมื่อข้อมูลโต
// ========================================================

const SHEET_NAME = 'Logs';
const RISK_LEVELS = ['ปลอดภัย', 'น่าสงสัย', 'อันตราย'];

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- Sanitizer: กัน Formula Injection + จำกัดความยาว ----------
// เซลล์ที่ขึ้นต้นด้วย = + - @ จะถูกชีตตีความเป็นสูตร → เติม ' นำหน้าให้เป็นข้อความธรรมดา
function clean(v, maxLen) {
  let s = (v === undefined || v === null) ? '' : String(v);
  s = s.substring(0, maxLen || 200);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return s;
}

// riskScore ต้องเป็นตัวเลข 0-100 เท่านั้น
function cleanScore(v) {
  const n = Number(v);
  if (isNaN(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

// โดเมนต้องหน้าตาเป็น hostname จริง (ตัวอักษร/เลข/จุด/ขีด ยาวไม่เกิน 100)
function cleanDomain(v) {
  const s = (v || '').toString().trim().toLowerCase().substring(0, 100);
  return /^[a-z0-9.\-]+$/.test(s) ? s : '';
}

// อ่านคอลัมน์ A ของแท็บที่ระบุ (ข้ามหัวตาราง) -> คืนเป็น array ตัวพิมพ์เล็ก
function readColumnA(ss, sheetName) {
  const sh = ss.getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return [];
  const vals = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  const out = [];
  for (let i = 0; i < vals.length; i++) {
    const v = (vals[i][0] || '').toString().trim().toLowerCase();
    if (v) out.push(v);
  }
  return out;
}

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const mode = (e && e.parameter && e.parameter.mode) || '';

    // โหมด config: ส่งรายชื่อ blocklist + brands ให้เว็บเอาไปใช้
    if (mode === 'config') {
      return jsonOut({
        status: 'ok',
        blocklist: readColumnA(ss, 'Blocklist'),
        brands: readColumnA(ss, 'Brands')
      });
    }

    // โหมดปกติ: ส่งประวัติล่าสุด — อ่านเฉพาะ N แถวท้าย ไม่อ่านทั้งชีต
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return jsonOut({ status: 'error', message: 'ไม่พบแท็บ ' + SHEET_NAME });

    const last = sheet.getLastRow();
    const n = Math.min(20, last - 1);
    if (n <= 0) return jsonOut({ status: 'ok', data: [] });

    const rows = sheet.getRange(last - n + 1, 1, n, 4).getValues().reverse();
    // data minimization: ส่งเฉพาะฟิลด์ที่หน้าเว็บแสดงจริง
    // (ไม่ส่ง inputPreview/domain เพราะอาจมีข้อมูลส่วนตัวของผู้ใช้คนอื่น)
    const result = rows.map(function (r) {
      return { timestamp: String(r[0]), riskScore: r[1], riskLevel: r[2], signals: r[3] };
    });
    return jsonOut({ status: 'ok', data: result });

  } catch (err) {
    return jsonOut({ status: 'error', message: String(err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    // กัน race condition: รอคิวเขียนสูงสุด 5 วินาที
    lock.waitLock(5000);

    const body = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const domain = cleanDomain(body.domain);
    const timestamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');

    // ---- โหมดรายงานจากผู้ใช้ (human-in-the-loop) ----
    if (body.action === 'report') {
      if (!domain) return jsonOut({ status: 'error', message: 'invalid domain' });

      let sh = ss.getSheetByName('Reports');
      if (!sh) {   // สร้างแท็บ Reports อัตโนมัติถ้ายังไม่มี
        sh = ss.insertSheet('Reports');
        sh.appendRow(['Timestamp', 'Domain', 'UserVerdict', 'SystemScore', 'Status']);
      }
      // verdict รับได้แค่ 2 ค่า
      const verdict = (String(body.verdict) === 'ปลอดภัย') ? 'ปลอดภัย' : 'อันตราย';

      // นับจำนวนที่โดเมนนี้ถูกรายงานว่า "อันตราย" มาก่อน — อ่านแค่คอลัมน์ B,C
      let unsafe = 0;
      if (sh.getLastRow() > 1) {
        const rdata = sh.getRange(2, 2, sh.getLastRow() - 1, 2).getValues();
        for (let i = 0; i < rdata.length; i++) {
          if ((rdata[i][0] || '').toString().toLowerCase() === domain &&
              (rdata[i][1] || '').toString().indexOf('อันตราย') !== -1) unsafe++;
        }
      }
      if (verdict === 'อันตราย') unsafe++;

      // ถ้าถูกรายงานอันตราย >= 5 ครั้ง ให้ขึ้นธงเตือนแอดมินให้รีวิว
      // (ตั้งใจไม่เพิ่มเข้า Blocklist อัตโนมัติ — กันคนร้าย spam รายงานเพื่อ poison ระบบ)
      const status = (verdict === 'อันตราย' && unsafe >= 5)
        ? ('⚠️ ควรรีวิว (รายงานอันตราย ' + unsafe + ' ครั้ง)') : 'pending';

      sh.appendRow([timestamp, domain, verdict, cleanScore(body.riskScore), status]);
      return jsonOut({ status: 'ok', message: 'reported', domain: domain, reportCount: unsafe });
    }

    // ---- โหมดปกติ: บันทึกผลตรวจ + นับโดเมนซ้ำ ----
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return jsonOut({ status: 'error', message: 'ไม่พบแท็บ ' + SHEET_NAME });

    // validate ทุกฟิลด์ก่อนเขียน
    const riskScore = cleanScore(body.riskScore);
    const riskLevel = (RISK_LEVELS.indexOf(String(body.riskLevel)) !== -1)
      ? String(body.riskLevel) : 'ไม่ระบุ';
    const signals = clean(body.signals, 500);
    const inputPreview = clean(body.inputPreview, 80);

    // นับโดเมนซ้ำ — อ่านแค่คอลัมน์ F ไม่อ่านทั้งชีต
    let prior = 0;
    if (domain && sheet.getLastRow() > 1) {
      const col = sheet.getRange(2, 6, sheet.getLastRow() - 1, 1).getValues();
      for (let i = 0; i < col.length; i++) {
        if ((col[i][0] || '').toString().toLowerCase() === domain) prior++;
      }
    }
    sheet.appendRow([timestamp, riskScore, riskLevel, signals, inputPreview, domain]);
    return jsonOut({ status: 'ok', message: 'saved', domain: domain, count: prior + 1 });

  } catch (err) {
    return jsonOut({ status: 'error', message: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}
