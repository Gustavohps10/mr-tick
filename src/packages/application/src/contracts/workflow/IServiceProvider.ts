export interface IServiceProvider {
  resolve<T>(token: string): T
  createScope(): IServiceProvider
  include<T>(deps: T): void
}
