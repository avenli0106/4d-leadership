/**
 * 4D天性测评 - Google Sheets 数据收集脚本
 * 
 * 部署步骤（如果之前已经部署过，这次只需要【重新部署】第5-8步）：
 * 1. 打开 https://sheets.new 创建一个新的 Google 表格
 * 2. 点击菜单栏「扩展程序」→「Apps Script」
 * 3. 删除默认的 myFunction，把下面整段代码粘贴进去
 * 4. 点击「保存」（磁盘图标）
 * 5. 点击「部署」→「管理部署」→ 选中已有的部署 → 点击「修改」（铅笔图标）
 * 6. 版本选择「新版本」
 * 7. 点击「部署」，授权
 * 8. 复制新的 Web 应用 URL（如果URL变了，需要告诉我更新）
 */

function ensureHeaders(sheet) {
  if (sheet.getRange(1, 1).getValue() === '') {
    sheet.getRange(1, 1, 1, 11).setValues([[
      '提交时间', '用户名', '情感(F)', '直觉(N)', '逻辑(T)', '感觉(S)',
      '绿色得分', '黄色得分', '蓝色得分', '橙色得分', '主导颜色'
    ]]);
    sheet.getRange(1, 1, 1, 11).setFontWeight('bold');
  }
}

function doPost(e) {
  try {
    var jsonString = e.postData ? e.postData.contents : '{}';
    var data = JSON.parse(jsonString);
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getActiveSheet();
    ensureHeaders(sheet);
    
    var scores = data.scores || {};
    
    sheet.appendRow([
      new Date(),
      data.username || '匿名',
      data.F || 0,
      data.N || 0,
      data.T || 0,
      data.S || 0,
      scores.green || 0,
      scores.yellow || 0,
      scores.blue || 0,
      scores.orange || 0,
      data.mainColor || ''
    ]);
    
    return ContentService.createTextOutput(JSON.stringify({status: 'ok'}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({status: 'error', message: err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    var p = e.parameter || {};
    // 如果有数据参数，说明是微信内的图片ping方式提交
    if (p.username !== undefined || p.F !== undefined || p.mainColor !== undefined) {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getActiveSheet();
      ensureHeaders(sheet);
      
      sheet.appendRow([
        new Date(),
        p.username || '匿名',
        Number(p.F) || 0,
        Number(p.N) || 0,
        Number(p.T) || 0,
        Number(p.S) || 0,
        Number(p.green) || 0,
        Number(p.yellow) || 0,
        Number(p.blue) || 0,
        Number(p.orange) || 0,
        p.mainColor || ''
      ]);
      // 返回简单文本，避免图片解析报错
      return ContentService.createTextOutput('ok')
        .setMimeType(ContentService.MimeType.TEXT);
    }
    // 没有数据参数，返回健康检查
    return ContentService.createTextOutput(JSON.stringify({status: 'ok', message: '4D数据收集服务运行中'}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput('error: ' + err.toString())
      .setMimeType(ContentService.MimeType.TEXT);
  }
}
