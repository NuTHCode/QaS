/**
 * QA Assessment System - Enterprise Edition
 * Built by Gemini Expert
 */

const SS_ID = "10rB82MIyIukDpjqdqG-oRmcIgFnEz2BOErJHIYSaPX4";
const APP_NAME = "QA Enterprise System";

function doGet() {
  setupDatabase();
  return HtmlService.createTemplateFromFile('index')
      .evaluate()
      .setTitle(APP_NAME)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// --- DATABASE SETUP ---
function setupDatabase() {
  const ss = SpreadsheetApp.openById(SS_ID);
  const sheets = {
    'users': ['uid', 'email', 'password', 'firstname', 'lastname', 'role', 'created_at'],
    'admin': ['name', 'team', 'status'],
    'supervisor': ['name', 'email', 'status'],
    'evaluation': ['id', 'form_type', 'supervisor_email', 'admin_name', 'work_date', 'eval_date', 'channel', 'case_ref', 'total_score', 'percent', 'grade', 'overall_comment', 'improvement', 'strengths'],
    'evaluation_detail': ['eval_id', 'topic', 'score', 'weight', 'comment'],
    'weight_config': ['form_name', 'topic', 'weight', 'description'],
    'audit_log': ['timestamp', 'user_email', 'action', 'details'],
    'settings': ['key', 'value']
  };

  for (let name in sheets) {
    if (!ss.getSheetByName(name)) {
      const sheet = ss.insertSheet(name);
      sheet.appendRow(sheets[name]);
      
      // Default Weight Config if new
      if (name === 'weight_config') {
        initWeightConfig(sheet);
      }
    }
  }
}

function initWeightConfig(sheet) {
  const forms = [
    "THP Supervisor - 2026", "THP Support Admin - 2026", 
    "Senior THP Admin (อายุงาน 3 เดือนขึ้นไป) - 2026",
    "New THP Admin (อายุงานไม่เก็น 3 เดือน) - 2026",
    "OS Supervisor - 2026", "Senior OS Admin (อายุงาน 3 เดือนขึ้นไป) - 2026",
    "Skill Eng. Senior Admin - 2026"
  ];
  const topics = [
    "มาตรฐานบริการ", "ทักษะการสื่อสาร", "เทคนิคการให้บริการ", 
    "Service Mind", "ความรู้ในผลิตภัณฑ์และบริการ", 
    "โอกาสในการนำเสนอสินค้าบริการ", "ความถูกต้องของการบันทึกข้อมูล"
  ];
  
  const rows = [];
  forms.forEach(f => {
    topics.forEach(t => {
      rows.push([f, t, 10, `เกณฑ์การประเมินสำหรับหัวข้อ ${t}`]);
    });
  });
  sheet.getRange(2, 1, rows.length, 4).setValues(rows);
}

// --- AUTHENTICATION ---
function hashPassword(password) {
  const signature = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
  return signature.map(byte => ('0' + (byte & 0xFF).toString(16)).slice(-2)).join('');
}

function registerUser(data) {
  const ss = SpreadsheetApp.openById(SS_ID);
  const sheet = ss.getSheetByName('users');
  const emails = sheet.getRange(2, 2, sheet.getLastRow(), 1).getValues().flat();
  
  if (emails.includes(data.email)) return { success: false, message: "อีเมลนี้ถูกใช้งานแล้ว" };
  
  const uid = Utilities.getUuid();
  sheet.appendRow([uid, data.email, hashPassword(data.password), data.firstname, data.lastname, data.role, new Date()]);
  logAction(data.email, "REGISTER", "New user registered");
  return { success: true };
}

function loginUser(email, password) {
  const ss = SpreadsheetApp.openById(SS_ID);
  const data = ss.getSheetByName('users').getDataRange().getValues();
  const hashed = hashPassword(password);
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === email && data[i][2] === hashed) {
      const user = { email: data[i][1], firstname: data[i][3], lastname: data[i][4], role: data[i][5] };
      logAction(email, "LOGIN", "User logged in");
      return { success: true, user: user };
    }
  }
  return { success: false, message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
}

// --- CORE LOGIC ---
function getWeights(formName) {
  const ss = SpreadsheetApp.openById(SS_ID);
  const data = ss.getSheetByName('weight_config').getDataRange().getValues();
  return data.filter(r => r[0] === formName).map(r => ({
    topic: r[1], weight: r[2], description: r[3]
  }));
}

function getMasterData() {
  const ss = SpreadsheetApp.openById(SS_ID);
  return {
    admins: ss.getSheetByName('admin').getDataRange().getValues().slice(1).map(r => r[0]),
    supervisors: ss.getSheetByName('supervisor').getDataRange().getValues().slice(1).map(r => r[0])
  };
}

function submitEvaluation(header, details) {
  const ss = SpreadsheetApp.openById(SS_ID);
  const evalSheet = ss.getSheetByName('evaluation');
  const detailSheet = ss.getSheetByName('evaluation_detail');
  const evalId = "EV-" + Utilities.getUuid().split('-')[0].toUpperCase();
  
  const grade = calculateGrade(header.percent);
  
  evalSheet.appendRow([
    evalId, header.form_type, header.supervisor, header.admin, header.work_date, 
    new Date(), header.channel, header.case_ref, header.total_score, 
    header.percent, grade, header.comment, header.improvement, header.strengths
  ]);
  
  details.forEach(d => {
    detailSheet.appendRow([evalId, d.topic, d.score, d.weight, d.comment]);
  });
  
  logAction(header.supervisor, "EVALUATE", `Assessed admin: ${header.admin} (Score: ${header.percent}%)`);
  return { success: true, id: evalId };
}

function calculateGrade(p) {
  if (p >= 90) return "A";
  if (p >= 80) return "B";
  if (p >= 70) return "C";
  return "D";
}

function getEvaluations() {
  const ss = SpreadsheetApp.openById(SS_ID);
  const data = ss.getSheetByName('evaluation').getDataRange().getValues();
  const headers = data[0];
  return data.slice(1).reverse().map(r => {
    let obj = {};
    headers.forEach((h, i) => obj[h] = r[i]);
    return obj;
  });
}

function getDashboardData() {
  const evals = getEvaluations();
  if (evals.length === 0) return null;

  const totalScore = evals.reduce((a, b) => a + b.percent, 0);
  const avg = totalScore / evals.length;
  
  // Admin grouping for Chart
  const adminMap = {};
  evals.forEach(e => {
    if (!adminMap[e.admin_name]) adminMap[e.admin_name] = { sum: 0, count: 0 };
    adminMap[e.admin_name].sum += e.percent;
    adminMap[e.admin_name].count++;
  });

  const chartData = Object.keys(adminMap).map(k => ({
    name: k, avg: adminMap[k].sum / adminMap[k].count
  })).sort((a,b) => b.avg - a.avg).slice(0, 5);

  return {
    avg: avg.toFixed(2),
    total: evals.length,
    gradeA: evals.filter(e => e.grade === 'A').length,
    chart: chartData,
    channels: groupData(evals, 'channel')
  };
}

function groupData(arr, key) {
  const counts = {};
  arr.forEach(x => counts[x[key]] = (counts[x[key]] || 0) + 1);
  return counts;
}

function logAction(user, action, details) {
  const ss = SpreadsheetApp.openById(SS_ID);
  ss.getSheetByName('audit_log').appendRow([new Date(), user, action, details]);
}
