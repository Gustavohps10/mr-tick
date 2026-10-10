export interface IAddonNotificationsAPI {
  info(message: string, title?: string): Promise<string>
  success(message: string, title?: string): Promise<string>
  warning(message: string, title?: string): Promise<string>
  error(message: string, title?: string): Promise<string>
  loading(message: string, title?: string): Promise<string>
  dismiss(toastId: string): Promise<void>
}
