const Configs = {
  ACCOUNT_FILE_ID: "10wkXYYNX3ZbNwFNZ8DfPANeQ1OjuyJuli53wdoD1bDU",
  QUY_TRINH_XU_LY_FILE_ID: "1mPk1PuPc4Wc9fAXnRSMQHwZCrc1Ac0HLEmfN8YzQc2o",
  IMAGE_FOLDER_ID: "1C9usVIi-mzDATFE3XMLz5YC43R_cwvuf",
  RESET_PASSWORD_URL: "https://quytrinhxuly.github.io/#/reset-password",
  // TELEGRAM_BOT_TOKEN: "7164755770:AAHtBXyQySPAoagTx2_tgkx5zG6I76umrdY",
  // TELEGRAM_AUDIT_GROUP_ID: "-4100993352",
};

function doGet(request) {
  return OkResult(true, "Server running...", request);
}

// doPost function to handle POST requests
function doPost(e) {
  const endpoint = e.parameter.endpoint;
  try {
    const payload = JSON.parse(e.postData.contents);

    if (endpoint == "auth") {
      return handleAuth(payload);
    }

    if (endpoint == "reset_password") {
      return handleResetPassword(payload);
    }

    if (endpoint == "update_password") {
      return handleUpdateNewPassword(payload);
    }

    if (endpoint == "submit_ticket") {
      const authToken = payload["authToken"];
      const verify = validateBearerToken(authToken);
      if (verify.success) {
        return handleSubmitTicket(payload);
      } else {
        return ErrorResult(verify.message);
      }
    }

    if (endpoint == "upload") {
      const authToken = payload["authToken"];
      const verify = validateBearerToken(authToken);
      if (verify.success) {
        return handleUploadFile(e);
      } else {
        return ErrorResult(verify.message);
      }
    }

    return ErrorResult("Không tìm thấy yêu cầu cần xử lý !");
  } catch (error) {
    return ErrorResult("Xảy ra lỗi ở phía máy chủ !");
  }
}

// <HANDLERS>

// Completed
function handleSubmitTicket(payload) {
  const { sheets, sheetData } = payload;
  if (sheets.length == 0) {
    return ErrorResult("Không có dữ liệu, vui lòng kiểm tra lại !");
  }

  const fileId = Configs.QUY_TRINH_XU_LY_FILE_ID;
  const file = SpreadsheetApp.openById(fileId);
  for (var i = 0; i < sheets.length; i++) {
    const sheetName = sheets[i];
    const values = sheetData[sheetName];
    if (!Boolean(values) || values.length == 0) continue;
    appendData(file, sheetName, values);
    Utilities.sleep(200);
  }

  // send to telegram
  sendNotificationToTelegram(payload, "submit_ticket");

  return OkResult("Gửi yêu cầu thành công !");
}

// Completed
function handleUploadFile(e) {
  try {
    const folderId = Configs.IMAGE_FOLDER_ID;
    const payload = JSON.parse(e.postData.contents);
    const { fileName, mimeType, content } = payload;

    const date = new Date();
    const timeZone = Session.getScriptTimeZone();
    const formattedDate = Utilities.formatDate(date, timeZone, "yyyy_MM_dd");
    const fileNameFormatted = formattedDate + "_" + fileName;

    const blob = Utilities.newBlob(content, mimeType, fileNameFormatted);
    const file = DriveApp.getFolderById(folderId).createFile(blob);
    const responseObj = {
      filename: file.getName(),
      fileId: file.getId(),
      fileUrl: file.getUrl(),
    };

    return OkResult("Tải file lên thành công!", responseObj);
  } catch (error) {
    return ErrorResult("Tải file lên thất bại!");
  }
}

// Completed
function handleAuth(payload) {
  const { username, password } = payload;

  const dataValues = getAccouts();

  // Check if there's a valid account with the given username and password
  const isValid = dataValues.some(
    (data) => data[5] === true && data[0] == username && data[3] == password
  );

  if (!isValid) {
    return ErrorResult("Tài khoản hoặc mật khẩu không đúng!");
  }

  const loginUser = findAccountAndUpdateLastLogin(username, password);

  // 1 day
  const accessToken = createBearerToken(username, 60 * 24);
  const responseData = {
    token: accessToken,
    user: {
      name: loginUser[1],
      email: loginUser[2],
    },
  };

  sendNotificationToTelegram(username, "auth");

  return OkResult("Đăng nhập thành công!", responseData);
}

// Completed
function handleResetPassword(payload) {
  const { username, email } = payload;
  const tokenResetPassword = generateUUID();
  const accountIndex = findAccountIndexAndSetResetToken(
    username,
    email,
    tokenResetPassword
  );
  if (accountIndex == -1) {
    return ErrorResult("Thông tin yêu cầu không đúng!");
  }

  sendEmailResetPassword(email, tokenResetPassword);

  sendNotificationToTelegram(username + "_" + email, "reset_password");

  return OkResult("Đã gửi email đặt lại mật khẩu");
}

// Completed
function handleUpdateNewPassword(payload) {
  const { resetToken, password } = payload;
  try {
    const result = updatePasswordWithResetToken(resetToken, password);
    if (result.success) {
      sendNotificationToTelegram(result.message, "update_password");

      return OkResult("Cập nhật mật khẩu thành công!");
    }

    return ErrorResult("Cập nhật mật khẩu thất bại!");
  } catch (err) {
    return ErrorResult("Cập nhật mật khẩu thất bại!");
  }
}

// </HANDLERS>

//---------------------------------------------------------------------------------------
function OkResult(message = "", data = "") {
  return ContentService.createTextOutput(
    JSON.stringify({ success: true, message: message, data: data })
  ).setMimeType(ContentService.MimeType.JSON);
}

function ErrorResult(message = "", data = "") {
  return ContentService.createTextOutput(
    JSON.stringify({ success: false, message: message, data: data })
  ).setMimeType(ContentService.MimeType.JSON);
}

function appendData(file, sheetName, data) {
  const sheet = file.getSheetByName(sheetName);
  const lastRow = sheet.getLastRow();
  const startRow = lastRow + 1;
  const startColumn = 1;

  sheet
    .getRange(startRow, startColumn, data.length, data[0].length)
    .setValues(data);
}

function sendEmailResetPassword(recipient, tokenResetPassword) {
  const params = {
    reset_password_url:
      Configs.RESET_PASSWORD_URL + "?token=" + tokenResetPassword,
  };

  var template = HtmlService.createHtmlOutputFromFile(
    "reset_password_template"
  ).getContent();

  // Replace placeholders with actual values
  for (var key in params) {
    var placeholder = "{{" + key + "}}";
    var value = params[key];
    template = template.replace(new RegExp(placeholder, "g"), value);
  }

  var subject = "[APP_RESET_PASSWORD] Đặt lại mật khẩu của bạn!";
  MailApp.sendEmail({
    to: recipient,
    subject: subject,
    htmlBody: template,
  });
}

function getAccouts() {
  const spreadsheet = SpreadsheetApp.openById(Configs.ACCOUNT_FILE_ID);
  const sheet = spreadsheet.getSheetByName("ACCOUNTS");
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow <= 1) {
    Logger.log("No data rows found (only header row exists).");
    return [];
  }

  const dataRange = sheet.getRange(2, 1, lastRow - 1, lastColumn);
  const dataValues = dataRange.getValues();

  return dataValues;
}

function findAccountIndexAndSetResetToken(username, email, resetToken) {
  const spreadsheet = SpreadsheetApp.openById(Configs.ACCOUNT_FILE_ID);
  const sheet = spreadsheet.getSheetByName("ACCOUNTS");

  // Get all the data in the sheet
  const data = sheet.getDataRange().getValues();

  let rowIndex = -1;
  // Loop through the rows to find the matching username and email
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] != username || data[i][2] != email || data[i][5] != true) {
      continue;
    }

    const matchUserName = data[i][0] == username;
    const matchEmail = data[i][2] == email;
    const isActive = data[i][5] == true;

    if (matchUserName && matchEmail && isActive) {
      sheet.getRange(i + 1, 7).setValue(resetToken);
      rowIndex = i + 1;

      break;
    }
  }

  return rowIndex;
}

function updatePasswordWithResetToken(resetToken, password) {
  const spreadsheet = SpreadsheetApp.openById(Configs.ACCOUNT_FILE_ID);
  const sheet = spreadsheet.getSheetByName("ACCOUNTS");

  // Get all the data in the sheet
  const data = sheet.getDataRange().getValues();

  let success = false;
  let userName = "";
  // Loop through the rows to find the matching username and email
  for (let i = 0; i < data.length; i++) {
    if (data[i][6] != resetToken) {
      continue;
    }

    const matchToken = data[i][6] == resetToken;
    if (matchToken) {
      userName = data[i][0] + "_" + data[i][1];
      sheet.getRange(i + 1, 4).setValue(password);
      sheet.getRange(i + 1, 7).setValue("");
      success = true;
      break;
    }
  }

  return {
    success: success,
    message: userName,
  };
}

function findAccountAndUpdateLastLogin(username, password) {
  const spreadsheet = SpreadsheetApp.openById(Configs.ACCOUNT_FILE_ID);
  const sheet = spreadsheet.getSheetByName("ACCOUNTS");

  // Get all the data in the sheet
  const data = sheet.getDataRange().getValues();

  const now = new Date();
  // Format the date to "DD/MM/YYYY HH:MM:SS"
  const formattedDate = Utilities.formatDate(
    now,
    Session.getScriptTimeZone(),
    "dd/MM/yyyy HH:mm:ss"
  );

  // Loop through the rows to find the matching username and email
  for (let i = 0; i < data.length; i++) {
    if (
      data[i][0] != username ||
      data[i][3] != password ||
      data[i][5] != true
    ) {
      continue;
    }

    const matchUserName = data[i][0] == username;
    const matchpassword = data[i][3] == password;
    const isActive = data[i][5] == true;

    if (matchUserName && matchpassword && isActive) {
      sheet.getRange(i + 1, 5).setValue(formattedDate);
      return data[i];
    }
  }

  return null;
}

const SettingKey = {
  TELEGRAM_BOT_TOKEN: "TELEGRAM_BOT_TOKEN",
  TELEGRAM_GROUP_ID: "TELEGRAM_GROUP_ID",
};

function getSettingByKey(key) {
  const spreadsheet = SpreadsheetApp.openById(Configs.ACCOUNT_FILE_ID);
  const sheet = spreadsheet.getSheetByName("SETTINGS");
  const data = sheet.getDataRange().getValues();

  // Loop through the rows to find the matching username and email
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] != key) {
      continue;
    }

    if (data[i][0] == key) {
      return data[i];
    }
  }

  return null;
}

/**
 * data: is request data
 * request types: submit_ticket | auth | reset_password | update_password
 */
function sendNotificationToTelegram(data, requestType) {
  const groupId = getSettingByKey(SettingKey.TELEGRAM_GROUP_ID);
  const botToken = getSettingByKey(SettingKey.TELEGRAM_BOT_TOKEN);
  const telegramService = new TelegramService(groupId, botToken);
  if (requestType == "auth") {
    telegramService.sendMessage(data + " đăng nhập.");
  }

  if (requestType == "reset_password") {
    telegramService.sendMessage(data + " yêu cầu thay đổi mật khẩu.");
  }

  if (requestType == "update_password") {
    telegramService.sendMessage(data + " đã cập nhật mật khẩu.");
  }

  if (requestType == "submit_ticket") {
    const formXacMinhKhachHang = data["XAC_MINH_KHACH_HANG"] ?? [];
    const messageXacMinhKhachHang = formXacMinhKhachHang
      .map((data) => {
        return `
      + STT: ${data[2]} \n
      + Địa chỉ cửa hàng: ${data[3]} \n
      + Ảnh check-in tại cửa hàng: ${data[4]} \n
      + Ảnh sản phẩm kinh doanh: ${data[5]} \n
      + Địa chỉ cừa hàng là nơi lấy hàng?: ${data[6]} \n
      + Địa chỉ lấy hàng?: ${data[7]} \n
      + Ảnh check-in tại nơi lấy hàng: ${data[8]} \n
      `;
      })
      .join("\n\n");

    const formTinhTrangKinhDoanh = data["TINH_TRANG_KINH_DOANH"] ?? [];
    const messageTinhTrangKinhDoanh = formTinhTrangKinhDoanh
      .map((data) => {
        return `
      + STT: ${data[2]} \n
      + Khách bán Sỉ/Lẻ: ${data[3]} \n
      + Ngành hàng: ${data[4]} \n
      + Tháng cao điểm bán được hàng: ${data[5]} \n
      + Số năm bán hàng: ${data[6]} \n
      + Số nhân viên shop: ${data[7]} \n
      `;
      })
      .join("\n\n");

    const formThongTinKenhBanHang = data["THONG_TIN_KENH_BAN_HANG"] ?? [];
    const messageThongTinKenhBanHang = formThongTinKenhBanHang
      .map((data) => {
        return `
      + STT: ${data[2]} \n
      + Kênh bán hàng: ${data[3]} \n
      + Link kênh bán hàng: ${data[4]} \n
      + Lượt theo dõi hoặc thích kênh: ${data[5]} \n
      + Có chạy quảng cáo không?: ${data[6]} \n
      + Có livestream bán hàng không: ${data[7]} \n
      `;
      })
      .join("\n\n");

    const sheetData = data[sheetData][0];
    let messageTemplate = `
    ${sheetData[2]} \n
    ID: ${sheetData[18]} \n
    Họ và tên: ${data[fullname]} \n
    -----------------------------------------\n
    Thông tin người đề xuất\n
    + Mã nhân viên: ${sheetData[3]}\n
    + Đề xuất giá bán với loại dịch vụ: ${sheetData[4]}\n
    -----------------------------------------\n
    Thông tin khách hàng\n
    + Tình trạng khách hàng: ${sheetData[5]}\n
    + Mã khách hàng: ${sheetData[6]}\n
    + Sản lượng thực tế trung bình 3 tháng gần nhất: ${sheetData[7]}\n
    + Link phiếu cài giá: ${sheetData[8]}\n
    + Mô tả lý do đề xuất: ${sheetData[9]}\n
    -----------------------------------------\n
    Xác minh khách hàng\n
    ${messageXacMinhKhachHang}
    -----------------------------------------\n
    Thông tin đối thủ\n
    + Đối thủ: ${sheetData[10]}\n
    + Loại giá đang đi theo Tuyến: ${sheetData[11]}\n
    + Loại giá đang đi theo Khối lượng: ${sheetData[12]}\n
    + Màn hình sản lượng/ doanh thu đơn bên đối thủ: ${sheetData[13]}\n
    -----------------------------------------\n
    Tình trạng kinh doanh\n
    ${messageTinhTrangKinhDoanh}
    -----------------------------------------\n
    Thông tin TẤT CẢ các kênh bán hàng\n
    ${messageThongTinKenhBanHang}
    -----------------------------------------\n
    Thông tin đề xuất\n
    + Tỷ trọng đơn Nội Vùng Liên Vùng: ${sheetData[14]}\n
    + Chính sách phụ phí: ${sheetData[15]}\n
    + Ngày bắt đầu tính SL cam kết: ${sheetData[16]}\n
    `;
  }

  telegramService.sendMessage(messageTemplate);
}
