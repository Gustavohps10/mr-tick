import { describe, expect, it } from 'vitest'

import { Either } from './Either'

describe('Either', () => {
  it('should create a success', () => {
    // Arrange
    const value = 42

    // Act
    const result = Either.success(value)

    // Assert
    expect(result.isSuccess()).toBe(true)
    expect(result.isFailure()).toBe(false)
    expect(result.success).toBe(value)
  })

  it('should create a failure', () => {
    // Arrange
    const error = new Error('fail')

    // Act
    const result = Either.failure(error)

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.isSuccess()).toBe(false)
    expect(result.failure).toBe(error)
  })

  it('should throw when accessing success on failure', () => {
    // Arrange
    const result = Either.failure(new Error('fail'))

    // Act & Assert
    expect(() => result.success).toThrow('No success value')
  })

  it('should throw when accessing failure on success', () => {
    // Arrange
    const result = Either.success(1)

    // Act & Assert
    expect(() => result.failure).toThrow('No failure value')
  })

  it('should map success value', () => {
    // Arrange
    const result = Either.success(2)

    // Act
    const mapped = result.map((x) => x * 2)

    // Assert
    expect(mapped.isSuccess()).toBe(true)
    expect(mapped.success).toBe(4)
  })

  it('should not map when failure', () => {
    // Arrange
    const error = new Error('fail')
    const result = Either.failure(error)

    // Act
    const mapped = result.map((x: number) => x * 2)

    // Assert
    expect(mapped.isFailure()).toBe(true)
    expect(mapped.failure).toBe(error)
  })

  it('should flatMap success', () => {
    // Arrange
    const result = Either.success(2)

    // Act
    const mapped = result.flatMap((x) => Either.success(x * 3))

    // Assert
    expect(mapped.isSuccess()).toBe(true)
    expect(mapped.success).toBe(6)
  })

  it('should not flatMap when failure', () => {
    // Arrange
    const error = new Error('fail')
    const result = Either.failure(error)

    // Act
    const mapped = result.flatMap((x: number) => Either.success(x * 3))

    // Assert
    expect(mapped.isFailure()).toBe(true)
    expect(mapped.failure).toBe(error)
  })

  it('should return default value with getOrElse on failure', () => {
    // Arrange
    const result = Either.failure<Error, number>(new Error('fail'))

    // Act
    const value = result.getOrElse(10)

    // Assert
    expect(value).toBe(10)
  })

  it('should return success value with getOrElse', () => {
    // Arrange
    const result = Either.success(5)

    // Act
    const value = result.getOrElse(10)

    // Assert
    expect(value).toBe(5)
  })

  it('should unwrap success value', () => {
    // Arrange
    const result = Either.success(7)

    // Act
    const value = result.unwrap()

    // Assert
    expect(value).toBe(7)
  })

  it('should unwrap failure value', () => {
    // Arrange
    const error = new Error('fail')
    const result = Either.failure(error)

    // Act
    const value = result.unwrap()

    // Assert
    expect(value).toBe(error)
  })

  it('should forward failure', () => {
    // Arrange
    const error = new Error('fail')
    const result = Either.failure(error)

    // Act
    const forwarded = result.forwardFailure<number>()

    // Assert
    expect(forwarded.isFailure()).toBe(true)
    expect(forwarded.failure).toBe(error)
  })

  it('should not call map function when failure', () => {
    // Arrange
    const error = new Error('fail')
    const result = Either.failure(error)
    const fn = vi.fn()

    // Act
    result.map(fn)

    // Assert
    expect(fn).not.toHaveBeenCalled()
  })

  it('should not call flatMap function when failure', () => {
    // Arrange
    const error = new Error('fail')
    const result = Either.failure(error)
    const fn = vi.fn()

    // Act
    result.flatMap(fn)

    // Assert
    expect(fn).not.toHaveBeenCalled()
  })

  it('should chain map operations', () => {
    // Arrange
    const result = Either.success(2)

    // Act
    const mapped = result.map((x) => x + 1).map((x) => x * 2)

    // Assert
    expect(mapped.isSuccess()).toBe(true)
    expect(mapped.success).toBe(6)
  })

  it('should chain flatMap operations', () => {
    // Arrange
    const result = Either.success(2)

    // Act
    const mapped = result
      .flatMap((x) => Either.success(x + 1))
      .flatMap((x) => Either.success(x * 2))

    // Assert
    expect(mapped.isSuccess()).toBe(true)
    expect(mapped.success).toBe(6)
  })

  it('should return failure when flatMap returns failure', () => {
    // Arrange
    const result: Either<Error, number> = Either.success(2)

    const error = new Error('fail')

    // Act
    const mapped = result.flatMap(() => Either.failure<Error, number>(error))

    // Assert
    expect(mapped.isFailure()).toBe(true)
    expect(mapped.failure).toBe(error)
  })

  it('should map to different type', () => {
    // Arrange
    const result = Either.success(2)

    // Act
    const mapped = result.map((x) => x.toString())

    // Assert
    expect(mapped.isSuccess()).toBe(true)
    expect(mapped.success).toBe('2')
  })

  it('should flatMap to different type', () => {
    // Arrange
    const result = Either.success(2)

    // Act
    const mapped = result.flatMap((x) => Either.success(x.toString()))

    // Assert
    expect(mapped.isSuccess()).toBe(true)
    expect(mapped.success).toBe('2')
  })

  it('should propagate failure correctly in flatMap branch', () => {
    // Arrange
    const error = new Error('fail')
    const result = Either.failure<Error, number>(error)

    // Act
    const mapped = result.flatMap((x) => Either.success(x * 2))

    // Assert
    expect(mapped.isFailure()).toBe(true)
    expect(mapped.failure).toBe(error)
  })

  it('should propagate failure correctly in map branch', () => {
    // Arrange
    const error = new Error('fail')
    const result = Either.failure<Error, number>(error)

    // Act
    const mapped = result.map((x) => x * 2)

    // Assert
    expect(mapped.isFailure()).toBe(true)
    expect(mapped.failure).toBe(error)
  })
})

it('distinguishes a successful undefined value from a failed undefined value', () => {
  const successful = Either.success(undefined)
  const failed = Either.failure(undefined)
  expect(successful.isSuccess()).toBe(true)
  expect(successful.success).toBeUndefined()
  expect(failed.isFailure()).toBe(true)
  expect(failed.failure).toBeUndefined()
})
