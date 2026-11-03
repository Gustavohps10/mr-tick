import { AddonSettingsDialog } from '@/components/addons-manager/addon-settings-dialog'
import { useAddonSettingsDialogStore } from '@/stores/addonSettingsDialogStore'

export function AddonSettingsDialogHost() {
  const isOpen = useAddonSettingsDialogStore((s) => s.isOpen)
  const addon = useAddonSettingsDialogStore((s) => s.addon)
  const close = useAddonSettingsDialogStore((s) => s.close)

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      close()
    }
  }

  return (
    <AddonSettingsDialog
      open={isOpen}
      addon={addon}
      onOpenChange={handleOpenChange}
    />
  )
}
