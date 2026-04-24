/**
 * 4D天性测评 - Google Sheets 数据收集脚本
 * 
 * 部署步骤：
 * 1. 打开 https://sheets.new 创建一个新的 Google 表格
 * 2. 点击菜单栏「扩展程序」→「Apps Script」
 * 3. 删除默认的 myFunction，把下面整段代码粘贴进去
 * 4. 点击「保存」（磁盘图标）
 * 5. 点击「部署」→「新建部署」
 * 6. 类型选择「Web 应用」
 * 7. 执行身份：我
 * 8. 有权访问的人员：任何人
 * 9. 点击「部署」，授权并复制 Web 应用 URL
 * 10. 把 URL 发给前端开发人员，填入 index.html 中的 SHEET_URL 变量
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // 首次运行时写入表头
    if (sheet.getRange(1, 1).getValue() === '') {
      sheet.getRange(1, 1, 1, 10).setValues([[
        '提交时间', '情感(F)', '直觉(N)', '逻辑(T)', '感觉(S)',
        '绿色得分', '黄色得分', '蓝色得分', '橙色得分', '主导颜色'
      ]]);
      sheet.getRange(1, 1, 1, 10).setFontWeight('bold');
    }
    
    sheet.appendRow([
      new Date(),
      data.F,
      data.N,
      data.T,
      data.S,
      data.scores.green,
      data.scores.yellow,
      data.scores.blue,
      data.scores.orange,
      data.mainColor
    ]);
    
    lock.releaseLock();
    
    return ContentService.createTextOutput(JSON.stringify({status: 'ok'}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    lock.releaseLock();
    return ContentService.createTextOutput(JSON.stringify({status: 'error', message: err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({status: 'ok', message: '4D数据收集服务运行中'}))
    .setMimeType(ContentService.MimeType.JSON);
}
