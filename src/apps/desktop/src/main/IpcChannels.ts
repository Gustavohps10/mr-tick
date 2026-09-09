export const IpcChannels = {
  WIDGET_SET_IGNORE_MOUSE: 'widget:set-ignore-mouse',
  WIDGET_TOGGLE_FLOATING_WINDOW: 'widget:toggle-floating-window',
  WIDGET_FORCE_TOPMOST: 'widget:force-topmost',
  WIDGET_START_KEY_CAPTURE: 'widget:start-key-capture',
  WIDGET_STOP_KEY_CAPTURE: 'widget:stop-key-capture',
  SYSTEM_VERSION: 'system:version',
  SYSTEM_GET_ENVIRONMENT: 'system:get-environment',
  SYSTEM_GET_DISPLAYS: 'system:get-displays',
  SYSTEM_MOVE_TO_DISPLAY: 'system:move-to-display',
  SYSTEM_MINIMIZE_WINDOW: 'system:minimize-window',
  SYSTEM_MAXIMIZE_WINDOW: 'system:maximize-window',
  SYSTEM_UNMAXIMIZE_WINDOW: 'system:unmaximize-window',
  SYSTEM_CLOSE_WINDOW: 'system:close-window',
  SYSTEM_HIDE_WINDOW: 'system:hide-window',
  SYSTEM_SHOW_WINDOW: 'system:show-window',
  SYSTEM_IS_MAXIMIZED: 'system:is-maximized',
  SYSTEM_GET_SETTINGS: 'system:get-settings',
  SYSTEM_SAVE_SETTINGS: 'system:save-settings',
  SYSTEM_TOGGLE_THEME: 'system:toggle:theme',

  METADATA_PULL: 'metadata:pull',

  TASKS_PULL: 'tasks:pull',
  TASKS_LIST: 'tasks:list',

  GET_TOKEN: 'token',
  SAVE_TOKEN: 'token:save',
  DELETE_TOKEN: 'token:delete',

  LIST_TIME_ENTRIES: 'time-entries',
  TIME_ENTRIES_PULL: 'time-entries:pull',
  TIME_ENTRIES_PUSH: 'time-entries:push',

  SET_HEADERS: 'set-headers',
  GET_HEADERS: 'get-headers',

  GET_CURRENT_USER: 'get-current-user',

  WORKSPACES_CREATE: 'workspaces:create',
  WORKSPACES_GET_ALL: 'workspaces:get-all',
  WORKSPACES_GET_BY_ID: 'workspaces:get-by-id',
  WORKSPACES_GET_CONFIG_FIELDS: 'workspaces:fields',

  WORKSPACES_LINK_DATASOURCE: 'workspaces:link-datasource',
  WORKSPACES_UNLINK_DATASOURCE: 'workspaces:unlink-datasource',
  WORKSPACES_CONNECT_DATASOURCE: 'workspaces:connect-datasource',
  WORKSPACES_DISCONNECT_DATASOURCE: 'workspaces:disconnect-datasource',
  WORKSPACES_MARK_AS_CONFIGURED: 'workspaces:mark-as-configured',
  WORKSPACES_UPDATE_IDENTITY: 'workspaces:update-identity',
  WORKSPACES_DELETE: 'workspaces:delete',

  DATA_SOURCE_GET_FIELDS: 'datasource:get-fields',

  ADDONS_LIST_AVAILABLE: 'addons:list-available',
  ADDONS_LIST_INSTALLED: 'addons:list-installed',
  ADDONS_GETINSTALLED_BY_ID: 'addons:getinstalled-by-id',
  ADDONS_GET_INSTALLER: 'addons:get-installer',
  ADDONS_UPDATE_LOCAL: 'addons:update-local',
  ADDONS_IMPORT: 'addons:import',
  ADDONS_INSTALL: 'addons:install',
  ADDONS_UNINSTALL: 'addons:uninstall',
  ADDONS_GET_SIDEBAR_MENUS: 'addons:get-sidebar-menus',

  ADDONS_GET_TIMERBAR_MENUS: 'addons:get-timerbar-menus',
  ADDONS_EXECUTE_COMMAND: 'addons:execute-command',
  ADDONS_SHOW_TOAST: 'addons:show-toast',
  ADDONS_DISMISS_TOAST: 'addons:dismiss-toast',
  ADDON_GET_SCHEMA: 'addon:get-schema',
  ADDON_GET_SETTINGS: 'addon:get-settings',
  ADDON_SAVE_SETTINGS: 'addon:save-settings',
  ADDON_EXECUTE_ACTION: 'addon:execute-action',
  ADDONS_SET_ACTIVE_WORKSPACE: 'addons:set-active-workspace',
  ADDONS_GET_ACTIVE_THEME: 'addons:get-active-theme',
  ADDONS_SET_ACTIVE_THEME: 'addons:set-active-theme',

  UPDATER_CHECK: 'updater:check',
  UPDATER_DOWNLOAD: 'updater:download',
  UPDATER_INSTALL: 'updater:install',
} as const

export type IpcChannelType = keyof typeof IpcChannels
