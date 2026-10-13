import * as React from 'react'

import { Footer } from '@/app/components/footer'
import { Hero } from '@/app/components/hero'
import { Integrations } from '@/app/components/integrations'
import { Navbar } from '@/app/components/navbar'
import { OfflineArchitecture } from '@/app/components/offline-architecture'
import { Positioning } from '@/app/components/positioning'
import { Pricing } from '@/app/components/pricing'

export default function LocaleLandingPage() {
  return (
    <div className="bg-background text-foreground selection:bg-primary/30 flex min-h-screen flex-col antialiased">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <Positioning />
        <Integrations />
        <OfflineArchitecture />
        <Pricing />
      </main>
      <Footer />
    </div>
  )
}
