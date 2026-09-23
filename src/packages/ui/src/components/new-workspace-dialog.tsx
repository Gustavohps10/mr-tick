'use client'

import React from 'react'

import { StepperForm } from '@/components/new-workspace-stepper-form'
import { Dialog, DialogContent } from '@/components/ui/dialog'

export function NewWorkspaceDialog({
  isOpen,
  setIsOpen,
  workspaceId,
  onWorkspaceCreated,
}: {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  workspaceId?: string
  onWorkspaceCreated?: (id: string) => void
}) {
  const [hasOpenChild, setHasOpenChild] = React.useState(false)

  function resetDialog() {
    setIsOpen(false)
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && hasOpenChild) return
        resetDialog()
      }}
    >
      <DialogContent
        className="w-full sm:max-w-xl"
        onInteractOutside={(e) => {
          if (hasOpenChild) e.preventDefault()
        }}
        onPointerDownOutside={(e) => {
          if (hasOpenChild) e.preventDefault()
        }}
      >
        {isOpen && (
          <StepperForm
            key={workspaceId ?? 'new'}
            workspaceId={workspaceId}
            onWorkspaceCreated={onWorkspaceCreated}
            onClose={resetDialog}
            onModalOpenChange={setHasOpenChild}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
