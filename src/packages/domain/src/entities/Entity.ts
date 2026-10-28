export type EntityProps<T> = {
  [K in keyof T as T[K] extends Function ? never : K]: T[K]
}

export abstract class Entity {
  protected constructor() {}

  static hydrate<T extends Entity>(
    this: { prototype: T },
    data: EntityProps<T>,
  ): T {
    const entity = Object.create(this.prototype) as T

    Object.keys(data).forEach((key) => {
      const privateKey = `_${key}`
      ;(entity as any)[privateKey] = (data as any)[key]
    })

    return entity
  }
}
