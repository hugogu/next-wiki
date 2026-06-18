import type { Translations } from '../types';

export const zh: Translations = {
  // Common
  'common.brand': 'next-wiki',
  'common.unknownAuthor': '未知',
  'common.error.internalServerError': '服务器内部错误',
  'common.actions.back': '← 返回',
  'common.actions.cancel': '取消',
  'common.actions.dismiss': '关闭',

  // Languages
  'language.en': 'English',
  'language.zh': '中文',

  // Theme
  'theme.mode.light': '浅色',
  'theme.mode.dark': '深色',
  'theme.mode.auto': '自动',
  'theme.mode.autoWithResolved': '自动 ({{resolved}})',
  'theme.toggleLabel': '主题: {{mode}}',

  // Auth
  'auth.fields.emailLabel': '邮箱',
  'auth.fields.passwordLabel': '密码',

  'auth.login.metadataTitle': '登录',
  'auth.login.heading': '登录',
  'auth.login.noAccount': '还没有账号？',
  'auth.login.createAccountLink': '立即注册',
  'auth.login.button.submit': '登录',
  'auth.login.button.submitting': '登录中...',
  'auth.login.error.invalidCredentials': '邮箱或密码无效。',

  'auth.register.metadataTitle': '注册',
  'auth.register.heading': '创建账号',
  'auth.register.hasAccount': '已有账号？',
  'auth.register.signInLink': '登录',
  'auth.register.button.submit': '创建账号',
  'auth.register.button.submitting': '创建账号中...',
  'auth.register.error.emailExists': '该邮箱已被注册。',
  'auth.register.error.generic': '注册失败，请重试。',

  'auth.logout.button.submit': '退出登录',
  'auth.logout.button.submitting': '退出中...',

  'auth.setPassword.metadataTitle': '设置新密码',
  'auth.setPassword.heading': '设置新密码',
  'auth.setPassword.description': '管理员已重置你的密码。请设置新密码以继续。',
  'auth.setPassword.fields.newPasswordLabel': '新密码',
  'auth.setPassword.fields.confirmPasswordLabel': '确认新密码',
  'auth.setPassword.validation.confirmRequired': '请确认密码',
  'auth.setPassword.validation.passwordsMismatch': '两次输入的密码不一致',
  'auth.setPassword.button.submit': '设置新密码',
  'auth.setPassword.button.submitting': '更新中...',
  'auth.setPassword.error.generic': '更新密码失败。',

  'auth.setup.error.alreadyConfigured': '初始化已完成，管理员账号已存在。',
  'auth.setup.fields.emailLabel': '管理员邮箱',
  'auth.setup.button.submitting': '创建管理员...',
  'auth.setup.button.submit': '创建管理员账号',
  'auth.setup.error.generic': '创建管理员账号失败。',

  'auth.error.emailExists': '该邮箱已被注册',
  'auth.error.invalidCredentials': '邮箱或密码无效',
  'auth.error.signInToChangePassword': '请先登录以修改密码',
  'auth.error.passwordTooShort': '密码至少需要 8 个字符',

  // Setup page
  'setup.metadataTitle': '首次设置',
  'setup.heading': '欢迎使用 next-wiki',
  'setup.description': '创建第一个管理员账号以开始使用。此界面仅在尚未存在管理员时可用。',

  // Home
  'home.tagline': '一个宁静、专注的团队知识库。',
  'home.empty.title': '暂无已发布页面',
  'home.empty.body': '编辑者发布页面后，内容将显示在这里。',
  'home.publishedPagesTitle': '已发布页面',
  'home.page.publishedOn': '发布于 {{date}}',
  'home.page.updatedRecently': '最近更新',

  // Page read
  'page.read.draftBanner': '此页面为草稿，尚未发布。',
  'page.read.createdOn': '创建于 {{date}}',
  'page.read.authorSuffix': '，作者 {{name}}',

  // Page create
  'page.create.metadataTitle': '新建页面',
  'page.create.defaultTitle': '创建新页面',
  'page.create.error.pathExists': '该路径的页面已存在。',
  'page.create.error.forbidden': '你没有权限创建页面。',
  'page.create.error.generic': '创建页面失败。',

  // Page edit
  'page.edit.metadataTitle': '编辑 {{path}}',
  'page.edit.defaultTitle': '未命名',
  'page.edit.validation.invalidPath': '路径无效',
  'page.edit.error.invalidPath': '新路径无效。',
  'page.edit.error.pathExists': '该路径的页面已存在。',
  'page.edit.error.forbidden': '你没有权限编辑此页面。',
  'page.edit.error.generic': '保存失败。',

  // Page properties
  'page.properties.metadataTitle': '属性: {{path}}',
  'page.properties.heading': '页面属性',
  'page.properties.description': '配置此页面的 URL 路径和其他设置。',
  'page.properties.fields.pathLabel': 'URL 路径',
  'page.properties.fields.pathPlaceholder': 'path/to/page',
  'page.properties.fields.pathHint': '使用斜杠创建目录，例如 {{example}}。',
  'page.properties.button.submitting': '保存中...',
  'page.properties.button.submit': '保存属性',
  'page.properties.error.pathExists': '该路径的页面已存在。',
  'page.properties.error.forbidden': '你没有权限编辑页面属性。',
  'page.properties.error.generic': '更新属性失败。',

  // Page history
  'page.history.metadataTitle': '历史: {{path}}',
  'page.history.heading': '版本历史: {{title}}',
  'page.history.backToPage': '← {{title}}',
  'page.history.empty.title': '没有可查看的版本',
  'page.history.empty.forbidden': '你没有权限查看此页面的历史。',
  'page.history.versionLink': '版本 {{version}}',
  'page.history.revisionMeta': '{{date}}，作者 {{name}}',

  // Page revision
  'page.revision.metadataTitle': '版本 {{version}} - {{path}}',
  'page.revision.heading': '版本 {{version}}',
  'page.revision.backToHistory': '← 返回历史',
  'page.revision.publishedOn': '发布于 {{date}}',
  'page.revision.draftOn': '草稿于 {{date}}',
  'page.revision.authorSuffix': '，作者 {{name}}',

  // Page publish
  'page.publish.button.submit': '发布此版本',
  'page.publish.button.submitting': '发布中...',
  'page.publish.error.forbidden': '你没有权限发布此版本。',
  'page.publish.error.generic': '发布版本失败。',
  'page.publish.error.signInRequired': '请先登录以发布版本',

  // Page errors
  'page.error.notFound': '页面不存在',
  'page.error.deleteForbidden': '你没有权限删除此页面',
  'page.error.signInToCreate': '请先登录以创建页面',
  'page.error.createForbidden': '你没有权限创建页面',
  'page.error.invalidPath': '路径无效',
  'page.error.pathExists': '该路径的页面已存在',
  'page.error.signInToEdit': '请先登录以编辑页面',
  'page.error.editForbidden': '你没有权限编辑此页面',
  'page.error.signInToEditProperties': '请先登录以编辑页面属性',

  // Page header actions
  'page.header.edit': '编辑页面',
  'page.header.history': '查看历史',
  'page.header.publish': '发布',
  'page.header.publishing': '发布中...',
  'page.header.properties': '页面属性',
  'page.header.view': '查看页面',
  'page.header.newPage': '新建页面',
  'page.header.admin': '管理',

  // Space errors
  'space.error.defaultNotFound': '默认空间不存在',

  // Revision errors
  'page.revision.error.notFound': '版本不存在',

  // Editor
  'editor.header.save': '保存',
  'editor.header.close': '关闭',
  'editor.header.properties': '页面属性',

  'editor.toolbar.heading': '标题',
  'editor.toolbar.bold': '加粗',
  'editor.toolbar.italic': '斜体',
  'editor.toolbar.inlineCode': '行内代码',
  'editor.toolbar.codeBlock': '代码块',
  'editor.toolbar.bulletList': '无序列表',
  'editor.toolbar.quote': '引用',
  'editor.toolbar.link': '链接',
  'editor.toolbar.undo': '撤销',
  'editor.toolbar.redo': '重做',

  'editor.properties.title': '页面属性',
  'editor.properties.fields.titleLabel': '标题',
  'editor.properties.fields.titlePlaceholder': '页面标题',
  'editor.properties.fields.pathLabel': '路径',
  'editor.properties.fields.pathPlaceholder': 'path/to/page',
  'editor.properties.fields.pathHint': '使用斜杠创建目录，例如 {{example}}。',

  'editor.preview.error.invalidInput': '输入无效',
  'editor.preview.error.renderFailed': '预览渲染失败',

  // Renderer
  'renderer.codeBlock.copy': '复制代码',
  'renderer.codeBlock.copied': '已复制',
  'renderer.mermaid.diagramButton': '图表',
  'renderer.mermaid.codeButton': '代码',

  // Layout
  'layout.header.openNav': '打开导航',
  'layout.nav.pagesTitle': '页面',
  'layout.nav.adminTitle': '管理',
  'layout.nav.closeButton': '关闭导航',
  'layout.nav.empty': '暂无已发布页面。',

  // Admin
  'admin.nav.users': '用户',

  'admin.users.metadataTitle': '用户管理',
  'admin.users.description': '管理角色、状态和密码。',
  'admin.users.table.email': '邮箱',
  'admin.users.table.role': '角色',
  'admin.users.table.status': '状态',
  'admin.users.table.joined': '加入时间',
  'admin.users.table.actions': '操作',
  'admin.users.role.reader': '读者',
  'admin.users.role.editor': '编辑者',
  'admin.users.role.admin': '管理员',
  'admin.users.role.selectLabel': '修改 {{email}} 的角色',
  'admin.users.status.enable': '启用用户',
  'admin.users.status.disable': '禁用用户',
  'admin.users.resetPassword.button': '重置密码',
  'admin.users.resetPassword.confirmButton': '设置临时密码',
  'admin.users.resetPassword.placeholder': '临时密码',
  'admin.users.resetPassword.successMessage': '已为 {{email}} 设置临时密码',
  'admin.users.resetPassword.securityHint':
    '请安全地分享此密码。该用户下次登录时必须设置新密码。',
  'admin.users.error.manageForbidden': '你没有权限管理用户',
  'admin.users.error.cannotRemoveOwnAdmin': '你不能移除自己的管理员角色',
  'admin.users.error.userNotFound': '用户不存在',
  'admin.users.error.cannotDisableSelf': '你不能禁用自己的账号',
  'admin.users.error.tempPasswordTooShort': '临时密码至少需要 8 个字符',

  // Errors
  'errors.notFound.code': '404',
  'errors.notFound.message': '此页面不存在。',
  'errors.notFound.backHome': '返回首页',
  'errors.forbidden.code': '403',
  'errors.forbidden.message': '你没有权限查看此页面。',
  'errors.forbidden.backHome': '返回首页',
};
