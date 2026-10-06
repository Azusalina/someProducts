const en = {
 archive:'FOOTPRINT ARCHIVE',sidebarIntro:'A little further, every day.',all:'All footprints',days:'YOUR DAYS',
 connect:'Connect iPhone',localCaption:'Your phone. Your PC. Your map.',place:'HONG KONG ISLAND',backup:'Back up',
 atlas:'YOUR PERSONAL ATLAS',title:'Everyday, drawn.',intro:"Only the places you've been. Nothing else.",export:'Export trace ↗',
 sampleNotice:'Sample preview · fictional routes, never saved to your archive',sampleExit:'Return to my map',
 island:'Island view',fit:'Fit footprints',zoomIn:'Zoom in',zoomOut:'Zoom out',mapAria:'Footprint map. Drag to pan, scroll to zoom. Arrow keys pan, plus and minus zoom.',
 emptyTitle:'A blank page. A new beginning.',emptyText:'Your first sync will leave the first line.',sample:'Explore a sample',
 loading:'Loading footprints…',replay:'REPLAY',play:'Play replay',pause:'Pause replay',progress:'Replay progress',speed:'Replay duration',
 distance:'RECORDED DISTANCE',moving:'MOVING TIME',points:'LOCATION POINTS',sessions:'TRACE SEGMENTS',min:'min',hours:'h',
 accuracy:'Accuracy',device:'Device',allAccuracy:'Include all',allDevices:'All devices',
 note:'A note for this day',notePlaceholder:'Something worth remembering…',saveNote:'Save note',noteSaved:'Note saved',
 offline:'No basemap. No cloud. Just your footprints.',timezone:'Dates in Hong Kong time · UTC+8',
 localSync:'LOCAL SYNC',setupTitle:'Bring your day home.',setupIntro:'Connect your iPhone to the same Wi-Fi network as this PC. Complete these steps once.',close:'Close',
 certTitle:'Trust this PC',certText:'Scan with your iPhone camera and open in Safari to download the local certificate profile.',
 certQr:'Certificate profile QR code',copyLink:'Copy link',certInstall:'Settings → General → VPN & Device Management → Track Local Sync → Install.',
 certTrust:'Then: Settings → General → About → Certificate Trust Settings → enable full trust for Track Local CA.',
 fingerprint:'Certificate fingerprint (SHA-256)',certOnly:'This profile contains only a certificate. It does not install a VPN or device management.',
 overlandTitle:'Configure Overland',overlandText:'Scan this second code to open Overland and set the receiver, access token and device ID.',overlandQr:'Overland setup QR code',
 receiver:'Server URL',manual:'Manual configuration',token:'Access token',show:'Show',hide:'Hide',copy:'Copy',deviceId:'Device ID: iPhone. Give each phone a different ID if you add more.',
 recordTitle:'Keep the whole trace',settingAll:'Logging Mode → All Data; Locations per Batch → 200.',
 settingTracking:'Tracking Enabled → On; Location Authorization → Always; Precise Location → On.',
 settingMode:'For detailed traces: Continuous Tracking → Standard; Desired Accuracy → 10 m. Start here and check daily battery use.',
 settingPause:'For the initial continuity test: Pause Updates Automatically → Off. This uses more battery; tune it after a real walk.',
 settingSend:'Send Interval → 5 minutes; leave “Consider HTTP 2XX Successful” off.',
 sendNow:"Tap Send Now in Overland. When this PC confirms the batch, it is safely archived here and removed from the phone's pending queue.",
 troubleshoot:'If the first sync does not arrive',
 troubleshootText:'Check the Wi-Fi network, certificate trust, receiver address and access token. Allow the HTTPS upload port through your PC firewall. Guest Wi-Fi or VPN LAN blocking can prevent access; do not turn off a VPN automatically. DHCP reservations keep the PC address stable.',
 storage:'Archive directory',exportTitle:'Take your trace with you.',exportText:'Exports use the selected day, device and accuracy filter. Gaps stay separate. Original uploads remain in the database backup.',
 waiting:'Waiting for your first sync',synced:'Last sync',disconnected:'PC service unavailable',firstSync:'Waiting for an Overland upload. Tap Send Now on your iPhone.',
 received:'Archived',pointsWord:'points',daysWord:'days',copied:'Copied',copyFailed:'Select and copy the text manually.',error:'Could not complete this operation. Please retry.',
 quality:'{kept} displayed · {excluded} filtered · {gaps} breaks. Distance is an estimate.',
 noDays:'Your days will appear here.',daySubtitle:'A small part of your everyday.',dayLabel:'ONE DAY, ONE TRACE',
 filteredEmpty:'No points match these filters.',filteredText:'Try another day, device or accuracy setting.',
 noPoints:'There are no footprints to fit yet.',noteSample:'Sample notes are not saved.',
 statusReceived:'{count} points archived · last sync {time}',backupDone:'Database backup downloaded',downloaded:'Trace exported',
 confirmBackup:'Back up',pointDetail:'{time} · ±{accuracy} m · {device}',unknown:'unknown',
};
const hans = {
 archive:'行动轨迹档案',sidebarIntro:'每天，再走远一点。',all:'全部足迹',days:'记录日期',connect:'连接 iPhone',localCaption:'你的手机。你的电脑。你的地图。',
 place:'香港岛',backup:'备份',atlas:'你的个人地图',title:'日常，绘成足迹。',intro:'只留下你到过的地方。',export:'导出轨迹 ↗',
 sampleNotice:'示例预览 · 虚构路线，不会保存到你的档案',sampleExit:'返回我的地图',island:'港岛视角',fit:'适配足迹',zoomIn:'放大',zoomOut:'缩小',
 mapAria:'足迹地图。拖动平移，滚轮缩放；方向键平移，加减键缩放。',emptyTitle:'一张白纸，新的开始。',emptyText:'第一次同步，留下第一条线。',sample:'浏览示例',loading:'正在读取足迹…',
 replay:'轨迹回放',play:'播放回放',pause:'暂停回放',progress:'回放进度',speed:'回放时长',distance:'记录距离',moving:'移动时长',points:'定位点',sessions:'轨迹分段',min:'分钟',hours:'小时',
 accuracy:'定位精度',device:'设备',allAccuracy:'包含全部',allDevices:'全部设备',note:'记下这一天',notePlaceholder:'有什么值得记住…',saveNote:'保存备注',noteSaved:'备注已保存',
 offline:'没有底图，没有云端，只有你的足迹。',timezone:'日期采用香港时间 · UTC+8',localSync:'本地同步',setupTitle:'把这一天带回家。',setupIntro:'让 iPhone 与电脑连接同一个 Wi-Fi 网络。以下设置只需完成一次。',close:'关闭',
 certTitle:'信任这台电脑',certText:'使用 iPhone 相机扫码，在 Safari 下载本地证书描述文件。',certQr:'证书描述文件二维码',copyLink:'复制链接',
 certInstall:'设置 → 通用 → VPN 与设备管理 → Track Local Sync → 安装。',certTrust:'然后：设置 → 通用 → 关于本机 → 证书信任设置 → 为 Track Local CA 开启完全信任。',fingerprint:'证书指纹（SHA-256）',certOnly:'该描述文件只包含证书，不安装 VPN 或设备管理。',
 overlandTitle:'配置 Overland',overlandText:'扫描第二个二维码，打开 Overland 并设置接收地址、访问令牌和设备 ID。',overlandQr:'Overland 设置二维码',receiver:'Server URL（接收地址）',manual:'手动配置',token:'Access token（访问令牌）',show:'显示',hide:'隐藏',copy:'复制',deviceId:'Device ID：iPhone。添加更多手机时，请使用不同的 ID。',
 recordTitle:'保留完整轨迹',settingAll:'Logging Mode → All Data；Locations per Batch → 200。',settingTracking:'Tracking Enabled → On；Location Authorization → Always；精确位置 → 开启。',
 settingMode:'精细轨迹：Continuous Tracking → Standard；Desired Accuracy → 10 m。先使用此设置，再观察每日耗电。',settingPause:'初次连续性测试：Pause Updates Automatically → Off。这会增加耗电，实际步行验证后再调整。',settingSend:'Send Interval → 5 分钟；保持“Consider HTTP 2XX Successful”关闭。',
 sendNow:'在 Overland 点击 Send Now。电脑确认收到后，数据已存入本地档案，并从手机待发送队列移除。',troubleshoot:'第一次同步没有到达？',troubleshootText:'检查 Wi-Fi、证书信任、接收地址与令牌。允许电脑防火墙通过 HTTPS 上传端口。访客 Wi-Fi 或 VPN 的局域网阻断可能影响连接；请勿自动关闭 VPN。可通过 DHCP 地址保留固定电脑 IP。',
 storage:'档案目录',exportTitle:'带走你的轨迹。',exportText:'导出采用当前日期、设备及精度筛选，保留各个断点。原始上传数据保存在数据库备份中。',waiting:'等待第一次同步',synced:'最近同步',disconnected:'电脑服务不可用',firstSync:'等待 Overland 上传。请在 iPhone 点击 Send Now。',
 received:'已存档',pointsWord:'个定位点',daysWord:'天',copied:'已复制',copyFailed:'请手动选择并复制文字。',error:'操作未完成，请重试。',quality:'显示 {kept} 点 · 筛除 {excluded} 点 · {gaps} 处断点。距离为估算值。',noDays:'记录日期将在这里显示。',daySubtitle:'日常的一小部分。',dayLabel:'一天，一段足迹',filteredEmpty:'没有符合筛选的定位点。',filteredText:'试试其他日期、设备或精度。',noPoints:'还没有可适配的足迹。',noteSample:'示例备注不会保存。',statusReceived:'已存档 {count} 点 · 最近同步 {time}',backupDone:'数据库备份已下载',downloaded:'轨迹已导出',pointDetail:'{time} · 精度 ±{accuracy} 米 · {device}',unknown:'未知',
};
const hant = {
 archive:'行動軌跡檔案',sidebarIntro:'每天，再走遠一點。',all:'全部足跡',days:'記錄日期',connect:'連接 iPhone',localCaption:'你的手機。你的電腦。你的地圖。',
 place:'香港島',backup:'備份',atlas:'你的個人地圖',title:'日常，繪成足跡。',intro:'只留下你到過的地方。',export:'匯出軌跡 ↗',
 sampleNotice:'示例預覽 · 虛構路線，不會儲存至你的檔案',sampleExit:'返回我的地圖',island:'港島視角',fit:'適配足跡',zoomIn:'放大',zoomOut:'縮小',
 mapAria:'足跡地圖。拖動平移，滾輪縮放；方向鍵平移，加減鍵縮放。',emptyTitle:'一張白紙，新的開始。',emptyText:'第一次同步，留下第一條線。',sample:'瀏覽示例',loading:'正在讀取足跡…',
 replay:'軌跡回放',play:'播放回放',pause:'暫停回放',progress:'回放進度',speed:'回放時長',distance:'記錄距離',moving:'移動時長',points:'定位點',sessions:'軌跡分段',min:'分鐘',hours:'小時',
 accuracy:'定位精度',device:'裝置',allAccuracy:'包含全部',allDevices:'全部裝置',note:'記下這一天',notePlaceholder:'有甚麼值得記住…',saveNote:'儲存備註',noteSaved:'備註已儲存',
 offline:'沒有底圖，沒有雲端，只有你的足跡。',timezone:'日期採用香港時間 · UTC+8',localSync:'本地同步',setupTitle:'把這一天帶回家。',setupIntro:'讓 iPhone 與電腦連接同一個 Wi-Fi 網絡。以下設定只需完成一次。',close:'關閉',
 certTitle:'信任這台電腦',certText:'使用 iPhone 相機掃碼，在 Safari 下載本地憑證描述檔。',certQr:'憑證描述檔二維碼',copyLink:'複製連結',
 certInstall:'設定 → 一般 → VPN 與裝置管理 → Track Local Sync → 安裝。',certTrust:'然後：設定 → 一般 → 關於本機 → 憑證信任設定 → 為 Track Local CA 開啟完全信任。',fingerprint:'憑證指紋（SHA-256）',certOnly:'此描述檔只包含憑證，不安裝 VPN 或裝置管理。',
 overlandTitle:'設定 Overland',overlandText:'掃描第二個二維碼，開啟 Overland 並設定接收地址、存取權杖和裝置 ID。',overlandQr:'Overland 設定二維碼',receiver:'Server URL（接收地址）',manual:'手動設定',token:'Access token（存取權杖）',show:'顯示',hide:'隱藏',copy:'複製',deviceId:'Device ID：iPhone。加入更多手機時，請使用不同的 ID。',
 recordTitle:'保留完整軌跡',settingAll:'Logging Mode → All Data；Locations per Batch → 200。',settingTracking:'Tracking Enabled → On；Location Authorization → Always；精確位置 → 開啟。',
 settingMode:'精細軌跡：Continuous Tracking → Standard；Desired Accuracy → 10 m。先使用此設定，再觀察每日耗電。',settingPause:'初次連續性測試：Pause Updates Automatically → Off。這會增加耗電，實際步行驗證後再調整。',settingSend:'Send Interval → 5 分鐘；保持「Consider HTTP 2XX Successful」關閉。',
 sendNow:'在 Overland 點選 Send Now。電腦確認收到後，資料已存入本地檔案，並從手機待傳送佇列移除。',troubleshoot:'第一次同步沒有到達？',troubleshootText:'檢查 Wi-Fi、憑證信任、接收地址與權杖。允許電腦防火牆通過 HTTPS 上傳連接埠。訪客 Wi-Fi 或 VPN 的區域網絡阻擋可能影響連線；請勿自動關閉 VPN。可透過 DHCP 地址保留固定電腦 IP。',
 storage:'檔案目錄',exportTitle:'帶走你的軌跡。',exportText:'匯出採用目前日期、裝置及精度篩選，保留各個斷點。原始上傳資料儲存在資料庫備份中。',waiting:'等待第一次同步',synced:'最近同步',disconnected:'電腦服務無法使用',firstSync:'等待 Overland 上傳。請在 iPhone 點選 Send Now。',
 received:'已存檔',pointsWord:'個定位點',daysWord:'天',copied:'已複製',copyFailed:'請手動選取並複製文字。',error:'操作未完成，請重試。',quality:'顯示 {kept} 點 · 篩除 {excluded} 點 · {gaps} 處斷點。距離為估算值。',noDays:'記錄日期將在這裡顯示。',daySubtitle:'日常的一小部分。',dayLabel:'一天，一段足跡',filteredEmpty:'沒有符合篩選的定位點。',filteredText:'試試其他日期、裝置或精度。',noPoints:'還沒有可適配的足跡。',noteSample:'示例備註不會儲存。',statusReceived:'已存檔 {count} 點 · 最近同步 {time}',backupDone:'資料庫備份已下載',downloaded:'軌跡已匯出',pointDetail:'{time} · 精度 ±{accuracy} 米 · {device}',unknown:'未知',
};
const dictionaries = { en, 'zh-Hans':hans, 'zh-Hant':hant };
let language = 'en';
try { language = localStorage.getItem('track-language') || 'en'; } catch {}
if (!dictionaries[language]) language = 'en';
export const getLanguage = () => language;
export function t(key, params = {}) {
 let value = dictionaries[language][key] ?? en[key] ?? key;
 for (const [name, replacement] of Object.entries(params)) value = value.replaceAll(`{${name}}`, String(replacement));
 return value;
}
export function translate(next = language) {
 language = dictionaries[next] ? next : 'en';
 try { localStorage.setItem('track-language', language); } catch {}
 document.documentElement.lang = language;
 document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = t(el.dataset.i18n));
 for (const [data, attribute] of [['aria','aria-label'],['placeholder','placeholder'],['alt','alt']]) {
  document.querySelectorAll(`[data-${data}]`).forEach(el => el.setAttribute(attribute,t(el.dataset[data])));
 }
 document.getElementById('language').value = language;
}
export function dayText(day, options = {}) {
 return new Intl.DateTimeFormat(language, {timeZone:'Asia/Hong_Kong',month:'short',day:'numeric',...options}).format(new Date(`${day}T12:00:00+08:00`));
}
export function timeText(ms, date = false) {
 return new Intl.DateTimeFormat(language, {timeZone:'Asia/Hong_Kong',hour:'2-digit',minute:'2-digit',hour12:false,...(date?{month:'short',day:'numeric'}:{})}).format(new Date(ms));
}
