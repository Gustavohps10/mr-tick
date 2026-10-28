'use client'

import type { VariantProps } from 'class-variance-authority'
import { useRef } from 'react'

import { Button, buttonVariants } from '@/components/ui/button'

type BaseButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }

type FileUploadButtonProps = {
  onFileSelect?: (files: FileList) => void
  accept?: string
  multiple?: boolean
  children: React.ReactNode
} & BaseButtonProps

export function FileUploadButton({
  onFileSelect,
  accept,
  multiple = false,
  children,
  ...props
}: FileUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleClick = () => {
    inputRef.current?.click()
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && onFileSelect) {
      onFileSelect(e.target.files)
    }
  }

  return (
    <>
      <input
        type="file"
        ref={inputRef}
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        className="hidden"
      />
      <Button type="button" onClick={handleClick} {...props}>
        {children}
      </Button>
    </>
  )
}
