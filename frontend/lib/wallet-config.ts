import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { arcTestnet } from './arc-client'

// ⚠ REQUIRED: Get a free project ID at https://dashboard.reown.com
// Create .env.local and add: NEXT_PUBLIC_REOWN_PROJECT_ID=your_project_id_here
// The app will not connect wallets without this value.
export const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? ''

export { arcTestnet }

export const wagmiAdapter = new WagmiAdapter({
  networks: [arcTestnet],
  projectId,
  ssr: true,
})
