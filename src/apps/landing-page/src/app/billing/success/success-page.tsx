import { Navbar } from '@/app/components/navbar'

import CheckoutSuccessView from './success-view'

export default async function CheckoutSuccessPage() {
  return <CheckoutSuccessView navbar={<Navbar />} />
}
