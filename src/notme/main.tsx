import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { installLayoutFontSize } from '../lib/layoutFontSize'
import { setOptOut } from '../lib/clientId'
import { NotMePage } from './NotMePage'

/**
 * `/notme` — the owner's exclusion switch.
 *
 * Opting out is the whole point of the page, so it happens on load, before
 * React mounts and before anything could send a beacon. Every other entry
 * calls `installOptOut()` for the `?notme` form; this page IS the form.
 *
 * No analytics and no service worker here, unlike the other entries: this is
 * the one page whose job is to not be measured.
 */
installLayoutFontSize();
const applied = setOptOut(true);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NotMePage applied={applied} />
  </StrictMode>,
)
