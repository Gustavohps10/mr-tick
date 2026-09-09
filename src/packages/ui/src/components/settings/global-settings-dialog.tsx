import React from 'react'

import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { GeneralSettingsTab } from './general-settings-tab'
import { UpdateSettingsTab } from './update-settings-tab'

export function GlobalSettingsDialog({
  isOpen,
  setIsOpen,
}: {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}) {
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="flex min-h-[400px] w-full flex-col overflow-hidden p-0 sm:max-w-[600px]">
        <div className="p-6 pb-0">
          <h2 className="text-xl leading-none font-semibold tracking-tight">
            Settings
          </h2>
        </div>

        <Tabs
          defaultValue="general"
          className="mt-4 flex min-h-0 flex-1 flex-col"
        >
          <div className="border-b px-6 pb-4">
            <TabsList className="w-fit">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="updates">Updates</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <TabsContent value="general" className="mt-0 outline-none">
              <GeneralSettingsTab />
            </TabsContent>

            <TabsContent value="updates" className="mt-0 outline-none">
              <UpdateSettingsTab />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
