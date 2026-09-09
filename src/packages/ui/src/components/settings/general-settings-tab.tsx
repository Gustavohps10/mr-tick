import React from 'react'

export function GeneralSettingsTab() {
  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <h3 className="text-lg font-medium">General</h3>
        <p className="text-muted-foreground text-sm">
          Configure the basic settings of the application.
        </p>
      </div>
      <div className="border-t pt-4">
        {/* Placeholder for Language selection */}
        <p className="text-muted-foreground text-sm">
          Language options will be available soon.
        </p>
      </div>
    </div>
  )
}
