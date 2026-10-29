import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AddonSelectOptionMedia } from './addon-select-option-media'

describe('AddonSelectOptionMedia', () => {
  it('renders initials when imageUrl is not provided', () => {
    render(<AddonSelectOptionMedia label="Canal Dev" />)
    const fallback = screen.getByTestId('addon-select-media-fallback')
    expect(fallback).toHaveTextContent('CD')
  })

  it('renders initials when single-word label is provided', () => {
    render(<AddonSelectOptionMedia label="Geral" />)
    const fallback = screen.getByTestId('addon-select-media-fallback')
    expect(fallback).toHaveTextContent('GE')
  })

  it('renders fallback when url is not https or data:image (e.g. http or file)', () => {
    render(
      <AddonSelectOptionMedia
        label="Canal Inseguro"
        imageUrl="http://insecure.test/icon.png"
      />,
    )
    const fallback = screen.getByTestId('addon-select-media-fallback')
    expect(fallback).toHaveTextContent('CI')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('renders image when url is https', () => {
    render(
      <AddonSelectOptionMedia
        label="Canal Seguro"
        imageUrl="https://cdn.discordapp.com/icons/123/abc.png"
      />,
    )
    const avatar = screen.getByTestId('addon-select-media-avatar')
    expect(avatar).toBeInTheDocument()
    const img = avatar.querySelector('img')
    expect(img).toHaveAttribute(
      'src',
      'https://cdn.discordapp.com/icons/123/abc.png',
    )
  })

  it('renders image when url is data:image', () => {
    const dataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    render(<AddonSelectOptionMedia label="Canal Data" imageUrl={dataUrl} />)
    const avatar = screen.getByTestId('addon-select-media-avatar')
    expect(avatar).toBeInTheDocument()
    const img = avatar.querySelector('img')
    expect(img).toHaveAttribute('src', dataUrl)
  })

  it('transitions to fallback without error when onError fires', () => {
    render(
      <AddonSelectOptionMedia
        label="Canal Com Erro"
        imageUrl="https://cdn.discordapp.com/invalid.png"
      />,
    )
    const img = screen
      .getByTestId('addon-select-media-avatar')
      .querySelector('img')
    expect(img).toBeInTheDocument()
    if (img) {
      fireEvent.error(img)
    }
    const fallback = screen.getByTestId('addon-select-media-fallback')
    expect(fallback).toHaveTextContent('CC')
  })

  it('preserves error by URL: new valid URL renders image and previously failed URL stays in fallback', () => {
    const failedUrl = 'https://cdn.discordapp.com/failed.png'
    const validUrl = 'https://cdn.discordapp.com/valid.png'

    const { rerender } = render(
      <AddonSelectOptionMedia label="Canal Teste" imageUrl={failedUrl} />,
    )

    const imgA = screen
      .getByTestId('addon-select-media-avatar')
      .querySelector('img')
    expect(imgA).toBeInTheDocument()
    if (imgA) fireEvent.error(imgA)

    expect(screen.getByTestId('addon-select-media-fallback')).toHaveTextContent(
      'CT',
    )

    // Rerender with new valid URL B -> should render image
    rerender(<AddonSelectOptionMedia label="Canal Teste" imageUrl={validUrl} />)
    const imgB = screen
      .getByTestId('addon-select-media-avatar')
      .querySelector('img')
    expect(imgB).toBeInTheDocument()
    expect(imgB).toHaveAttribute('src', validUrl)

    // Rerender back to failed URL A -> must immediately remain in fallback without rendering img
    rerender(
      <AddonSelectOptionMedia label="Canal Teste" imageUrl={failedUrl} />,
    )
    expect(screen.getByTestId('addon-select-media-fallback')).toHaveTextContent(
      'CT',
    )
    expect(screen.queryByTestId('addon-select-media-avatar')).toBeNull()
  })
})
