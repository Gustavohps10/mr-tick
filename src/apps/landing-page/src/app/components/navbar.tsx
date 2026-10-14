import { fetchRepositoryStars } from '@/lib/github-stars'

import { NavbarView } from './navbar-view'

export async function Navbar() {
  const stars = await fetchRepositoryStars()
  return <NavbarView stars={stars} />
}
