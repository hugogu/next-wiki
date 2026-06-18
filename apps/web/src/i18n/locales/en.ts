export const en = {
  // Common
  'common.brand': 'next-wiki',
  'common.unknownAuthor': 'Unknown',
  'common.error.internalServerError': 'Internal server error',
  'common.actions.back': '← Back',
  'common.actions.cancel': 'Cancel',
  'common.actions.dismiss': 'Dismiss',

  // Languages
  'language.en': 'English',
  'language.zh': '中文',

  // Theme
  'theme.mode.light': 'Light',
  'theme.mode.dark': 'Dark',
  'theme.mode.auto': 'Auto',
  'theme.mode.autoWithResolved': 'Auto ({{resolved}})',
  'theme.toggleLabel': 'Theme: {{mode}}',

  // Auth
  'auth.fields.emailLabel': 'Email',
  'auth.fields.passwordLabel': 'Password',

  'auth.login.metadataTitle': 'Sign in',
  'auth.login.heading': 'Sign in',
  'auth.login.noAccount': "Don't have an account?",
  'auth.login.createAccountLink': 'Create one',
  'auth.login.button.submit': 'Sign in',
  'auth.login.button.submitting': 'Signing in...',
  'auth.login.error.invalidCredentials': 'Invalid email or password.',

  'auth.register.metadataTitle': 'Register',
  'auth.register.heading': 'Create an account',
  'auth.register.hasAccount': 'Already have an account?',
  'auth.register.signInLink': 'Sign in',
  'auth.register.button.submit': 'Create account',
  'auth.register.button.submitting': 'Creating account...',
  'auth.register.error.emailExists': 'An account with this email already exists.',
  'auth.register.error.generic': 'Registration failed. Please try again.',

  'auth.logout.button.submit': 'Sign out',
  'auth.logout.button.submitting': 'Signing out...',

  'auth.setPassword.metadataTitle': 'Set new password',
  'auth.setPassword.heading': 'Set a new password',
  'auth.setPassword.description':
    'Your password was reset by an administrator. Choose a new password to continue.',
  'auth.setPassword.fields.newPasswordLabel': 'New password',
  'auth.setPassword.fields.confirmPasswordLabel': 'Confirm new password',
  'auth.setPassword.validation.confirmRequired': 'Confirm your password',
  'auth.setPassword.validation.passwordsMismatch': 'Passwords do not match',
  'auth.setPassword.button.submit': 'Set new password',
  'auth.setPassword.button.submitting': 'Updating...',
  'auth.setPassword.error.generic': 'Failed to update password.',

  'auth.setup.error.alreadyConfigured': 'Setup is no longer available. An admin account already exists.',
  'auth.setup.fields.emailLabel': 'Admin email',
  'auth.setup.button.submitting': 'Creating admin...',
  'auth.setup.button.submit': 'Create admin account',
  'auth.setup.error.generic': 'Failed to create admin account.',

  'auth.error.emailExists': 'An account with this email already exists',
  'auth.error.invalidCredentials': 'Invalid email or password',
  'auth.error.signInToChangePassword': 'Sign in to change your password',
  'auth.error.passwordTooShort': 'Password must be at least 8 characters',

  // Setup page
  'setup.metadataTitle': 'First-run setup',
  'setup.heading': 'Welcome to next-wiki',
  'setup.description':
    'Create the initial admin account to get started. This screen is only available while no admins exist.',

  // Home
  'home.tagline': 'A calm, focused place for team knowledge.',
  'home.empty.title': 'No published pages yet',
  'home.empty.body': 'Pages will appear here once an editor publishes them.',
  'home.publishedPagesTitle': 'Published pages',
  'home.page.publishedOn': 'Published {{date}}',
  'home.page.updatedRecently': 'Updated recently',

  // Page read
  'page.read.draftBanner': 'This page is a draft and not yet published.',
  'page.read.createdOn': 'Created {{date}}',
  'page.read.authorSuffix': ' by {{name}}',

  // Page create
  'page.create.metadataTitle': 'New page',
  'page.create.defaultTitle': 'Create a new page',
  'page.create.error.pathExists': 'A page with this path already exists.',
  'page.create.error.forbidden': 'You do not have permission to create pages.',
  'page.create.error.generic': 'Failed to create page.',

  // Page edit
  'page.edit.metadataTitle': 'Edit {{path}}',
  'page.edit.defaultTitle': 'Untitled',
  'page.edit.validation.invalidPath': 'Invalid path',
  'page.edit.error.invalidPath': 'The new path is invalid.',
  'page.edit.error.pathExists': 'A page with this path already exists.',
  'page.edit.error.forbidden': 'You do not have permission to edit this page.',
  'page.edit.error.generic': 'Failed to save changes.',

  // Page properties
  'page.properties.metadataTitle': 'Properties: {{path}}',
  'page.properties.heading': 'Page properties',
  'page.properties.description': 'Configure the URL path and other settings for this page.',
  'page.properties.fields.pathLabel': 'URL path',
  'page.properties.fields.pathPlaceholder': 'path/to/page',
  'page.properties.fields.pathHint': 'Use slashes to create directories, e.g. {{example}}.',
  'page.properties.button.submitting': 'Saving...',
  'page.properties.button.submit': 'Save properties',
  'page.properties.error.pathExists': 'A page with this path already exists.',
  'page.properties.error.forbidden': 'You do not have permission to edit page properties.',
  'page.properties.error.generic': 'Failed to update properties.',

  // Page history
  'page.history.metadataTitle': 'History: {{path}}',
  'page.history.heading': 'Version history: {{title}}',
  'page.history.empty.title': 'No revisions visible',
  'page.history.empty.forbidden': "You do not have permission to view this page's history.",
  'page.history.versionLink': 'Version {{version}}',
  'page.history.revisionMeta': '{{date}} by {{name}}',

  // Page revision
  'page.revision.metadataTitle': 'Revision {{version}} - {{path}}',
  'page.revision.heading': 'Revision {{version}}',
  'page.revision.backToHistory': '← Back to history',
  'page.revision.publishedOn': 'Published on {{date}}',
  'page.revision.draftOn': 'Draft on {{date}}',
  'page.revision.authorSuffix': ' by {{name}}',

  // Page publish
  'page.publish.button.submit': 'Publish this revision',
  'page.publish.button.submitting': 'Publishing...',
  'page.publish.error.forbidden': 'You do not have permission to publish this revision.',
  'page.publish.error.generic': 'Failed to publish revision.',
  'page.publish.error.signInRequired': 'Sign in to publish revisions',

  // Page errors
  'page.error.notFound': 'Page not found',
  'page.error.deleteForbidden': 'You do not have permission to delete this page',
  'page.error.signInToCreate': 'Sign in to create pages',
  'page.error.createForbidden': 'You do not have permission to create pages',
  'page.error.invalidPath': 'Invalid path',
  'page.error.pathExists': 'A page with this path already exists',
  'page.error.signInToEdit': 'Sign in to edit pages',
  'page.error.editForbidden': 'You do not have permission to edit this page',
  'page.error.signInToEditProperties': 'Sign in to edit page properties',

  // Page header actions
  'page.header.edit': 'Edit page',
  'page.header.history': 'View history',
  'page.header.publish': 'Publish',
  'page.header.publishing': 'Publishing...',
  'page.header.properties': 'Page properties',
  'page.header.view': 'View page',
  'page.header.newPage': 'New page',
  'page.header.admin': 'Admin',

  // Space errors
  'space.error.defaultNotFound': 'Default space not found',

  // Revision errors
  'page.revision.error.notFound': 'Revision not found',

  // Editor
  'editor.header.save': 'Save',
  'editor.header.close': 'Close',
  'editor.header.properties': 'Page properties',

  'editor.toolbar.heading': 'Heading',
  'editor.toolbar.bold': 'Bold',
  'editor.toolbar.italic': 'Italic',
  'editor.toolbar.inlineCode': 'Inline code',
  'editor.toolbar.codeBlock': 'Code block',
  'editor.toolbar.bulletList': 'Bullet list',
  'editor.toolbar.quote': 'Quote',
  'editor.toolbar.link': 'Link',
  'editor.toolbar.undo': 'Undo',
  'editor.toolbar.redo': 'Redo',

  'editor.properties.title': 'Page properties',
  'editor.properties.fields.titleLabel': 'Title',
  'editor.properties.fields.titlePlaceholder': 'Page title',
  'editor.properties.fields.pathLabel': 'Path',
  'editor.properties.fields.pathPlaceholder': 'path/to/page',
  'editor.properties.fields.pathHint': 'Use slashes to create directories, e.g. {{example}}.',

  'editor.preview.error.invalidInput': 'Invalid input',
  'editor.preview.error.renderFailed': 'Failed to render preview',

  // Renderer
  'renderer.codeBlock.copy': 'Copy code',
  'renderer.codeBlock.copied': 'Copied',
  'renderer.mermaid.diagramButton': 'Diagram',
  'renderer.mermaid.codeButton': 'Code',

  // Layout
  'layout.header.openNav': 'Open navigator',
  'layout.nav.pagesTitle': 'Pages',
  'layout.nav.adminTitle': 'Admin',
  'layout.nav.closeButton': 'Close navigator',
  'layout.nav.empty': 'No published pages yet.',

  // Admin
  'admin.nav.users': 'Users',

  'admin.users.metadataTitle': 'User management',
  'admin.users.description': 'Manage roles, status, and passwords.',
  'admin.users.table.email': 'Email',
  'admin.users.table.role': 'Role',
  'admin.users.table.status': 'Status',
  'admin.users.table.joined': 'Joined',
  'admin.users.table.actions': 'Actions',
  'admin.users.role.reader': 'Reader',
  'admin.users.role.editor': 'Editor',
  'admin.users.role.admin': 'Admin',
  'admin.users.role.selectLabel': 'Change role for {{email}}',
  'admin.users.status.enable': 'Enable user',
  'admin.users.status.disable': 'Disable user',
  'admin.users.resetPassword.button': 'Reset password',
  'admin.users.resetPassword.confirmButton': 'Set temporary password',
  'admin.users.resetPassword.placeholder': 'Temporary password',
  'admin.users.resetPassword.successMessage': 'Temporary password set for {{email}}',
  'admin.users.resetPassword.securityHint':
    'Share this password securely. The user must set a new password on next sign-in.',
  'admin.users.error.manageForbidden': 'You do not have permission to manage users',
  'admin.users.error.cannotRemoveOwnAdmin': 'You cannot remove your own admin role',
  'admin.users.error.userNotFound': 'User not found',
  'admin.users.error.cannotDisableSelf': 'You cannot disable your own account',
  'admin.users.error.tempPasswordTooShort': 'Temporary password must be at least 8 characters',

  // Errors
  'errors.notFound.code': '404',
  'errors.notFound.message': 'This page does not exist.',
  'errors.notFound.backHome': 'Back to wiki home',
  'errors.forbidden.code': '403',
  'errors.forbidden.message': 'You do not have permission to view this page.',
  'errors.forbidden.backHome': 'Back to wiki home',
};

