/**
 * Simplified Chinese messages.
 *
 * Flat, dotted keys rather than nested objects: `keyof typeof zh` then yields a
 * literal union of every message, which is what lets `en.ts` be declared as
 * `Record<MessageKey, string>` and make a missing or misspelled translation a
 * compile error instead of a silently untranslated string.
 *
 * Placeholders use `{name}` and are substituted by `translate()`. Markup is
 * deliberately NOT part of a message: strings that wrap `<strong>` or `<code>`
 * are split into `...Before` / `...After` halves so the template keeps the
 * markup and translators never see HTML.
 */
export const zh = {
  'admin.pageTitle': '管理 · Framefolio',
  'admin.checking': '正在检查登录状态…',
  'admin.brand': 'FRAMEFOLIO 管理',

  'common.cancel': '取消',
  'common.delete': '删除',

  'header.viewSite': '查看网站',
  'header.logout': '退出登录',

  'login.passwordLabel': '管理口令',
  'login.submit': '登录',
  'login.submitting': '登录中…',
  'login.error.empty': '请输入管理口令。',
  'login.error.invalid': '口令不正确。',
  'login.error.throttled': '尝试次数过多，请稍后再试。',
  'login.error.disabled': '管理端未启用：服务端未配置管理口令。',
  'login.error.network': '登录失败，请检查网络后重试。',

  'disabled.headline': '管理端未启用',
  'disabled.apiExplanationBefore': '服务端没有配置管理口令，因此所有',
  'disabled.apiExplanationAfter': '接口都返回 404。',
  'disabled.setEnvBefore': '设置环境变量',
  'disabled.setEnvAfter': '后重启即可启用：',
  'disabled.envComment': '# .env（与 compose 文件同目录）',
  'disabled.envExample': 'FRAMEFOLIO_ADMIN_PASSWORD=换成你自己的强口令',
  'disabled.localDev': '本地开发时直接在命令前加上变量即可：',
  'disabled.localDevExample': 'FRAMEFOLIO_ADMIN_PASSWORD=你的口令 pnpm dev',
  'disabled.publicUnaffected': '公开画廊不受影响，始终可以正常访问。',

  'reindex.headline': '索引需要重建。',
  'reindex.reason':
    '现有 data/photos.json 是旧格式，当前版本读不了，因此所有照片都显示为「待新增」。',
  'reindex.fix': '点下面的「立即同步」重建索引即可。',
  'reindex.warning': '未点同步之前，公开画廊会显示错误状态。',
  'reindex.firstRun': '首次同步会重新生成全部缩略图，之后都是增量。',

  'section.sync': '同步',
  'section.upload': '上传照片',
  'section.source': '访问源',
  'section.photos': '照片（{count}）',

  'sync.start': '立即同步',
  'sync.running': '同步中…',
  'sync.inProgress': '同步中',
  'sync.starting': '正在同步…',
  'sync.done': '同步完成。',
  'sync.doneWithFailures': '同步完成，但存在失败项，详见下方同步面板。',
  'sync.failed': '同步失败。',
  'sync.alreadyRunning': '已有同步任务在运行，正在等待其完成…',
  'sync.pollLost':
    '无法获取同步进度：与管理端的连接中断。任务可能仍在后台进行，请稍后刷新页面查看结果。',
  'sync.notice':
    '上传和删除都不会立即生效。网站上的内容只在你按下「立即同步」后才会改变。',
  'sync.pending.loading': '正在读取本地变更…',
  'sync.pending.count': '待同步 {count} 项',
  'sync.pending.clear': '本地无待同步变更',
  'sync.never': '尚未同步过',
  'sync.lastRun': '上次同步：{time}',
  'sync.progress': '{phase} · 已检查原图 {completed} / {total}',
  'sync.phase.scanning': '扫描原图',
  'sync.phase.processing': '处理中',
  'sync.phase.finalising': '收尾中',
  'sync.phase.done': '已完成',
  'sync.phase.unknown': '同步中',
  'sync.summary.added': '新增 {count}',
  'sync.summary.updated': '更新 {count}',
  'sync.summary.skipped': '跳过 {count}',
  'sync.summary.deleted': '删除 {count}',
  'sync.summary.failed': '失败 {count}',
  'sync.failedCount': '{count} 张处理失败。',
  'sync.failedHint': '失败的照片保留上一版展示，修复原图后再同步一次即可。',

  'upload.dropzone': '选择照片，或拖拽文件到这里',
  'upload.formats': '支持 JPG / PNG / WebP / TIFF',
  'upload.progress': '正在上传…（{done} / {total}）',
  'upload.item.uploading': '上传中…',
  'upload.item.done': '已上传 {size}',
  'upload.item.pending': '等待中',
  'upload.errorFallback': '上传失败',
  'upload.doneCount': '已上传 {count} 张。',
  'upload.doneStrong': '这些照片尚未出现在网站上',
  'upload.doneHint': '，请点击「立即同步」后才会展示。',
  'upload.errorCount': '{count} 张上传失败。',
  'upload.clearFinished': '清除已完成的记录',
  'upload.notice':
    '照片已上传，但尚未显示在网站上。点击「立即同步」后即可展示。',

  'photos.empty':
    '还没有照片。上传照片或把文件放进 data/originals/ 后点击「立即同步」。',
  'photos.column.preview': '预览',
  'photos.column.filename': '文件名',
  'photos.column.dimensions': '尺寸',
  'photos.column.size': '大小',
  'photos.column.state': '状态',
  'photos.column.actions': '操作',
  'photos.state.added': '待新增',
  'photos.state.changed': '待更新',
  'photos.state.pendingDelete': '待删除',
  'photos.state.unchanged': '已发布',
  'photos.delete.title': '移入回收站（需同步后才会从网站移除）',
  'photos.delete.disabledTitle': '该照片已在待删除状态',

  'delete.title': '移入回收站',
  'delete.questionBefore': '确定要将',
  'delete.questionAfter': '移入回收站吗？',
  'delete.note': '原图不会立即永久删除，仍可手动恢复。',
  'delete.noteStrong': '完成同步前，照片会继续显示在公开画廊中。',
  'delete.busy': '删除中…',
  'delete.notice':
    '已将「{filename}」移入回收站。它仍显示在网站上，点击「立即同步」后才会移除。',
  'delete.failed': '删除失败。',

  'storage.group': '访问源',
  'storage.local.label': '本地',
  'storage.local.hint': '图片由本机 /media 路由提供',
  'storage.remote.label': '对象存储（CDN）',
  'storage.remote.unconfigured': '未配置，请先设置 FRAMEFOLIO_S3_* 环境变量',
  'storage.remote.baseUrl': '基址：{url}',
  'storage.status.unconfigured':
    '已选择对象存储，但配置不完整，当前实际仍使用本地。',
  'storage.status.unreadable':
    '无法读取对象存储，暂时无法确认 R2 中的可用情况。',
  'storage.status.available': 'R2 中可用 {available} / {total} 张。',
  'storage.status.completeness': '派生图完整度 {percent}%。',
  'storage.status.missing': '缺失 {count} 个对象，点「立即同步」会补传。',
  'storage.status.orphaned': '另有 {count} 个无引用对象，下次同步会自动清理。',
  'storage.status.local':
    '当前使用本地存储。切换到对象存储不需要重新处理图片。',
  'storage.notConfigured': '对象存储未配置，当前仅使用本地存储。',
  'storage.cached.headline': '照片墙现在可能仍能正常显示，但那是缓存。',
  'storage.cached.body':
    '其中 {count} 张照片仍指向 CDN，但文件在 R2 中已不存在；浏览器和 CDN 返回的是此前缓存的副本。缓存过期后（派生图缓存一年）这些图片会变成裂图，点「立即同步」可立即补回。',
  'storage.connectionError': '无法连接对象存储：{message}',
  'storage.switchFailed': '切换访问源失败。',
  'storage.switchedToRemote':
    '访问源已切换为对象存储。刷新首页即可看到图片走 CDN。',
  'storage.switchedToLocal': '访问源已切换为本地。刷新首页即可看到图片走本地。',

  'theme.dark': '深色主题',
  'theme.light': '浅色主题',
  'theme.aria': '当前为{current}，切换到{target}',
  'theme.title': '当前：{current}（切换到{target}）',

  'locale.switch': '切换语言',
  'locale.aria': '当前语言：{current}，切换到{target}',
  'locale.title': '当前：{current}（切换到{target}）',
  'locale.zh': '简体中文',
  'locale.en': 'English',

  'version.title': '当前运行的镜像版本：{version}',

  'gallery.home': 'Framefolio 首页',
  'gallery.settings': '画廊设置',
  'gallery.layoutAria': '当前为 {current} 布局，切换到 {target} 布局',
  'gallery.layoutTitle': '当前：{current}（切换到 {target}）',
  'gallery.openPhoto': '打开照片 {filename}',
  'gallery.loading': '正在加载照片',
  'gallery.loadFailed': '照片加载失败',
  'gallery.reload': '重新加载',
  'gallery.empty': '暂无照片',
  'viewer.dialog': '照片查看器',
  'viewer.close': '关闭照片查看器',
  'viewer.closeShort': '关闭',
  'viewer.previous': '上一张照片',
  'viewer.previousShort': '上一张',
  'viewer.next': '下一张照片',
  'viewer.nextShort': '下一张',
  'viewer.metadata': '照片信息',

  'local.unknown': '操作失败，请重试。',
  'error.auth-required': '登录状态已失效，请重新登录。',
  'error.missing-admin-header': '请求缺少必要的管理端标记，请刷新页面后重试。',
  'error.invalid-filename': '文件名无效。',
  'error.missing-request-body': '请求内容为空。',
  'error.empty-upload': '上传的文件是空的。',
  'error.upload-unsupported-type': '不支持的文件类型「{extension}」。',
  'error.upload-not-an-image': '该文件不是可识别的图片。',
  'error.upload-extension-mismatch':
    '文件内容（{format}）与扩展名（{extension}）不符。',
  'error.upload-dimensions-unreadable': '无法读取图片尺寸。',
  'error.upload-too-many-pixels':
    '图片为 {width}×{height}（{pixels}），超过 {limit} 的限制。',
  'error.upload-too-large': '上传超过 {limitMb} MB 的限制。',
  'error.photo-not-found': '找不到该照片。',
  'error.trash-cross-device':
    '回收站目录位于不同的文件系统，请把它放在 originals 旁边。',
  'error.storage-source-invalid': '访问源必须是 local 或 r2。',
  'error.storage-source-unconfigured':
    '对象存储未配置，请先设置 FRAMEFOLIO_S3_* 环境变量。',
  'error.login-throttled': '尝试次数过多，请稍后再试。',
  'error.login-invalid-password': '口令不正确。',
  'error.sync-already-running': '已有同步任务在运行。'
} as const
