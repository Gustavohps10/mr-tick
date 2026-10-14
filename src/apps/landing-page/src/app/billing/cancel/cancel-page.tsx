import { Navbar } from '@/app/components/navbar'

import CheckoutCancelView from './cancel-view'

export default async function CheckoutCancelPage() {
  return <CheckoutCancelView navbar={<Navbar />} />
}
